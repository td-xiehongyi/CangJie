type Data=Record<string,any>;
export function resultSummary(run:Data){
  const groups=groupedChecks(run),failed=groups.find(g=>g.kind==='fail')!.checks.length,unknown=groups.find(g=>g.kind==='unknown')!.checks.length;
  if(run.status!=='completed')return {kind:'unfinished',title:run.status==='running'?'正在检查并收集证据':'本轮检查未完成'};
  if(!run.checks.length)return {kind:'unknown',title:'尚未取得检查证据'};
  if(!unknown&&run.checks.every((c:Data)=>c.mode==='observe'))return {kind:'observe',title:'已记录行为，尚未判断对错'};
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

export type CheckOutcome='fail'|'unknown'|'pass'|'observe';
export const outcomeLabels:Record<CheckOutcome,string>={fail:'发现问题',unknown:'尚不能判断',pass:'本轮通过',observe:'仅观察'};
export function checkOutcome(check:Data):CheckOutcome{
 if(check.notExecuted)return 'unknown';
 if(check.mode==='observe')return 'observe';
 if(check.verdicts?.some((v:Data)=>v.status==='fail'))return 'fail';
 if(check.status&&check.status!=='completed'||!check.verdicts?.length||check.verdicts.some((v:Data)=>v.status!=='pass'))return 'unknown';
 return 'pass';
}
/** Include planned but unexecuted checks so stopping cannot silently shrink coverage. */
export function groupedChecks(run:Data){
 const checks=[...run.checks,...(run.plan?.checks??[]).filter((p:Data)=>!run.checks.some((c:Data)=>c.rule.id===p.rule.id)).map((p:Data)=>({...p,status:'not_started',notExecuted:true,actions:[],observations:[],verdicts:[]}))];
 return (['fail','unknown','pass','observe'] as const).map(kind=>({kind,title:outcomeLabels[kind],checks:checks.filter(check=>checkOutcome(check)===kind)}));
}
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
 return value;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const identities=(check:Data)=>check.preparation?.accounts?.map((a:Data)=>({actorRef:a.actorRef,userId:a.userId,role:a.role}));
const versionKnown=(check:Data)=>typeof check.templateRef?.id==='string'&&!!check.templateRef.version&&/^[a-f0-9]{64}$/.test(check.templateRef.hash??'');
export function compareRuns(previous:Data|undefined,current:Data){
 const unavailable=(reason:string)=>({available:false,reason,sourceChanged:false,mappingChanged:false,rows:[] as Data[]});
 if(!previous)return unavailable('原运行未保存在当前工作台，无法对比；本次结果仍可查看。');
 if(previous.projectId!==current.projectId||current.parentRunId!==previous.id)return unavailable('运行不属于同一项目或没有原运行关联，不能对比。');
 const sourceChanged=previous.plan.sourceHash!==current.plan.sourceHash,mappingChanged=!same(previous.plan.mapping,current.plan.mapping);
 const before=groupedChecks(previous).flatMap(g=>g.checks),after=groupedChecks(current).flatMap(g=>g.checks);
 const ids=[...new Set([...before,...after].map(c=>c.rule.id))];
 const rows=ids.map(ruleId=>{
  const old=before.find(c=>c.rule.id===ruleId),next=after.find(c=>c.rule.id===ruleId);
  const previousOutcome=old?checkOutcome(old):undefined,currentOutcome=next?checkOutcome(next):undefined;
  let comparable=false,conclusion:string;
  if(!old)conclusion='新增检查，没有上次结果可比较';
  else if(!next||next.notExecuted)conclusion='本次未检查，不能确认修复';
  else if(old.notExecuted)conclusion='上次未执行，没有结果可比较';
  else if(old.mode!=='verify'||next.mode!=='verify')conclusion='包含仅观察记录，不判断是否修复';
  else if(!same(old.rule,next.rule)||!same(old.templateRef,next.templateRef))conclusion='检查标准已变化，不能直接比较';
  else if(!versionKnown(old)||!versionKnown(next))conclusion='缺少固定版本信息，不能直接比较';
  else if(previous.status!=='completed'||current.status!=='completed')conclusion='运行尚未完整完成，不能确认修复';
  else if(mappingChanged)conclusion='接口映射已变化，不能直接判定修复';
  else if(!old.preparation?.data||!next.preparation?.data||!identities(old)?.length||!identities(next)?.length||!previous.plan.sourceHash||!current.plan.sourceHash)conclusion='运行条件记录不完整，不能直接判定修复';
  else if(!old.preparation.baseline?.summary?.hash||!next.preparation.baseline?.summary?.hash)conclusion='缺少实际数据基线摘要，不能直接判定修复';
  else if(old.preparation.baseline.summary.hash!==next.preparation.baseline.summary.hash)conclusion='实际测试数据基线已变化，不能直接判定修复';
  else if(!same(old.preparation.data,next.preparation.data)||!same(identities(old),identities(next)))conclusion='测试数据或身份条件已变化，不能直接判定修复';
  else{
   comparable=true;
   conclusion=currentOutcome==='unknown'||previousOutcome==='unknown'?'证据不足，仍不能确认是否解决':currentOutcome==='fail'?(previousOutcome==='fail'?'仍发现问题':'本次发现不符合预期的结果'):previousOutcome==='fail'?'原问题在本次条件下未复现':'两次均符合本条预期';
  }
  return {ruleId,previousCheck:old,currentCheck:next,previous:old?.notExecuted?'未执行':previousOutcome?outcomeLabels[previousOutcome]:'未检查',current:next?.notExecuted?'未执行':currentOutcome?outcomeLabels[currentOutcome]:'未检查',conclusion,comparable};
 });
 return {available:true,reason:undefined,sourceChanged,mappingChanged,rows};
}
