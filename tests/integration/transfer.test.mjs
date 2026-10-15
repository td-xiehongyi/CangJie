import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile,writeFile,readdir,cp} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const root=process.cwd();
test('T7 frozen templates execute against registration with new evidence',{timeout:180000},async t=>{
  assert.ok(existsSync('samples/registration/verification.json'),'registration project must exist');
  const {TemplateRegistry}=await import('../../apps/host/dist/templates/store.js');
  const {ArtifactStore}=await import('../../apps/host/dist/artifacts/store.js');
  const {RunExecutor,confirmPlan}=await import('../../apps/host/dist/replay.js');
  const {CredentialSession}=await import('../../apps/host/dist/execution/session.js');
  const {inspectProject}=await import('../../apps/host/dist/projects/inspect.js');
  const {capabilities}=await import('../../apps/host/dist/validation/observations.js');
  const {exportPackage}=await import('../../apps/host/dist/manifest.js');
  const frozen=JSON.parse(await readFile('docs/evidence/t7-freeze.json','utf8'));
  for(const [path,hash]of Object.entries(frozen.files)){
    let bytes=await readFile(path);
    // T8 adds only a separate protocol operation; verify the historical T7
    // bytes after removing that exact extension. All business logic stays frozen.
    if(path==='apps/core/src/protocol.cj'){
      const extension='if (operation=="loadDecision") {\n                    try { emit(messageId,runId,"completed","OK",loadDecision(payload)) }\n                    catch (e: Exception) { emit(messageId,runId,"error",e.message,JsonNull()) }\n                } else if (';
      const text=bytes.toString('utf8').replace(/\r\n/g,'\n');assert.equal(text.split(extension).length,2,'only the reviewed T8 extension is permitted');
      bytes=Buffer.from(text.replace(extension,'if ('));
    }
    // S4 adds explicit expected-rejection verdicts. Project only these exact
    // reviewed extensions back to the historical T7 bytes; all other edits fail.
    const extensions={
      'apps/core/src/scheduler.cj':[
        'if (reason.isEmpty() && acceptance!=expected) {\n            reason=if (expected=="rejected" && acceptance=="accepted") { "EXPECTED_REJECTION_VIOLATED" } else { "UNEXPECTED_ACCEPTANCE" }\n        }',
        'if (reason.isEmpty() && acceptance!=expected) { reason="UNEXPECTED_ACCEPTANCE" }'],
      'apps/core/src/verdict.cj':[
        'if (reason=="EXPECTED_REJECTION_VIOLATED") { status="fail" }\n    else if (reason.isEmpty()) {',
        'if (reason.isEmpty()) {'],
    };
    if(extensions[path]){const [extension,historical]=extensions[path],text=bytes.toString('utf8');assert.equal(text.split(extension).length,2,'only the reviewed S4 extension is permitted');bytes=Buffer.from(text.replace(extension,historical));}
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,`frozen file changed: ${path}`);
  }
  const {restoreFixture}=await import('../../scripts/t7-fixture.mjs');
  const restored=await restoreFixture(root);
  const registry=new TemplateRegistry(restored.registry),directory=join(root,'.local-data/transfer-runs',randomUUID()),store=new ArtifactStore(directory);
  const before=await Promise.all((await readdir(join(registry.directory,'published'))).sort().map(async f=>[f,await readFile(join(registry.directory,'published',f),'utf8')]));
  const credentials=new CredentialSession(),projectId='registration-transfer';
  credentials.set(projectId,'owner','synthetic-registration-owner');credentials.set(projectId,'other','synthetic-registration-other');t.after(()=>credentials.close());
  const publications=frozen.publications;
  const results=[];
  async function run(source,selected=publications,mappingEdit,expectedStatus='completed'){
    const profile=await inspectProject(source);assert.equal(profile.supported,true,JSON.stringify(profile.gaps));
    const mapping=structuredClone(profile.mapping);mappingEdit?.(mapping);
    const plan=confirmPlan({projectId,flow:{id:'registration',title:'报名提交及资料编辑'},checks:selected.map(p=>({rule:p.rule,templateRef:p.ref,mode:'verify'})),mapping,sourceHash:profile.sourceHash});
    const env={source,projectId,confirmed:true,data:{source:'synthetic',count:2,seedVersion:'registration-seed-v1'},accounts:[{actorRef:'owner',username:'participant-a',userId:'registrant-a',role:'user'},{actorRef:'other',username:'participant-b',userId:'registrant-b',role:'user'}],credentials};
    const record=await new RunExecutor(registry,store).run(plan,env);
    assert.equal(record.status,expectedStatus,JSON.stringify(record.uncovered));results.push(record);
    return record;
  }
  await t.test('three seeds and field-preservation candidate pass with registration HTTP evidence',async()=>{
    const record=await run(join(root,'samples/registration'));
    assert.equal(record.checks.length,4);
    for(const c of record.checks){assert.ok(c.verdicts.length);assert.ok(c.verdicts.every(v=>v.status==='pass'),JSON.stringify(c.verdicts));assert.ok(c.actions.length);assert.ok(c.observations.length);assert.notEqual(c.copyId,publications.find(p=>p.rule.id===c.rule.id).trial.copyId);for(const o of c.observations)for(const ref of o.evidenceRefs)assert.ok(record.evidence[`${c.copyId}/${ref.slice(9)}`]);}
    assert.ok(JSON.stringify(record.evidence).includes('/enrollments'));
    const pkg=await exportPackage(store,record.id);await writeFile(join(directory,'registration-package.json'),JSON.stringify(pkg,null,2));
    assert.ok(!JSON.stringify(pkg).includes('synthetic-registration-owner'));
  });
  for(const [name,replaceWith]of [['wrong-count','records:records.length+1'],['conflicting-alias','records:records.length,tickets:records.length+1']])await t.test(`invalid registration baseline ${name} blocks before HTTP actions`,async()=>{
    const source=join(directory,name);await cp(join(root,'samples/registration'),source,{recursive:true});
    const path=join(source,'src/db.ts'),original=await readFile(path,'utf8');assert.ok(original.includes('records:records.length'));
    await writeFile(path,original.replace('records:records.length',replaceWith));
    const record=await run(source,[publications[0]],undefined,'blocked');
    assert.ok(record.uncovered.includes('BASELINE_MISMATCH'));assert.equal(record.checks[0].actions.length,0);
  });
  await t.test('missing preserved field produces unknown rather than inherited success',async()=>{
    const record=await run(join(root,'samples/registration'),[publications[3]],m=>{m.resultBindings.query.priority=['entries','0','unavailable'];});
    assert.equal(record.checks[0].verdicts.find(v=>v.assertionRef==='unchanged-priority')?.status,'inconclusive');
  });
  // Private evaluation-only source mutations. No expected labels go to RunExecutor or a model.
  for(const [name,sql,expected]of [
    ['track-reset',"UPDATE enrollments SET track='standard' WHERE id=?",{'updated-title':'pass','unchanged-priority':'fail','unchanged-owner':'pass'}],
    ['owner-change',"UPDATE enrollments SET ownerId='registrant-b' WHERE id=?",{'updated-title':'pass','unchanged-priority':'pass','unchanged-owner':'fail'}],
  ])await t.test(`registration ${name} is detected by the frozen candidate`,async()=>{
    const source=join(directory,name);await cp(join(root,'samples/registration'),source,{recursive:true});
    const path=join(source,'src/server.ts'),original=await readFile(path,'utf8');
    const needle="res.json(db.prepare('SELECT * FROM enrollments WHERE id=?').get(id));";
    assert.ok(original.includes(needle));
    await writeFile(path,original.replace(needle,`db.prepare(${JSON.stringify(sql)}).run(id);${needle}`));
    const record=await run(source,[publications[3]]);
    assert.deepEqual(Object.fromEntries(record.checks[0].verdicts.map(v=>[v.assertionRef,v.status])),expected);
  });
  await t.test('changed business semantics are rejected before any project execution',async()=>{
    const rule=structuredClone(publications[3].rule);rule.invariants=['editing a registration resets its track to standard'];
    assert.equal((await registry.matchTemplates(capabilities,[rule])).length,0);
    const profile=await inspectProject(join(root,'samples/registration'));
    const plan=confirmPlan({projectId,flow:{id:'registration',title:'报名编辑'},checks:[{rule,templateRef:publications[3].ref,mode:'verify'}],mapping:profile.mapping,sourceHash:profile.sourceHash});
    await assert.rejects(new RunExecutor(registry,store).run(plan,{source:profile.root,projectId,confirmed:true,credentials}),/RULE_VERSION_MISMATCH/);
  });
  await t.test('same publications remain qualified and unchanged without republication',async()=>{
    for(const p of publications)assert.deepEqual(await registry.assertQualified(p.ref),p);
    const after=await Promise.all((await readdir(join(registry.directory,'published'))).sort().map(async f=>[f,await readFile(join(registry.directory,'published',f),'utf8')]));assert.deepEqual(after,before);
  });
  await writeFile(join(directory,'summary.json'),JSON.stringify({frozenAt:frozen.frozenAt,registry:registry.directory,runs:results.map(r=>({id:r.id,projectId:r.projectId,checks:r.checks.map(c=>({rule:c.rule.id,copyId:c.copyId,verdicts:c.verdicts}))}))},null,2));
  console.log('T7 evidence: '+directory);
});
