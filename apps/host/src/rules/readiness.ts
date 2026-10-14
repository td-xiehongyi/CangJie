import type {ProjectRuleRef,ProjectRuleVersion,RuleReadiness} from '@website-verification/contracts/discovery';
import {validRuleRequirements} from '@website-verification/contracts/discovery';
export interface ProjectCapabilities {
  operations:{operationId:string;parameters:string[];mapped:boolean}[];actorRefs:string[];
  observations:{operationId:string;field:string;businessEvidence:boolean;complete:boolean}[];
  assertions:string[];dataConditions:string[];
}
export interface RuleTemplateEntry {ruleRef:ProjectRuleRef;ref:{id:string;version:string;hash:string};qualified:boolean;projectTrialPassed:boolean}
export interface RuleValidationEntry {ruleRef:ProjectRuleRef;independent:boolean;usedAsDiscoveryInput:boolean;normal:boolean;defect:boolean;inconclusive:boolean;resourceRef:string}
export const projectRuleRef=(r:ProjectRuleVersion):ProjectRuleRef=>({projectId:r.projectId,id:r.id,version:r.version,contentHash:r.contentHash});
const same=(a:ProjectRuleRef,b:ProjectRuleRef)=>a.projectId===b.projectId&&a.id===b.id&&a.version===b.version&&a.contentHash===b.contentHash;
/** Read-only capability assessment. It neither certifies resources nor authorizes execution. */
export function assessRule(rule:ProjectRuleVersion,capabilities:ProjectCapabilities,templateCatalog:RuleTemplateEntry[],validationCatalog:RuleValidationEntry[]):RuleReadiness{
  const ruleRef=projectRuleRef(rule),missing:RuleReadiness['missing']=[];let capabilityGap=false;
  const gap=(code:string,detail:string,capability=false)=>{missing.push({code,detail});capabilityGap||=capability};
  if(rule.confirmation.status!=='confirmed')gap('RULE_CONFIRMATION_REQUIRED','关键预期尚未确认；修订版本须重新确认。');
  const needs=rule.requirements;
  if(!needs||!validRuleRequirements(needs)||!needs.operations.length||!needs.observations.length||!needs.assertions.length){gap('RULE_CAPABILITY_GAP','业务语义尚未映射为明确动作、角色、参数、观察字段与断言。',true)}else{
    for(const op of needs.operations){const supported=capabilities.operations.find(c=>c.operationId===op.operationId);if(!supported)gap('RULE_CAPABILITY_GAP',`执行器不支持动作 ${op.operationId}。`,true);else{if(op.parameters.some(p=>!supported.parameters.includes(p)))gap('RULE_CAPABILITY_GAP',`动作 ${op.operationId} 的参数表达能力不足。`,true);if(!supported.mapped)gap('OPERATION_MAPPING_GAP',`待补动作 ${op.operationId} 的本项目接口映射。`)}if(!capabilities.actorRefs.includes(op.actorRef))gap('ACTOR_CONDITION_GAP',`待补登录角色 ${op.actorRef}。`)}
    for(const observation of needs.observations){const known=capabilities.observations.find(c=>c.operationId===observation.operationId&&c.field===observation.field);if(!known||!known.businessEvidence)gap('BUSINESS_EVIDENCE_GAP',`待补 ${observation.operationId}.${observation.field} 的可靠业务证据，HTTP状态不能代替断言。`);else if(observation.requiresComplete&&!known.complete)gap('QUERY_COMPLETENESS_GAP',`观察 ${observation.operationId}.${observation.field} 缺完整性证明。`)}
    for(const expression of needs.assertions)if(!capabilities.assertions.includes(expression))gap('RULE_CAPABILITY_GAP',`断言表达式 ${expression} 尚不支持。`,true);
    for(const condition of needs.dataConditions)if(!capabilities.dataConditions.includes(condition))gap('DATA_CONDITION_GAP',`待补测试数据条件：${condition}。`);
  }
  if(!validationCatalog.some(v=>same(v.ruleRef,ruleRef)&&v.independent&&!v.usedAsDiscoveryInput&&v.normal&&v.defect&&v.inconclusive&&typeof v.resourceRef==='string'&&v.resourceRef.trim()))gap('VALIDATION_RESOURCE_GAP','缺此精确规则版本的独立正常、缺陷和证据不足验证资源；旧规则资源不得借用。');
  if(missing.length)return {ruleRef,status:capabilityGap?'needs_capability':'needs_conditions',missing};
  const matched=templateCatalog.find(t=>same(t.ruleRef,ruleRef)&&t.qualified&&t.projectTrialPassed);
  return {ruleRef,status:matched?'reusable':'generatable',missing:[],...(matched?{matchedTemplateRef:structuredClone(matched.ref)}:{})};
}
