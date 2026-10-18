import test from 'node:test';
import assert from 'node:assert/strict';
import * as report from '../../apps/ui/src/reportEvidence.ts';

function fixture(){
 return {template:{parameters:{title:'新标题'},steps:[{stepId:'before',output:'before'},{stepId:'closed',output:'closed'},{stepId:'after',output:'after'}],assertions:[
  {id:'priority',expr:{op:'eq',args:[{op:'field',var:'closed',path:['priority']},{op:'field',var:'before',path:['priority']}]}},
  {id:'title',expr:{op:'eq',args:[{op:'field',var:'after',path:['title']},{op:'field',var:'params',path:['title']}]}}
 ]},actions:['before','closed','after'].map(stepId=>({actionId:stepId,stepId,checkId:'edit'})),observations:[
  {actionId:'before',result:{priority:'high',title:'旧标题'},evidenceRefs:['e:before']},
  {actionId:'closed',result:{priority:'low'},evidenceRefs:['e:closed']},
  {actionId:'after',result:{priority:'high',title:'新标题'},evidenceRefs:['e:after']}
 ]};
}
test('differences name the before and exact intermediate values without taking a later restored value',()=>{
 assert.equal(typeof report.differenceFor,'function','result differences are missing');
 const c=fixture(),v={assertionRef:'priority',checkId:'edit',status:'fail',evidenceRefs:['e:before','e:closed','e:after']},snapshot=JSON.stringify(c);
 const d=report.differenceFor(c,v);
 assert.equal(d.before,'"high"');assert.equal(d.expected,'"high"');assert.equal(d.actual,'"low"');
 assert.match(d.source,/before.priority/);assert.match(d.source,/closed.priority/);
 assert.equal(d.status,'fail');assert.equal(JSON.stringify(c),snapshot);
});
test('parameter expectation shows no invented before value and retains a passing result',()=>{
 const d=report.differenceFor(fixture(),{assertionRef:'title',checkId:'edit',status:'pass',evidenceRefs:['e:after']});
 assert.equal(d.before,'不适用（按指定值检查）');assert.equal(d.expected,'"新标题"');assert.equal(d.actual,'"新标题"');assert.equal(d.status,'pass');
});
test('unrelated evidence, missing baseline and duplicate matching observations never yield invented differences',()=>{
 const c=fixture(),v={assertionRef:'priority',checkId:'edit',status:'inconclusive',evidenceRefs:['unrelated']};
 assert.equal(report.differenceFor(c,v).actual,'未取得');
 v.evidenceRefs=['e:closed'];assert.equal(report.differenceFor(c,v).before,'未取得');
 assert.equal(report.differenceFor(c,v).expected,'未取得');
 c.observations.push({...c.observations[1],result:{priority:'forged'}});
 assert.equal(report.differenceFor(c,v).actual,'未取得');
});
test('inequality is displayed as a relation, and unsupported expressions remain unavailable',()=>{
 const c=fixture(),v={assertionRef:'priority',checkId:'edit',status:'pass',evidenceRefs:['e:before','e:closed']};
 c.template.assertions[0].expr.op='neq';assert.equal(report.differenceFor(c,v).expected,'应不同于 "high"');
 c.template.assertions[0].expr.op='and';assert.equal(report.differenceFor(c,v).actual,'未取得');
});

test('existing duplicate and permission assertions display actual record counts from exact evidence',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const file of ['templates/duplicate-submit.json','templates/permission-isolation.json']){
  const template=JSON.parse(await readFile(file,'utf8')),assertion=template.assertions[0],count=assertion.expr.args.find(a=>a.op==='count');
  const field=count.arg,step=template.steps.find(s=>s.output===field.var),items=[{id:'one'},{id:'two'}];
  const check={template,actions:[{actionId:'query',checkId:assertion.checkId,stepId:step.stepId}],observations:[{actionId:'query',result:{[field.path[0]]:items},evidenceRefs:['e:query']}]};
  const v={assertionRef:assertion.id,checkId:assertion.checkId,status:'fail',evidenceRefs:['e:query']};
  assert.equal(report.differenceFor(check,v).actual,'2');assert.match(report.differenceFor(check,v).source,/items/);
  check.observations[0].result[field.path[0]]=null;assert.equal(report.differenceFor(check,v).actual,'未取得');
 }
});
