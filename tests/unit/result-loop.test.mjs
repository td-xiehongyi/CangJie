import test from 'node:test';
import assert from 'node:assert/strict';
import * as report from '../../apps/ui/src/reportEvidence.ts';
const hash='a'.repeat(64);
const check=(status='pass',id='r')=>({rule:{id,confirmation:'confirmed',expectedChanges:['保存一次'],invariants:['归属不变']},templateRef:{id:'t',version:'1.0.0',hash},mode:'verify',status:'completed',actions:[],observations:[],verdicts:[{status,assertionRef:'a',evidenceRefs:['e']}],preparation:{baseline:{sourceHash:hash,summary:{hash:'baseline-v1',instanceId:'first-copy'}},data:{seedVersion:'v1',count:2},accounts:[{actorRef:'owner',userId:'u',role:'user'}]}});
const run=(id='old',status='fail')=>({id,projectId:'p',status:'completed',flow:{id:'submit',title:'保存'},kind:'verification',plan:{sourceHash:hash,mapping:{id:'m'},checks:[check(status)]},checks:[check(status)],uncovered:['只覆盖本轮']});

test('results keep missing planned checks unknown, observation separate and scope immutable',()=>{
 const r=run();r.plan.checks.push(check('pass','not-started'));r.checks.push({...check('pass','observation'),mode:'observe'});const before=JSON.stringify(r);
 const groups=report.groupedChecks(r);
 assert.equal(groups.find(g=>g.kind==='fail').checks.length,1);
 assert.equal(groups.find(g=>g.kind==='unknown').checks[0].notExecuted,true);
 assert.equal(groups.find(g=>g.kind==='observe').checks.length,1);
 assert.equal(report.checkOutcome({...check('pass'),verdicts:[]}), 'unknown');
 assert.equal(report.checkOutcome({...check('pass'),status:'running'}),'unknown');
 assert.equal(JSON.stringify(r),before);
});

test('linked unchanged standards compare failures and passes without claiming permanent repair',()=>{
 const old=run(),next={...run('new','pass'),parentRunId:'old'};next.plan.sourceHash='b'.repeat(64);
 const before=JSON.stringify([old,next]);const result=report.compareRuns(old,next);
 assert.equal(result.available,true);assert.equal(result.sourceChanged,true);
 assert.equal(result.rows[0].conclusion,'原问题在本次条件下未复现');
 assert.equal(result.rows[0].comparable,true);assert.equal(JSON.stringify([old,next]),before);
 const reversed={...next,checks:[{...next.checks[0],rule:{invariants:['归属不变'],expectedChanges:['保存一次'],confirmation:'confirmed',id:'r'}}]};
 assert.equal(report.compareRuns(old,reversed).rows[0].comparable,true);
});

test('changed standards, mapping, data, identity or missing versions never count as repair',()=>{
 for(const alter of [
  r=>r.checks[0].rule.expectedChanges=['允许重复'],
  r=>r.checks[0].templateRef.hash='b'.repeat(64),
  r=>r.plan.mapping={id:'other'},
  r=>r.checks[0].preparation.data.count=3,
  r=>r.checks[0].preparation.accounts[0].userId='other',
  r=>delete r.checks[0].templateRef.hash,
  r=>delete r.checks[0].preparation,
  r=>r.status='blocked',
  r=>r.checks[0].mode='observe',
 ]){
  const next={...run('new','pass'),parentRunId:'old'};alter(next);const row=report.compareRuns(run(),next).rows[0];
  assert.equal(row.comparable,false);assert.doesNotMatch(row.conclusion,/未复现|已修复/);
 }
});

test('comparison handles missing parent, unrelated project, partial coverage and unknown results',()=>{
 const next={...run('new','inconclusive'),parentRunId:'old'};
 assert.match(report.compareRuns(undefined,next).reason,/原运行/);
 assert.equal(report.compareRuns({...run(),projectId:'other'},next).available,false);
 assert.equal(report.compareRuns(run('unrelated'),next).available,false);
 assert.match(report.compareRuns(run(),next).rows[0].conclusion,/不能确认/);
 next.checks=[];next.plan.checks=[];
 assert.equal(report.compareRuns(run(),next).rows[0].conclusion,'本次未检查，不能确认修复');
 const added={...run('new','fail'),parentRunId:'old'};added.checks.push(check('fail','new-rule'));
 assert.match(report.compareRuns(run(),added).rows.find(r=>r.ruleId==='new-rule').conclusion,/新增检查/);
});

test('summary counts checks, includes missing coverage and cannot pass an interrupted check',()=>{
 const r=run('r','pass');r.plan.checks.push(check('pass','missing'));
 assert.equal(report.resultSummary(r).kind,'unknown');
 const failures=run();failures.checks[0].verdicts.push({status:'fail',assertionRef:'second'});
 assert.equal(report.resultSummary(failures).title,'发现 1 项业务问题');
 assert.equal(report.checkOutcome({...check('pass'),status:'blocked'}),'unknown');
});


test('real baseline fingerprints must match while copy identity and source changes stay separate',()=>{
 const old=run(),next={...run('new','pass'),parentRunId:'old'};
 next.checks[0].preparation.baseline.summary.hash='different-data';
 assert.equal(report.compareRuns(old,next).rows[0].comparable,false);
 delete next.checks[0].preparation.baseline;
 assert.equal(report.compareRuns(old,next).rows[0].comparable,false);
 next.checks[0].preparation.baseline={sourceHash:'changed-source',summary:{hash:'baseline-v1',instanceId:'new-copy'}};
 assert.equal(report.compareRuns(old,next).rows[0].comparable,true);
});

test('unexecuted observation plans stay unknown rather than claiming recorded behavior',()=>{
 const r=run('r','pass');r.checks[0].mode='observe';r.plan.checks.push({...check('pass','missing'),mode:'observe'});
 assert.equal(report.groupedChecks(r).find(g=>g.kind==='unknown').checks.length,1);
 assert.equal(report.resultSummary(r).kind,'unknown');
});

test('report translates exact known expectations without replacing changed historical semantics',async()=>{
 const {ruleExpectedText}=await import('../../apps/ui/src/businessNames.ts');
 assert.equal(ruleExpectedText('submitted title persists'),'提交的标题应正确保存');
 assert.equal(ruleExpectedText('submitted title may be lost'),'submitted title may be lost');
});
