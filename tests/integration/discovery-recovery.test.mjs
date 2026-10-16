import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setupDiscovery,overview} from '../support/discovery.mjs';
import {prepareFullFileInput} from '../../apps/host/dist/discovery/full-input.js';

test('a saved unwrapped full-file overview recovers after deadline without changing the response or budget',async t=>{
 const x=await setupDiscovery(t,()=>{throw new Error('saved response must not call the model')});
 const preview=await prepareFullFileInput(x.snapshot,x.scope,x.config,{mode:'automatic',prompt:''});
 const initial=await x.service.createDiscovery(x.snapshot,x.scope,{mode:'automatic',prompt:'',manifestHash:preview.manifestHash});
 const record=await x.store.get(initial.id);
 const response=JSON.parse(JSON.stringify(overview(initial.reads.map(r=>({path:r.ref.path,sourceRef:r.ref}))).result),(key,value)=>key==='sourceRefs'?value.map(ref=>initial.reads.findIndex(r=>r.ref.path===ref.path)):value);
 response.suggestions=[];
 record.session.status='failed';record.session.pendingResponse=response;record.session.unresolved=['INVALID_DISCOVERY_OUTPUT'];
 record.session.audit=[{status:'completed',response}];record.session.budget.calls=1;record.session.budget.tokens=20;record.session.budget.startedAt=Date.now()-record.preset.deadlineMs-1;
 await x.store.save(record,record.session.revision);const before={...record.session.budget};
 const view=await x.service.getDiscovery(initial.id);
 assert.equal(view.recovery?.reason,'saved_response');
 await x.service.assertResumable(initial.id,view.revision);
 const done=await x.service.runDiscovery(initial.id,view.revision);
 assert.equal(done.status,'completed');assert.deepEqual(done.result.suggestions,[]);
 assert.deepEqual(done.budget,before);assert.equal(x.requests.length,0);assert.deepEqual(done.audit[0].response,response);
});

test('a saved full-file result can recover locally after deadline without another model call or changed budget',async t=>{
 const x=await setupDiscovery(t,()=>{throw new Error('must never call model for a saved valid result')});
 const preview=await prepareFullFileInput(x.snapshot,x.scope,x.config,{mode:'automatic',prompt:''});
 const initial=await x.service.createDiscovery(x.snapshot,x.scope,{mode:'automatic',prompt:'',manifestHash:preview.manifestHash});
 const record=await x.store.get(initial.id),response=overview(initial.reads.map(r=>({path:r.ref.path,sourceRef:r.ref})));
 record.session.status='failed';record.session.pendingResponse=response;record.session.unresolved=['INVALID_DISCOVERY_OUTPUT'];
 record.session.audit=[{status:'completed',response}];record.session.budget.calls=1;record.session.budget.tokens=20;record.session.budget.startedAt=Date.now()-record.preset.deadlineMs-1;
 await x.store.save(record,record.session.revision);const before={...record.session.budget};
 const path=join(x.root,initial.reads[0].ref.path),original=await readFile(path);
 await writeFile(path,Buffer.concat([original,Buffer.from('\nchanged source')]));
 const stale=await x.service.getDiscovery(initial.id);assert.equal(stale.status,'stale');assert.equal(stale.recovery?.allowed,false);
 await assert.rejects(x.service.assertResumable(initial.id,stale.revision),/STALE_SOURCE/);assert.equal(x.requests.length,0);
 await writeFile(path,original);
 const view=await x.service.getDiscovery(initial.id);assert.equal(view.recovery?.allowed,true);assert.equal(view.recovery?.reason,'saved_response');
 await x.service.assertResumable(initial.id,view.revision);
 const done=await x.service.runDiscovery(initial.id,view.revision);
 assert.equal(done.status,'completed');assert.deepEqual(done.budget,before);assert.equal(x.requests.length,0);
 assert.deepEqual(done.audit[0].response,response);assert.equal(done.result.suggestions[0].expectations[0].confirmation,'pending');
});

for(const [reason,mutate] of [
 ['deadline',r=>r.session.budget.startedAt=Date.now()-r.preset.deadlineMs-1],
 ['calls',r=>r.session.budget.calls=r.preset.maxCalls],
 ['tokens',r=>r.session.budget.tokens=r.preset.maxTokens],
 ['source_bytes',r=>{r.session.budget.sourceBytes=r.sourceByteLimit+1}],
 ['budget',r=>r.session.unresolved.push('ANALYSIS_BUDGET_EXHAUSTED')],
])test(`exhausted ${reason} cannot resume or mutate the saved task`,async t=>{
 const x=await setupDiscovery(t,()=>({kind:'insufficient',unresolved:['缺少业务预期'],limitations:[]}));
 const initial=await x.create(),record=await x.store.get(initial.id);record.session.status='partial';mutate(record);await x.store.save(record,record.session.revision);
 const before=await readFile(x.store.path(initial.id),'utf8'),view=await x.service.getDiscovery(initial.id);
 assert.equal(view.recovery?.allowed,false);assert.equal(view.recovery?.reason,reason);
 await assert.rejects(x.service.assertResumable(initial.id,view.revision),/ANALYSIS_RESUME_BLOCKED/);
 assert.equal(await readFile(x.store.path(initial.id),'utf8'),before);assert.equal(x.requests.length,0);
});
test('temporary interruption exposes recovery without inventing a partial result',async t=>{
 const x=await setupDiscovery(t,()=>({kind:'insufficient',unresolved:['待补充'],limitations:[]}));
 const initial=await x.create(),record=await x.store.get(initial.id);record.session.status='paused';record.session.unresolved=['PROVIDER_UNAVAILABLE'];await x.store.save(record,record.session.revision);
 const view=await x.service.getDiscovery(initial.id);assert.equal(view.recovery?.allowed,true);assert.equal(view.result,undefined);
 assert.equal((await x.service.assertResumable(initial.id,view.revision)).id,initial.id);assert.equal(x.requests.length,0);
});
test('recovery reserves the real encoded input, not just output tokens',async t=>{
 const x=await setupDiscovery(t,()=>({kind:'insufficient',unresolved:['待补充'],limitations:[]}));
 const initial=await x.create(),record=await x.store.get(initial.id);record.session.status='paused';
 record.session.budget.tokens=record.preset.maxTokens-record.preset.maxOutputTokens-2;
 await x.store.save(record,record.session.revision);
 const view=await x.service.getDiscovery(initial.id);assert.equal(view.recovery?.allowed,false);assert.equal(view.recovery?.reason,'tokens');
 await assert.rejects(x.service.assertResumable(initial.id,view.revision),/ANALYSIS_RESUME_BLOCKED/);assert.equal(x.requests.length,0);
});
