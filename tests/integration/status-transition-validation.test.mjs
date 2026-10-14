import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const json=async file=>JSON.parse(await readFile(new URL('../../'+file,import.meta.url),'utf8'));
import {StatusTransitionCoreModel,modelRuns} from '../support/status-transition-core-model.mjs';
// Only the Cangjie process is replaced. Preparation, authentication, execution,
// HTTP integrity, evidence files and admission matching are production paths.
mock.module('../../apps/host/dist/core/client.js',{namedExports:{CoreClient:StatusTransitionCoreModel}});
const runner=await import('../../apps/host/dist/validation/reference-runner.js');

test('host-private status transition controls load independently with exact version',async()=>{
  const suite=await runner.loadValidationSuite('status-transition-rule',1);
  assert.equal(suite.facility,'status-transition');assert.equal(suite.version,'status-transition-reference-v1.1.0');
  assert.equal(suite.observationsPath,'tests/fixtures/status-transition-observations.json');
  assert.equal(suite.cases.length,10);
  await assert.rejects(runner.loadValidationSuite('status-transition-rule',2),/UNSUPPORTED_RULE/);
});
test('legacy validation suites retain their frozen hash and shape',async()=>{
  const manifest=await json('tests/reference/suite-manifest.json'),lock=await json('tests/reference/suite-lock.json');
  const {digest}=await import('../../apps/host/dist/projects/inspect.js');
  for(const entry of manifest.suites){const suite=await runner.loadValidationSuite(entry.rule.id,entry.rule.version);
    assert.deepEqual(suite,{...entry,version:manifest.version,review:manifest.review,suiteHash:digest({lock,entry,version:manifest.version})});
  }
});
test('caller-controlled observation paths and expected labels cannot replace private controls',async()=>{
  const suite=await runner.loadValidationSuite('status-transition-rule');
  for(const mutate of [s=>s.observationsPath='../../elsewhere.json',s=>s.cases[0].expected={'closed-state':'fail'},s=>s.facility=undefined]){
    const changed=structuredClone(suite);mutate(changed);
    await assert.rejects(runner.runReferenceCase({},changed,{behavior:'normal',parameters:{}}),/SUITE_CHANGED/);
  }
});

test('test-only core model drives real HTTP plus ten independent observation controls',async()=>{
  const suite=await runner.loadValidationSuite('status-transition-rule'),spec=await json('tests/fixtures/status-transition-template.json');
  const result=await runner.validateAgainstSuite(spec,suite);
  assert.equal(result.interpreterVersion,'test-only-model');
  assert.ok(Object.values(result.gateResults).every(Boolean),JSON.stringify(result));
  assert.equal(result.cases.length,20);
  const {validateContract}=await import('../../packages/contracts/dist/validate.js');
  assert.equal(validateContract('ValidationRecord',result).valid,true);
  for(const c of suite.cases)for(const phase of ['observation','http']){
    const actual=result.cases.find(x=>x.caseId===c.id&&x.phase===phase);assert.equal(actual.matched,true,JSON.stringify(actual));
    assert.deepEqual(Object.fromEntries(actual.verdicts.map(v=>[v.assertionRef,v.status])),c.expected);
    const count=c.behavior==='incomplete-query'?2:c.behavior==='reopen-defect'?5:6;assert.equal(actual.evidenceRefs.length,count);
    if(c.behavior==='reopen-defect')assert.ok(actual.verdicts.every(v=>v.reasonCode==='EXPECTED_REJECTION_VIOLATED'));
    if(phase==='http'){
      assert.match(actual.mappingHash,/^[a-f0-9]{64}$/);assert.ok(actual.copyId);
      for(const ref of actual.evidenceRefs){const evidence=await runner.readReferenceEvidence(ref);assert.ok(evidence.action);assert.ok(evidence.http);assert.doesNotMatch(JSON.stringify(evidence),/Bearer |synthetic-reference-password/)}
    }
  }
});
test('test-only model cannot admit an HTTP-200 assertion or a hardcoded owner',async()=>{
  const suite=await runner.loadValidationSuite('status-transition-rule'),base=await json('tests/fixtures/status-transition-template.json');
  for(const alter of [s=>s.assertions.forEach(a=>a.expr={op:'eq',args:[{op:'field',var:'after',path:['status']},{op:'const',value:200}]}),s=>s.assertions.find(a=>a.id==='unchanged-owner').expr.args[1]={op:'const',value:suite.cases[0].context.ownerId}]){
    const spec=structuredClone(base);alter(spec);const result=await runner.validateAgainstSuite(spec,suite);
    assert.equal(result.gateResults.admitted,false);assert.equal(result.gateResults.observation,false);assert.equal(result.gateResults.http,false);
  }
});
test('test-only model preserves insufficient evidence before expected-rejection failure',async()=>{
  const base=await json('tests/fixtures/status-transition-template.json');
  const spec={...base,steps:[{...base.steps[4],bindings:{}}],assertions:base.assertions.map(a=>({...a,expr:{op:'eq',args:[{op:'field',var:base.steps[4].output,path:['status']},{op:'const',value:'closed'}]}}))};
  for(const [extra,want,reason]of [[{},'fail','EXPECTED_REJECTION_VIOLATED'],[{identityVerified:false},'inconclusive','INSUFFICIENT_EVIDENCE'],[{queryComplete:false},'inconclusive','INSUFFICIENT_EVIDENCE'],[{evidenceRefs:[]},'inconclusive','INSUFFICIENT_EVIDENCE'],[{acceptance:'rejected'},'pass','ASSERTION_TRUE']]){
    const core=new StatusTransitionCoreModel(),runId=crypto.randomUUID(),request=async(kind,payload)=>(await core.send({schemaVersion:1,messageId:crypto.randomUUID(),runId,kind,payload}))[0].payload.data;
    let state=await request('start',{operation:'runTemplate',spec});const action=state.actions[0];
    state=await request('observation',{observation:{actionId:action.actionId,attemptId:action.attemptId,intentId:action.intentId,transportStatus:'ok',identityVerified:true,queryComplete:true,acceptance:'accepted',evidenceRefs:['test-only:1'],result:{status:'closed'},...extra}});
    assert.ok(state.verdicts.every(v=>v.status===want&&v.reasonCode===reason));
  }
});

async function replayTemporaryMutation(spec) {
  // Independent adversarial facts: close mutates both invariants; rejected
  // reopen restores them. Expected verdicts below are literal obligations.
  const original={id:'temporary-control-object',title:'temporary baseline title',ownerId:'temporary-baseline-owner',status:'open'};
  const closed={...original,title:'temporarily changed title',ownerId:'temporarily changed owner',status:'closed'};
  const restored={...original,status:'closed'};
  const frames=[original,original,closed,closed,restored,restored];
  const core=new StatusTransitionCoreModel(),runId=crypto.randomUUID();
  const request=async(kind,payload)=>(await core.send({schemaVersion:1,messageId:crypto.randomUUID(),runId,kind,payload}))[0].payload.data;
  let state=await request('start',{operation:'runTemplate',spec});
  for(let i=0;i<frames.length;i++){
    assert.equal(state.state,'running');const action=state.actions[0];
    state=await request('observation',{observation:{actionId:action.actionId,attemptId:action.attemptId,intentId:action.intentId,transportStatus:'ok',identityVerified:true,queryComplete:true,acceptance:i===4?'rejected':'accepted',evidenceRefs:['test-only:temporary:'+i],result:frames[i]}});
  }
  assert.equal(state.state,'completed');
  return Object.fromEntries(state.verdicts.map(v=>[v.assertionRef,v.status]));
}
test('temporary close mutation exposes the historical false pass and is rejected by the repaired obligations',async()=>{
  const old=await json('tests/reference/status-transition/history/v1.0.0/tests/fixtures/status-transition-template.json');
  assert.deepEqual(await replayTemporaryMutation(old),{'closed-status':'pass','remains-closed':'pass','unchanged-title':'pass','unchanged-owner':'pass'});
  const active=await json('tests/fixtures/status-transition-template.json');
  assert.deepEqual(await replayTemporaryMutation(active),{'closed-status':'pass','remains-closed':'pass','unchanged-title':'pass','unchanged-owner':'pass','closed-unchanged-title':'fail','closed-unchanged-owner':'fail'});
});

test('historical four-obligation template cannot be admitted by the expanded private suite',async()=>{
  const suite=await runner.loadValidationSuite('status-transition-rule'),old=await json('tests/reference/status-transition/history/v1.0.0/tests/fixtures/status-transition-template.json');
  const result=await runner.validateAgainstSuite(old,suite);
  assert.equal(result.interpreterVersion,'test-only-model');assert.equal(result.gateResults.static,true);assert.equal(result.gateResults.coverage,true);
  assert.equal(result.gateResults.observation,false);assert.equal(result.gateResults.http,false);assert.equal(result.gateResults.admitted,false);
  for(const caseId of ['st-dev-5','st-held-5'])for(const phase of ['observation','http']){
    const actual=result.cases.find(c=>c.caseId===caseId&&c.phase===phase);assert.equal(actual.completed,true);assert.equal(actual.matched,false);
    assert.deepEqual(Object.fromEntries(actual.verdicts.map(v=>[v.assertionRef,v.status])),{'closed-status':'pass','remains-closed':'pass','unchanged-title':'pass','unchanged-owner':'pass'});
  }
});
