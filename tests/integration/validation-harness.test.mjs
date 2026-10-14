import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {validateContract} from '../../packages/contracts/dist/validate.js';
const root=new URL('../../',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
async function api(){assert.ok(existsSync(new URL('apps/host/dist/validation/reference-runner.js',root)),'T3 independent validation runner must exist');return import('../../apps/host/dist/validation/reference-runner.js');}
const records=[];
test('independent controls cannot hide non-executable title defaults',async()=>{
  const a=await api(),spec=await json('tests/fixtures/title-update.json');
  spec.parameters={title:{type:'string'},newTitle:{type:'string'}};
  const result=await a.validateAgainstSuite(spec,await a.loadValidationSuite('title-update-rule'));
  assert.equal(result.gateResults.static,false);assert.equal(result.gateResults.admitted,false);
  assert.equal(result.cases.length,0);
});
for(const [file,rule] of [['saved-result','save-rule'],['duplicate-submit','duplicate-rule'],['permission-isolation','permission-rule']]){
  test(`${file}: real Cangjie observation and HTTP normal/defect/unknown controls`,async()=>{
    const a=await api(),suite=await a.loadValidationSuite(rule),spec=await json(`templates/${file}.json`);
    const r=await a.validateAgainstSuite(spec,suite);records.push({name:file,record:r});
    assert.ok(Object.values(r.gateResults).every(Boolean),JSON.stringify(r));
    assert.equal(r.cases.filter(c=>c.phase==='observation').length,6);
    assert.equal(r.cases.filter(c=>c.phase==='http').length,6);
    for(const c of r.cases){assert.equal(c.matched,true,JSON.stringify(c));assert.ok(c.evidenceRefs.length>0);}
    assert.equal(r.scope,'template_validation');assert.match(r.candidateHash,/^[a-f0-9]{64}$/);assert.match(r.suiteHash,/^[a-f0-9]{64}$/);
    assert.ok(r.evidenceRefs.some(x=>x.startsWith('reference:')));
  });
}
test('title update controls detect priority reset and owner change at the corresponding assertion',async()=>{
  const a=await api(),r=await a.validateAgainstSuite(await json('tests/fixtures/title-update.json'),await a.loadValidationSuite('title-update-rule'));records.push({name:'title-update',record:r});
  assert.ok(Object.values(r.gateResults).every(Boolean),JSON.stringify(r));
  for(const phase of ['observation','http']){
    assert.ok(r.cases.some(c=>c.phase===phase&&c.verdicts.some(v=>v.assertionRef==='unchanged-priority'&&v.status==='fail')));
    assert.ok(r.cases.some(c=>c.phase===phase&&c.verdicts.some(v=>v.assertionRef==='unchanged-owner'&&v.status==='fail')));
  }
});
test('hardcoded owner and priority cannot pass held-out normal variants',async()=>{
  const a=await api(),spec=await json('tests/fixtures/title-update.json');
  spec.assertions[1].expr.args[1]={op:'const',value:'high'};spec.assertions[2].expr.args[1]={op:'const',value:'user-a'};
  const r=await a.validateAgainstSuite(spec,await a.loadValidationSuite('title-update-rule'));
  assert.equal(r.gateResults.admitted,false,'fixed answers must fail a normal held-out variant');
});
test('suite parameters cannot repair a candidate with missing required parameter declarations',async()=>{
  const a=await api(),spec=await json('templates/saved-result.json');spec.parameters={};
  const r=await a.validateAgainstSuite(spec,await a.loadValidationSuite('save-rule'));
  assert.equal(r.gateResults.admitted,false,'suite must not supply undeclared required parameters');
});
test('semantically equivalent renamed step IDs use independent operation trace',async()=>{
  const a=await api(),spec=await json('templates/saved-result.json');spec.steps[0].stepId='create-ticket';spec.steps[1].stepId='read-ticket';
  const r=await a.validateAgainstSuite(spec,await a.loadValidationSuite('save-rule'));
  assert.equal(r.gateResults.admitted,true,JSON.stringify(r));
});
test('unsupported observation trace produces an incomplete persisted validation record',async()=>{
  const a=await api(),spec=await json('templates/saved-result.json');
  spec.steps.splice(1,0,{...structuredClone(spec.steps[1]),stepId:'extra-query',output:'extra'});spec.limits.maxActions=16;
  const r=await a.validateAgainstSuite(spec,await a.loadValidationSuite('save-rule'));
  assert.equal(r.gateResults.admitted,false);assert.ok(r.cases.some(c=>c.phase==='observation'&&!c.completed));assert.ok(r.recordRef);
});
test('save-drop frozen samples describe the same object and consistent persisted row',async()=>{
  const data=await json('tests/fixtures/observations.json');
  for(const id of ['c002','c005']){const entry=data[id],steps=entry.trace?entry.trace.map(x=>x.observation):Object.values(entry);
    assert.equal(steps[1].result.id,steps[0].result.id,'persistence negative must retain bound object');
    assert.equal(steps[1].result.title,steps[1].result.items[0].title,'normalized title must match raw row');
  }
});
test('each HTTP case retains its actual bound mapping hash and copy identity',async()=>{
  const a=await api(),spec=await json('templates/saved-result.json'),r=await a.runReferenceCase(spec,await a.loadValidationSuite('save-rule'),{behavior:'normal',parameters:{title:'provenance'}});
  assert.ok(r.copyId);assert.match(r.mappingHash,/^[a-f0-9]{64}$/);
  const text=await readFile(new URL(`.local-data/projects/${r.copyId}/evidence/events.jsonl`,root),'utf8');
  const preparation=text.trim().split('\n').map(JSON.parse).find(e=>e.data.kind==='preparation_started');
  assert.equal(r.mappingHash,preparation.data.attempt.mappingHash);assert.ok(r.effectiveCandidateHash);
});
test('persisted validation record satisfies the shared contract used by later admission stages',async()=>{
  const a=await api(),spec=await json('templates/saved-result.json');spec.assertions[0].expr={op:'const',value:true};
  const r=await a.validateAgainstSuite(spec,await a.loadValidationSuite('save-rule'));
  assert.equal(validateContract('ValidationRecord',r).valid,true,JSON.stringify(validateContract('ValidationRecord',r)));
  const bad=structuredClone(r);bad.cases=[{caseId:'c',phase:'http',completed:true,matched:true,verdicts:[],evidenceRefs:[],mappingHash:42}];
  assert.equal(validateContract('ValidationRecord',bad).valid,false);
});
for(const kind of ['always_pass_rejected','always_fail_rejected','status_only_rejected'])test(kind,async()=>{
  const a=await api(),spec=await json('templates/saved-result.json');
  const field=(...path)=>({op:'field',var:'saved',path}),value=value=>({op:'const',value});
  spec.assertions[0].expr=kind==='always_pass_rejected'?{op:'eq',args:[field('title'),field('title')]}:kind==='always_fail_rejected'?{op:'neq',args:[field('title'),{op:'field',var:'params',path:['title']}]}:{op:'eq',args:[field('status'),value(200)]};
  const r=await a.validateAgainstSuite(spec,await a.loadValidationSuite('save-rule'));
  assert.ok(Object.values(r.gateResults).some(x=>!x),JSON.stringify(r));
  assert.equal(r.gateResults.admitted,false);
});
test('crash_is_not_detection and timeout are incomplete, never negative-control detection',async()=>{
  const a=await api(),spec=await json('templates/saved-result.json'),suite=await a.loadValidationSuite('save-rule');
  for(const behavior of ['crash','timeout']){
    const r=await a.runReferenceCase(spec,suite,{behavior,parameters:{title:'service failure'}});
    assert.equal(r.completed,false,JSON.stringify(r));assert.ok(r.verdicts.every(v=>v.status==='inconclusive'));assert.ok(!r.verdicts.some(v=>v.status==='fail'));
    assert.ok(r.evidenceRefs.length>0);
  }
});
test('unrelated object cannot pass correlation after owner mismatch becomes business evidence',async()=>{
  const a=await api(),spec=await json('templates/saved-result.json'),suite=await a.loadValidationSuite('save-rule');
  const r=await a.runReferenceCase(spec,suite,{behavior:'wrong-object',parameters:{title:'bound object'}});
  assert.equal(r.verdicts.length,1);assert.equal(r.verdicts[0].status,'inconclusive');
});
test('missing field is inconclusive even with HTTP 200 and complete pagination',async()=>{
  const a=await api(),spec=await json('templates/saved-result.json'),suite=await a.loadValidationSuite('save-rule');
  const r=await a.runReferenceCase(spec,suite,{behavior:'missing',parameters:{title:'required title'}});
  assert.equal(r.verdicts.length,1);assert.equal(r.verdicts[0].status,'inconclusive');assert.equal(r.verdicts[0].reasonCode,'MISSING_VALUE');
});
test('untrusted suites, changed labels, and rules without reference controls stay unsupported',async()=>{
  const a=await api();await assert.rejects(a.loadValidationSuite('unknown-rule'),/UNSUPPORTED_RULE/);
  const suite=await a.loadValidationSuite('save-rule');suite.cases[0].expected={'saved-title':'fail'};
  await assert.rejects(a.validateAgainstSuite(await json('templates/saved-result.json'),suite),/SUITE_CHANGED/);
});
test('candidate cannot access labels or unknown operation through validation harness',async()=>{
  const a=await api(),spec=await json('templates/saved-result.json');spec.assertions[0].expr={op:'field',var:'saved',path:['evaluationLabel']};
  const r=await a.validateAgainstSuite(spec,await a.loadValidationSuite('save-rule'));assert.equal(r.gateResults.static,false);assert.equal(r.gateResults.admitted,false);assert.equal(r.cases.length,0);
});
test('validation record retains replayable sanitized HTTP evidence and frozen provenance',async()=>{
  const a=await api();assert.ok(records.length===4,'all four rule families ran');
  for(const {record:r}of records){assert.equal(validateContract('ValidationRecord',r).valid,true,JSON.stringify(validateContract('ValidationRecord',r)));assert.equal(r.interpreterVersion,'1.0.0');for(const c of r.cases.filter(x=>x.phase==='http'))for(const ref of c.evidenceRefs){const e=await a.readReferenceEvidence(ref);assert.ok(e.action);assert.ok(e.http);assert.ok(!/Bearer |synthetic-reference-password/.test(JSON.stringify(e)));}}
  await writeFile(new URL('docs/evidence/t3-result.json',root),JSON.stringify(records,null,2)+'\n');
});
