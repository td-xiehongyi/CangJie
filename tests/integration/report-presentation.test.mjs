import test from 'node:test';
import assert from 'node:assert/strict';

test('report values are traced to the assertion and its exact observed action',async()=>{
  const {comparisonFor,resultSummary,issueSummaryText}=await import('../../apps/ui/src/reportEvidence.ts');
  const check={mode:'verify',template:{parameters:{title:'expected'},steps:[{stepId:'query',output:'saved'}],assertions:[{id:'saved-title',expr:{op:'eq',args:[{op:'field',var:'saved',path:['title']},{op:'field',var:'params',path:['title']}]}}]},actions:[{actionId:'a',stepId:'query',checkId:'save'}],observations:[{actionId:'a',result:{title:'actual'},evidenceRefs:['evidence:one']}],verdicts:[{status:'fail',assertionRef:'saved-title',checkId:'save',evidenceRefs:['evidence:one']}]};
  assert.deepEqual(comparisonFor(check,check.verdicts[0]),{expected:'"expected"',actual:'"actual"',source:'saved.title'});
  check.observations[0].evidenceRefs=['evidence:unrelated'];assert.equal(comparisonFor(check,check.verdicts[0]).actual,'未取得');
  const run={status:'interrupted',checks:[{mode:'verify',verdicts:[{status:'pass'}]}]};
  assert.notEqual(resultSummary(run).kind,'pass');
  assert.equal(resultSummary({status:'completed',checks:[{mode:'observe',verdicts:[{status:'fail'}]}]}).kind,'observe');
  check.rule={id:'save-rule',expectedChanges:['保存内容一致'],invariants:[]};
  const text=issueSummaryText({id:'run-1',flow:{title:'提交'},status:'completed',checks:[check]});
  assert.ok(text.includes('实际值：未取得'));assert.ok(text.includes('evidence:one'));assert.ok(text.includes('保存内容一致'));
  const observed={template:{steps:[{stepId:'before',output:'original'},{stepId:'after',output:'edited'}],assertions:[{id:'priority',expr:{op:'eq',args:[{op:'field',var:'edited',path:['priority']},{op:'field',var:'original',path:['priority']}]}}]},actions:[{actionId:'before',stepId:'before',checkId:'edit'},{actionId:'after',stepId:'after',checkId:'edit'}],observations:[{actionId:'before',result:{priority:'high'},evidenceRefs:['before']},{actionId:'after',result:{priority:'low'},evidenceRefs:['after']}]};
  const compared=comparisonFor(observed,{assertionRef:'priority',checkId:'edit',evidenceRefs:['before','after']});
  assert.equal(compared.expected,'两项核对值应相等');assert.ok(compared.actual.includes('"low"'));assert.ok(compared.actual.includes('"high"'));
});
