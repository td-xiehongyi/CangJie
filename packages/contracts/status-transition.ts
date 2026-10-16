import type {RuleRequirements} from './discovery.js';
/** Public controlled contract: explicit user selection is required; no validation answers. */
export const statusTransitionBehavior=['工单允许 open→closed。','closed 后请求 open 必须被拒绝，状态仍为 closed。','标题和归属保持不变。'];
/** Explicitly confirmed behavior is required; a matching name alone grants nothing. */
export function matchesStatusTransitionBusiness(flow:unknown,behavior:unknown):boolean{
 return typeof flow==='string'&&/(?:工单|\btickets?\b)/i.test(flow)&&/关闭|关单|\bclos(?:e|ed|ing)\b|状态流转/i.test(flow)
  &&!/(?:修改|更改|更新|编辑|重命名|update|edit|change|rename).*?(?:标题|title)|(?:标题|title).*?(?:修改|更改|更新|编辑|重命名|update|edit|change|rename)/i.test(flow)
  &&Array.isArray(behavior)&&behavior.length===statusTransitionBehavior.length&&behavior.every((value,i)=>value===statusTransitionBehavior[i]);
}
export const statusTransitionRequirements:RuleRequirements={operations:[{operationId:'create',actorRef:'owner',parameters:['title','status']},{operationId:'query',actorRef:'owner',parameters:['id']},{operationId:'update',actorRef:'owner',parameters:['id','status']}],observations:['id','title','status','ownerId'].map(field=>({operationId:'query',field,requiresComplete:true})),assertions:['eq'],dataConditions:['synthetic-status-ticket']};
export const statusTransitionObligations=['closed-status','remains-closed','unchanged-title','unchanged-owner','closed-unchanged-title','closed-unchanged-owner'];
