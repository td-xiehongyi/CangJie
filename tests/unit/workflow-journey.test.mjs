import test from 'node:test';
import assert from 'node:assert/strict';
import {journeySteps,parseStep,stepPage,journeyState,hasBusinessSelection} from '../../apps/ui/src/workflowJourney.ts';

test('preparation requires a current-operation choice or current confirmed project business',()=>{
 const project={id:'p',journey:{goal:'load'},workflow:{flow:'edit',flows:{submit:{save:{enabled:true}},edit:{title:{enabled:false}}}}};
 assert.equal(hasBusinessSelection(undefined,{}),false);
 assert.equal(hasBusinessSelection(project,{}),false);
 project.workflow.flows.edit.title.enabled=true;
 assert.equal(hasBusinessSelection(project,{}),true);
 project.workflow.flows.edit.title.enabled=false;
 for(const rule of [{sourceCurrent:true,confirmation:{status:'pending'}},{sourceCurrent:false,confirmation:{status:'confirmed'}}]){
  assert.equal(hasBusinessSelection(project,{projectRules:{p:{versions:[rule]}}}),false);
 }
 assert.equal(hasBusinessSelection(project,{projectRules:{p:{versions:[{sourceCurrent:true,confirmation:{status:'confirmed'}}]}}}),true);
 assert.equal(hasBusinessSelection(project,{projectRules:{other:{versions:[{confirmation:{status:'confirmed'}}]}}}),false);
});
test('fixed main steps and an optional repair loop share one catalog',()=>{
 assert.deepEqual(journeySteps.map(s=>s.id),Array.from({length:12},(_,i)=>i+1));
 assert.deepEqual(journeySteps.filter(s=>s.optional).map(s=>s.id),[12]);
 assert.match(journeySteps[10].title,/保存/);
});
test('invalid deep links fall back without triggering work',()=>{
 for(const raw of ['0','13','-1','1.5','NaN','2evil'])assert.equal(parseStep(raw),1);
 for(const raw of ['5','6','07','8'])assert.equal(parseStep(raw),5);assert.equal(stepPage(11),'report');assert.equal(stepPage(12),'repair');
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

test('visible preparation step reflects active and blocked candidate work',()=>{
 const project={id:'p',workflow:{flow:'submit',flows:{submit:{r:{enabled:true}}}},candidate:{status:'validating'}};
 assert.equal(journeyState(project,{},undefined,false)[5].status,'running');
 assert.equal(journeyState({...project,candidate:{ruleId:'r',status:'paused',code:'LIMIT'}},{},undefined,false)[5].status,'blocked');
});
test('source business confirmation contributes to03 without granting execution',()=>{
 const p={id:'p',sourceOnly:true};
 const state={projectRules:{p:{versions:[{id:'r',version:1,contentHash:'h',sourceCurrent:true,confirmation:{status:'confirmed'}}]}}};
 assert.equal(journeyState(p,state,undefined,false)[3].status,'completed');
 assert.equal(journeyState(p,state,undefined,false)[10].status,'pending');
 state.projectRules.p.versions[0].sourceCurrent=false;
 assert.equal(journeyState(p,state,undefined,false)[3].status,'stale');
});

test('an unrelated old candidate does not block current preparation status',()=>{
 const p={id:'p',workflow:{flow:'submit',flows:{submit:{r:{enabled:true}}}},candidate:{ruleId:'old',status:'paused',code:'LIMIT'}};
 assert.equal(journeyState(p,{},undefined,false)[5].status,'available');
});

test('a candidate awaiting review is available rather than blocked by its guidance code',()=>{
 const p={id:'p',workflow:{flow:'submit',flows:{submit:{r:{enabled:true}}}},candidate:{ruleId:'r',status:'ready_for_review',code:'REVIEW_REQUIRED'}};
 assert.equal(journeyState(p,{},undefined,false)[5].status,'available');
 assert.match(journeyState(p,{},undefined,false)[5].reason,/审核/);
});

test('a published selected candidate retains its qualification evidence in navigation',()=>{
 const p={id:'p',environmentHash:'env',workflow:{flow:'submit',flows:{submit:{r:{enabled:true,version:'published',ruleHash:'rule',environmentHash:'env'}}}},candidate:{ruleId:'r',status:'ready_for_review',code:'REVIEW_REQUIRED',draftHash:'published'}};
 const state={catalog:{matches:[{ref:{hash:'published'},ruleHash:'rule'}]}};
 const result=journeyState(p,state,undefined,false);
 assert.equal(result[5].status,'evidence');assert.equal(result[9].status,'evidence');
});
