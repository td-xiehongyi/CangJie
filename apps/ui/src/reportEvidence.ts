type Data=Record<string,any>;
export function resultSummary(run:Data){
  const findings=run.checks.filter((c:Data)=>c.mode==='verify').flatMap((c:Data)=>c.verdicts),failed=findings.filter((v:Data)=>v.status==='fail').length,unknown=findings.filter((v:Data)=>v.status==='inconclusive').length;
  if(run.status!=='completed')return {kind:'unfinished',title:run.status==='running'?'正在检查并收集证据':'本轮检查未完成'};
  if(!run.checks.length)return {kind:'unknown',title:'尚未取得检查证据'};
  if(run.checks.every((c:Data)=>c.mode==='observe'))return {kind:'observe',title:'已记录行为，尚未判断对错'};
  if(failed)return {kind:'fail',title:`发现 ${failed} 项业务问题`};
  if(unknown)return {kind:'unknown',title:`${unknown} 项缺少验证条件`};
  if(run.checks.every((c:Data)=>c.mode==='verify'&&c.verdicts.length&&c.verdicts.every((v:Data)=>v.status==='pass')))return {kind:'pass',title:'本轮所选检查通过'};
  return {kind:'unknown',title:'部分检查尚未判断对错'};
}
export function comparisonFor(check:Data,verdict:Data):{expected:string;actual:string;source:string}{
  const expr=check.template?.assertions.find((a:Data)=>a.id===verdict.assertionRef)?.expr;
  const missing={expected:'请参照本条预期规则',actual:'未取得',source:'未取得对应断言值'};
  if(!expr||!['eq','neq'].includes(expr.op)||expr.args.length!==2)return missing;
  const expectedIndex=expr.args.findIndex((arg:Data)=>arg.op==='const'||arg.op==='field'&&arg.var==='params');
  const path=(root:unknown,keys:string[])=>keys.reduce((v:any,k)=>v&&typeof v==='object'&&Object.hasOwn(v,k)?v[k]:undefined,root);
  const values:Record<string,unknown>={};
  for(const action of check.actions??[]){
    if(action.checkId!==verdict.checkId)continue;
    const observation=check.observations.find((o:Data)=>o.actionId===action.actionId&&o.evidenceRefs.some((ref:string)=>verdict.evidenceRefs.includes(ref)));
    const step=check.template.steps.find((s:Data)=>s.stepId===action.stepId);
    if(observation&&step)values[step.output]=observation.result;
  }
  const display=(v:unknown)=>v===undefined?'未取得':JSON.stringify(v);
  if(expectedIndex<0){
    if(!expr.args.every((a:Data)=>a.op==='field'))return missing;
    return {expected:expr.op==='eq'?'两项核对值应相等':'两项核对值应不同',actual:expr.args.map((a:Data,i:number)=>`核对值${i+1}：${display(path(values[a.var],a.path))}`).join('；'),source:expr.args.map((a:Data)=>`${a.var}.${a.path.join('.')}`).join('；')};
  }
  const expectedExpr=expr.args[expectedIndex],actualExpr=expr.args[1-expectedIndex];
  const expected=expectedExpr.op==='const'?expectedExpr.value:path(check.template.parameters,expectedExpr.path);
  const actual=actualExpr.op==='field'?path(values[actualExpr.var],actualExpr.path):undefined;
  return {expected:display(expected),actual:display(actual),source:actualExpr.op==='field'?`${actualExpr.var}.${actualExpr.path.join('.')}`:'未取得对应字段'};
}

export function issueSummaryText(run:Data):string{
  return [`${run.flow.title} · ${resultSummary(run).title}`,`运行：${run.id}`,`范围：仅本轮规则、测试副本和数据条件。`,...run.checks.filter((c:Data)=>c.mode==='verify').flatMap((c:Data)=>c.verdicts.filter((v:Data)=>v.status!=='pass').map((v:Data)=>{const values=comparisonFor(c,v);return [`规则：${c.rule.id}`,`预期行为：${[...c.rule.expectedChanges,...c.rule.invariants].join('；')}`,`预期值：${values.expected}`,`实际值：${values.actual}`,`记录来源：${values.source}`,`断言：${v.assertionRef}`,`证据：${v.evidenceRefs.join('、')}`,`下一步：${v.status==='fail'?'修复差异后，按本轮规则复测。':'补齐查询、身份和接口字段证据后复测。'}`].join('\n');}))].join('\n\n');
}
