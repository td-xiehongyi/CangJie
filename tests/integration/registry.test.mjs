import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,cp,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
const root=fileURLToPath(new URL('../../',import.meta.url));
const json=async p=>JSON.parse(await readFile(p,'utf8'));

test('T5 registry: real validation, review binding, immutable publication and version qualification',{timeout:90000},async t=>{
  assert.ok(existsSync(join(root,'apps/host/dist/templates/store.js')),'T5 registry implementation must exist');
  const {TemplateRegistry}=await import('../../apps/host/dist/templates/store.js');
  const {CandidateTask}=await import('../../apps/host/dist/model/candidate.js');
  const {ModelCredentials}=await import('../../apps/host/dist/model/credentials.js');
  const {disclose,confirmDisclosure}=await import('../../apps/host/dist/model/context.js');
  const {capabilities}=await import('../../apps/host/dist/validation/observations.js');
  const {loadValidationSuite}=await import('../../apps/host/dist/validation/reference-runner.js');
  const {digest}=await import('../../apps/host/dist/projects/inspect.js');
  const spec=await json(join(root,'tests/fixtures/title-update.json'));
  const server=createServer(async(req,res)=>{for await(const c of req){}res.setHeader('connection','close');res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(spec)}}],usage:{total_tokens:20}}));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const directory=join(root,'.local-data/registry-tests',randomUUID());await mkdir(directory,{recursive:true});
  await writeFile(join(directory,'summary.md'),'Synthetic title update project');
  const source=join(directory,'target');await cp(join(root,'samples/ticket'),source,{recursive:true});
  const targetFile=join(source,'src/server.ts');await writeFile(targetFile,(await readFile(targetFile,'utf8')).replace('SET title=? WHERE','SET title=?, priority=0 WHERE'));
  const serviceUrl=`http://127.0.0.1:${server.address().port}`,keys=new ModelCredentials();t.after(()=>keys.close());
  const credentialRef=await keys.set(serviceUrl,'synthetic-T5-key',{remember:false});
  const context={projectId:'registry-fixture',root:directory,entries:[{path:'summary.md',contentType:'summary'}],serviceUrl};
  const suite=await loadValidationSuite('title-update-rule');
  const task=await CandidateTask.create({rule:suite.rule,capabilities,context,consent:confirmDisclosure(await disclose(context),true),config:{serviceUrl,model:'deterministic-test-only',credentialRef}},keys);
  const registry=new TemplateRegistry(join(directory,'registry'));
  const metadata={version:'1.0.0',applicable:['HTTP JSON title update with stable priority and owner'],excluded:['Payments and arbitrary state machines'],instructions:'Confirm this rule and the new project mapping, then trial the test copy.'};
  await t.test('drafts cannot publish or match',async()=>{await assert.rejects(registry.stageCandidate(task.id,metadata),/NOT_READY/);assert.deepEqual(await registry.matchTemplates(capabilities,[suite.rule]),[]);});
  const candidate=await task.run({source,projectId:'registry-fixture',confirmed:true});assert.equal(candidate.status,'ready_for_review');
  const draft=await registry.stageCandidate(task.id,metadata);
  const review={validationRef:candidate.validation.recordRef,businessConfirmation:'fixture-business-user',technicalReviewer:'fixture-developer',decision:'approve',time:new Date().toISOString(),scope:draft.draftHash};
  const publish=(r=review,record=candidate.validation,hash=candidate.candidateHash)=>registry.publishCandidate(hash,record,r);
  await t.test('native core independently rejects failed gates, stale hashes, missing review and incomplete trial',async()=>{
    const {registryCore}=await import('../../apps/host/dist/validation/review.js');
    for(const field of ['candidateHash','ruleHash'])await assert.rejects(registryCore({operation:'publishCandidate',draft:{...draft,[field]:'changed'},review}),/STALE/);
    for(const gate of ['static','coverage','observation','http','admitted'])await assert.rejects(registryCore({operation:'publishCandidate',draft:{...draft,validation:{...draft.validation,gateResults:{...draft.validation.gateResults,[gate]:false}}},review}),/VALIDATION_NOT_PASSED/);
    await assert.rejects(registryCore({operation:'publishCandidate',draft:{...draft,trial:{...draft.trial,gateResults:{completed:true,conclusive:false}}},review}),/TRIAL_NOT_COMPLETED/);
    await assert.rejects(registryCore({operation:'publishCandidate',draft,review:{...review,technicalReviewer:' '}}),/REVIEW/);
  });
  await t.test('missing_review_blocks',async()=>{for(const r of [{...review,businessConfirmation:''},{...review,technicalReviewer:' '},{...review,decision:'reject'},{...review,time:'bad'}])await assert.rejects(publish(r),/REVIEW/);});
  await t.test('changed_candidate_needs_revalidation',async()=>{await assert.rejects(publish(review,candidate.validation,'f'.repeat(64)),/STALE/);});
  await t.test('changed_rule_invalidates_ticket',async()=>{await assert.rejects(publish(review,{...candidate.validation,ruleHash:'f'.repeat(64)}),/STALE/);});
  await t.test('changed validation gates or review scope cannot be borrowed',async()=>{await assert.rejects(publish(review,{...candidate.validation,gateResults:{...candidate.validation.gateResults,http:false}}),/STALE/);await assert.rejects(publish({...review,scope:'a'.repeat(64)}),/ENOENT|DRAFT/);});
  await t.test('changed or missing evidence after review blocks publication',async()=>{
    const ref=candidate.trial.evidenceRefs[0].split(':'),path=join(root,'.local-data/projects',ref[1],'evidence',ref[2]),original=await readFile(path,'utf8');
    try{await writeFile(path,original+' ');await assert.rejects(publish(),/STALE_EVIDENCE/);}finally{await writeFile(path,original);}
  });
  await t.test('metadata change needs a fresh review',async()=>{const changed=await registry.stageCandidate(task.id,{...metadata,instructions:'Changed scope'});assert.notEqual(changed.draftHash,draft.draftHash);await assert.rejects(registry.publishCandidate(candidate.candidateHash,candidate.validation,{...review,scope:changed.draftHash,validationRef:'wrong'}),/REVIEW/);});
  const before=await readFile(task.path,'utf8');
  const published=await publish();
  await t.test('core-approved immutable version retains target business fail',async()=>{assert.equal(published.status,'published');assert.deepEqual(published.trial.verdicts.map(v=>v.status),['pass','fail','pass']);assert.deepEqual(published.metadata,metadata);assert.equal(await readFile(task.path,'utf8'),before);await assert.rejects(publish(),/VERSION_EXISTS/);});
  await t.test('rule mismatch and missing capabilities never match',async()=>{assert.equal((await registry.matchTemplates(capabilities,[suite.rule])).length,1);assert.equal((await registry.matchTemplates(capabilities,[{...suite.rule,invariants:['different rule same id']}])).length,0);assert.equal((await registry.matchTemplates({...capabilities,expressions:[]},[suite.rule])).length,0);assert.equal((await registry.matchTemplates(capabilities,[{...suite.rule,confirmation:'pending'}])).length,0);});
  const secondTask=await CandidateTask.create({rule:suite.rule,capabilities,context,consent:confirmDisclosure(await disclose(context),true),config:{serviceUrl,model:'deterministic-test-only',credentialRef}},keys);
  const secondCandidate=await secondTask.run({source,projectId:'registry-fixture-v11',confirmed:true});assert.equal(secondCandidate.status,'ready_for_review');
  const second=await registry.stageCandidate(secondTask.id,{...metadata,version:'1.1.0'});
  const secondReview={...review,scope:second.draftHash,validationRef:secondCandidate.validation.recordRef};
  const concurrent=await Promise.allSettled([registry.publishCandidate(secondCandidate.candidateHash,secondCandidate.validation,secondReview),registry.publishCandidate(secondCandidate.candidateHash,secondCandidate.validation,secondReview)]);
  await t.test('concurrent publication cannot overwrite one fixed version',()=>{assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.match(concurrent.find(r=>r.status==='rejected').reason.message,/VERSION_EXISTS/);});
  const v11=concurrent.find(r=>r.status==='fulfilled').value;
  const history=JSON.stringify(await registry.getVersion(published.ref));
  await t.test('qualification_is_version_scoped; stale objects do not bypass disable',async()=>{await registry.disableVersion(published.ref,'Fixture: scope withdrawn');await assert.rejects(registry.assertQualified(published.ref),/VERSION_DISABLED/);await assert.rejects(new TemplateRegistry(join(directory,'registry')).assertQualified(published.ref),/VERSION_DISABLED/);assert.equal((await registry.assertQualified(v11.ref)).ref.version,'1.1.0');assert.equal(JSON.stringify(await registry.getVersion(published.ref)),history);const matches=await registry.matchTemplates(capabilities,[suite.rule]);assert.deepEqual(matches.map(m=>m.ref.version),['1.1.0']);assert.ok(matches[0].reasons.length);assert.equal(matches[0].requiresProjectConfirmation,true);});
  await t.test('disabled historical evidence failure does not poison a valid independent version',async()=>{
    const ref=candidate.trial.evidenceRefs[0].split(':'),path=join(root,'.local-data/projects',ref[1],'evidence',ref[2]),original=await readFile(path,'utf8');
    try{await writeFile(path,'broken');assert.deepEqual((await registry.matchTemplates(capabilities,[suite.rule])).map(m=>m.ref.version),['1.1.0']);assert.equal(JSON.stringify(await registry.getVersion(published.ref)),history);}finally{await writeFile(path,original);}
  });
  await t.test('an active version with changed evidence is excluded with a qualification reason',async()=>{
    const ref=secondCandidate.trial.evidenceRefs[0].split(':'),path=join(root,'.local-data/projects',ref[1],'evidence',ref[2]),original=await readFile(path,'utf8');
    try{await writeFile(path,original+' ');assert.deepEqual(await registry.matchTemplates(capabilities,[suite.rule]),[]);const summary=await registry.summarize(capabilities,[suite.rule]);assert.ok(summary.unavailableVersions.some(v=>v.ref.version==='1.1.0'&&v.code==='STALE_EVIDENCE'));}finally{await writeFile(path,original);}
  });
  await t.test('missing and malformed validation evidence have explicit version-local reasons',async()=>{
    const path=join(root,'.local-data/validation',secondCandidate.validation.recordRef.split(':')[1]+'-record.json'),backup=path+'.t5-test-backup',original=await readFile(path,'utf8');
    await rename(path,backup);
    try{assert.ok((await registry.matchReport(capabilities,[suite.rule])).unavailableVersions.some(v=>v.code==='EVIDENCE_MISSING'));}finally{await rename(backup,path);}
    try{await writeFile(path,'{bad json');assert.ok((await registry.matchReport(capabilities,[suite.rule])).unavailableVersions.some(v=>v.code==='EVIDENCE_CORRUPT'));}finally{await writeFile(path,original);}
  });
  await t.test('operational failures are not silently converted into no matches',async()=>{
    const faulty=new TemplateRegistry(join(directory,'registry'));
    for(const code of ['CORE_TIMEOUT','EACCES']){faulty.assertQualified=async()=>{throw new Error(code);};await assert.rejects(faulty.matchTemplates(capabilities,[suite.rule]),new RegExp(code));}
  });
  await t.test('tampered stored publication is rejected',async()=>{const path=registry.versionPath(v11.ref),original=await readFile(path,'utf8');const altered=JSON.parse(original);altered.record.metadata.instructions='tampered';await writeFile(path,JSON.stringify(altered));await assert.rejects(registry.assertQualified(v11.ref),/CORRUPT/);await writeFile(path,original);});
  await t.test('exact version hash and path safety enforced',async()=>{await assert.rejects(registry.assertQualified({...v11.ref,hash:'0'.repeat(64)}),/VERSION_HASH/);await assert.rejects(registry.disableVersion({...v11.ref,id:'../outside'},'x'),/INVALID_REF/);await assert.rejects(registry.disableVersion(v11.ref,' '),/REASON/);});
  await t.test('summary separates reuse eligibility, new publication and unresolved gaps',async()=>{const summary=await registry.summarize(capabilities,[suite.rule,{...suite.rule,id:'unsupported'}]);assert.equal(summary.publishedVersions,2);assert.equal(summary.matchedRules,1);assert.equal(summary.unresolvedRules,1);assert.equal(summary.unavailableVersions.length,1);});
  await writeFile(join(directory,'result.json'),JSON.stringify({candidateId:task.id,validationRef:candidate.validation.recordRef,published:[published.ref,v11.ref],summary:await registry.summarize(capabilities,[suite.rule]),fixtureOnly:true},null,2));
});
