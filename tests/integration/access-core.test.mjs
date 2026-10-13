import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {CoreClient} from '../../apps/host/dist/core/client.js';
import {coreCommand} from '../../scripts/toolchain.mjs';
import {inspectProject} from '../../apps/host/dist/projects/inspect.js';
import {prepareCopy} from '../../apps/host/dist/projects/copy.js';
import {CredentialSession} from '../../apps/host/dist/execution/session.js';
import {execute} from '../../apps/host/dist/execution/http.js';
import {bindMapping,mappingHash} from '../../apps/host/dist/execution/mapping.js';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

test('actual Cangjie actions execute against isolated Express/SQLite and return evidence-backed verdict',async t=>{
  const credentials=new CredentialSession();t.after(()=>credentials.close());
  credentials.set('core-http','owner','synthetic-owner');credentials.set('core-http','other','synthetic-other');
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  const profile=await inspectProject(fileURLToPath(new URL('../../samples/ticket',import.meta.url)));
  const env=await prepareCopy(profile,{projectId:'core-http',port,confirmed:true,data:{source:'synthetic',count:2,seedVersion:'ticket-seed-v1'},accounts:[{actorRef:'owner',username:'alpha',userId:'user-a',role:'user'},{actorRef:'other',username:'beta',userId:'user-b',role:'user'}],credentials});t.after(()=>env.close());
  const mapping=bindMapping(profile.mapping,env.id),runId=randomUUID();
  await env.prepareExperiment({checkId:'save',runId,confirmed:true,ruleHash:'save-rule-v1',mappingHash:mappingHash(mapping),budget:{maxOperations:16,deadlineMs:10000}});
  const core=new CoreClient({...coreCommand(),timeoutMs:5000});t.after(()=>core.close());
  const spec=JSON.parse(await readFile(new URL('../../packages/contracts/fixtures/save-result.json',import.meta.url),'utf8'));
  spec.limits.actionTimeoutMs=3000;
  spec.checks.push('after-reset');spec.steps.push({stepId:'fresh-query',checkId:'after-reset',operationId:'query',actorRef:'owner',bindings:{},output:'fresh'});
  spec.assertions.push({id:'no-old-data',checkId:'after-reset',expr:{op:'eq',args:[{op:'count',arg:{op:'field',var:'fresh',path:['items']}},{op:'const',value:0}]}});
  const send=async(kind,payload)=>{const events=await core.send({schemaVersion:1,messageId:randomUUID(),runId,kind,payload});assert.notEqual(events.at(-1).payload.status,'error',JSON.stringify(events));return events.at(-1).payload.data;};
  let state=await send('start',{operation:'runTemplate',spec,capabilities:{operations:['create','query','update'],actorRefs:['owner','other'],expressions:['field','const','exists','eq','neq','count','contains','all','any','not']},rule:{...spec.ruleRef,confirmation:'confirmed',source:'confirmed T2 integration rule',preconditions:[],expectedChanges:['保存提交标题'],invariants:[],completionDeadline:10000},scope:{kind:'observation_validation',confirmed:true,validationRef:'t2-http-only'}});
  const observations=[];
  while(state.state==='running'){
    assert.equal(state.actions.length,1);const action=state.actions[0];
    if(action.attemptId!==env.currentAttempt.id){assert.equal(action.requiresBaseline,true);await env.completeAttempt();await env.prepareExperiment({checkId:action.checkId,runId,confirmed:true,ruleHash:'save-rule-v1',mappingHash:mappingHash(mapping),budget:{maxOperations:16,deadlineMs:10000}});}
    assert.equal(action.attemptId,env.currentAttempt.id);
    const observation=await execute(action,{environment:env,mapping});observations.push(observation);state=await send('observation',{observation});
  }
  assert.equal(state.state,'completed');assert.deepEqual(state.verdicts.map(x=>x.status),['pass','pass'],JSON.stringify(state));assert.equal(observations.length,3);assert.equal(env.attempts.length,2);
  for(const obs of observations){assert.equal(obs.identityVerified,true);assert.equal(obs.queryComplete,true);assert.match(obs.evidenceRefs[0],/^evidence:/);JSON.parse(await readFile(join(env.evidenceRoot,obs.evidenceRefs[0].replace('evidence:','')),'utf8'));}
  await env.completeAttempt();assert.equal(env.sessions.size,0);
  await writeFile(new URL('../../docs/evidence/t2-roundtrip.json',import.meta.url),JSON.stringify({state,observations,copyId:env.id},null,2)+'\n');
});
