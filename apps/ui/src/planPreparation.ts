type Candidate=Record<string,any>;
/** Describe recorded evidence, never infer business success from a finished task. */
export function preparationProgress(selected:number,reusable:number,candidate?:Candidate){
 const reused=selected>0&&selected===reusable;
 const active=['validating','running'].includes(candidate?.status);
 const gates=candidate?.validation?.gateResults,trial=candidate?.trial;
 const verdicts=trial?.verdicts??[];
 return [
  {label:'匹配已有方案',value:selected?`${reusable} 项可复用，${selected-reusable} 项待准备`:'待选择本轮检查项'},
  {label:'准备新方案',value:candidate?.spec?'已生成':active?'正在生成':reused?'无需创建新方案':'等待准备'},
  {label:'验证方案可靠性',value:gates?(gates.admitted?'已通过':'尚未通过'):active&&candidate?.spec?'正在验证':reused?'沿用已有审核证据':'尚未完成'},
  {label:'在项目副本试运行',value:trial?.completed?(verdicts.some((v:Candidate)=>v.status==='fail')?'已完成，发现业务问题':!verdicts.length||verdicts.some((v:Candidate)=>v.status==='inconclusive')?'已完成，证据不足':'已完成，请核对证据'):candidate?.phase==='awaiting_trial'?'等待确认或补齐条件后试运行':active&&gates?.admitted?'正在试运行':reused?'本次未重新试运行':'尚未完成'}
 ];
}
