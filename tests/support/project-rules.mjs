import {mock} from 'node:test';
// Explicit opt-in only: production native Windows locking is never changed.
if(process.env.CANGJIE_TEST_MUTEX==='1'){
  const held=new Set();
  mock.module('../../apps/host/dist/model/task-lock.js',{namedExports:{async acquireTask(id){if(held.has(id))throw new Error('CANDIDATE_BUSY');held.add(id);return async()=>{held.delete(id)}}}});
}
export const {ProjectRuleStore}=await import('../../apps/host/dist/rules/store.js');
export const {assessRule}=await import('../../apps/host/dist/rules/readiness.js');
export const ref={snapshotId:'snapshot',path:'src/orders.ts',fileHash:'a'.repeat(64),startLine:1,endLine:2,excerptHash:'b'.repeat(64)};
export const suggestion={id:'owner-only',status:'suggestion',flow:'订单取消',facts:[{text:'任何人可修改',sourceRefs:[ref]}],expectations:[{text:'仅所有者可修改',source:'documentation',confirmation:'pending',sourceRefs:[ref]}],risks:[],openQuestions:['取消是否仅所有者？'],sourceRefs:[ref],priorityReason:'归属隔离',operationNeeds:['query','update'],observationNeeds:['ownerId','state']};
export const requirements={operations:[{operationId:'query',actorRef:'owner',parameters:['id']},{operationId:'update',actorRef:'other',parameters:['id','title']}],observations:[{operationId:'query',field:'ownerId',requiresComplete:true},{operationId:'query',field:'title',requiresComplete:true}],assertions:['eq'],dataConditions:['owned-order']};
export const input={suggestionRef:{discoveryId:'analysis',suggestionId:suggestion.id},suggestion,answers:{'取消是否仅所有者？':'是'},expectedBehavior:['仅所有者可修改，其他人被拒绝且内容不变'],requirements,confirmed:true};
export function capabilities(){return {operations:[{operationId:'query',parameters:['id'],mapped:true},{operationId:'update',parameters:['id','title'],mapped:true}],actorRefs:['owner','other'],observations:[{operationId:'query',field:'ownerId',businessEvidence:true,complete:true},{operationId:'query',field:'title',businessEvidence:true,complete:true}],assertions:['eq'],dataConditions:['owned-order']}}
export function resources(rule){return [{ruleRef:{projectId:rule.projectId,id:rule.id,version:rule.version,contentHash:rule.contentHash},independent:true,usedAsDiscoveryInput:false,normal:true,defect:true,inconclusive:true,resourceRef:'private:test'}]}
