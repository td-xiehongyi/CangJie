import test from 'node:test';
import assert from 'node:assert/strict';
import {journeySteps,parseStep,stepPage,journeyState} from '../../apps/ui/src/workflowJourney.ts';
test('fixed main steps and an optional repair loop share one catalog',()=>{
 assert.deepEqual(journeySteps.map(s=>s.id),Array.from({length:12},(_,i)=>i+1));
 assert.deepEqual(journeySteps.filter(s=>s.optional).map(s=>s.id),[12]);
 assert.match(journeySteps[10].title,/保存/);
});
test('invalid deep links fall back without triggering work',()=>{
 for(const raw of ['0','13','-1','1.5','NaN','2evil'])assert.equal(parseStep(raw),1);
 assert.equal(parseStep('07'),7);assert.equal(stepPage(11),'report');assert.equal(stepPage(12),'repair');
});
test('source import does not claim runtime readiness or business success',()=>{
 const statuses=journeyState({id:'p',sourceOnly:true},{},undefined,false);
 assert.equal(statuses[1].status,'completed');assert.equal(statuses[4].status,'pending');
 assert.equal(statuses[12].status,'optional');assert.ok(!Object.values(statuses).some(s=>s.status==='passed'));
});
test('run result is isolated by project and repair remains optional',()=>{
 const p={id:'p'};const other={id:'r',projectId:'other',status:'completed'};
 assert.equal(journeyState(p,{},other,false)[10].status,'pending');
 const run={...other,projectId:'p',status:'failed'};
 assert.equal(journeyState(p,{},run,false)[10].status,'blocked');
 assert.equal(journeyState(p,{},run,false)[11].status,'available');
 assert.equal(journeyState(p,{},run,false)[12].status,'optional');
});
test('stale source marks analysis stale instead of completed',()=>{
 const result=journeyState({id:'p',discovery:{status:'stale',result:{}}},{},undefined,false);
 assert.equal(result[2].status,'stale');
});
test('manual analysis skip is explicit with a reason, never treated as coverage',()=>{
 const s=journeyState({id:'p',journey:{skipAnalysis:true}},{},undefined,false)[2];
 assert.equal(s.status,'skipped');assert.match(s.reason,/不代表已覆盖/);
});

test('view persistence is queued without blocking navigation and recovers after a failed save',async()=>{
 const {createViewPositionWriter}=await import('../../apps/ui/src/workflowJourney.ts');
 const calls=[],errors=[];let release;
 const gate=new Promise(r=>release=r);
 const writer=createViewPositionWriter(async(projectId,step)=>{calls.push([projectId,step]);if(step===2){await gate;throw new Error('offline');}},e=>errors.push(e.message));
 assert.equal(writer.save('p',2),undefined);
 writer.save('p',3);
 await new Promise(r=>setImmediate(r));assert.deepEqual(calls,[['p',2]]);
 release();await writer.settled();
 assert.deepEqual(calls,[['p',2],['p',3]]);assert.deepEqual(errors,['offline']);
});
