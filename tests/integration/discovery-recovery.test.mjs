import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupDiscovery} from '../support/discovery.mjs';

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
