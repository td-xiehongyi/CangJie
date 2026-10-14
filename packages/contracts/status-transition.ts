import type {RuleRequirements} from './discovery.js';
/** Public controlled contract: explicit user selection is required; no validation answers. */
export const statusTransitionBehavior=['工单允许 open→closed。','closed 后请求 open 必须被拒绝，状态仍为 closed。','标题和归属保持不变。'];
export const statusTransitionRequirements:RuleRequirements={operations:[{operationId:'create',actorRef:'owner',parameters:['title','status']},{operationId:'query',actorRef:'owner',parameters:['id']},{operationId:'update',actorRef:'owner',parameters:['id','status']}],observations:['id','title','status','ownerId'].map(field=>({operationId:'query',field,requiresComplete:true})),assertions:['eq'],dataConditions:['synthetic-status-ticket']};
export const statusTransitionObligations=['closed-status','remains-closed','unchanged-title','unchanged-owner','closed-unchanged-title','closed-unchanged-owner'];
