import {readFile} from 'node:fs/promises';
import type {RuleContract,CapabilitySet,TemplateSpec,MappingSpec} from '@website-verification/contracts';
import {validateContract} from '@website-verification/contracts/validate';
import {ModelProvider,ModelFault} from './provider.js';
import type {ContextRequest,DisclosureConsent} from './context.js';
import {statusTransitionObligations} from '@website-verification/contracts/status-transition';
import {executableParameters} from '../validation/parameters.js';
export interface ModelContext {context:ContextRequest;consent?:DisclosureConsent}
export interface TemplateCatalogEntry {id:string;title:string;ruleIds:string[]}
export interface Proposal {flow:{id:string;title:string};pendingRules:RuleContract[];mappingProposals:MappingSpec[];matchReasons:string[]}
function keys(value:any,allowed:string[]):boolean{return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===allowed.length&&allowed.every(k=>Object.hasOwn(value,k));}
export async function propose(provider:ModelProvider,context:ModelContext,catalog:TemplateCatalogEntry[]):Promise<Proposal>{
  // Catalog contains public descriptions only. Executable templates and their
  // private qualification fixtures never form part of an AI request.
  const publicCatalog=catalog.map(({id,title,ruleIds})=>({id,title,ruleIds}));
  const schema=JSON.parse(await readFile(new URL('../../../../packages/contracts/schema.json',import.meta.url),'utf8'));
  const definitions:Record<string,unknown>={};
  function include(name:string){if(Object.hasOwn(definitions,name))return;const def=schema.$defs[name];if(!def)throw new Error('MISSING_PROPOSAL_SCHEMA');definitions[name]=def;for(const match of JSON.stringify(def).matchAll(/#\/\$defs\/([A-Za-z0-9_]+)/g))include(match[1]!);}
  include('RuleContract');include('MappingSpec');
  const {value:p}=await provider.json({...context,purpose:'proposal',instructions:'Suggest exactly one main flow. Return JSON {flow:{id,title},pendingRules:[RuleContract],mappingProposals:[MappingSpec],matchReasons:[string]}. Use the supplied public schema definitions for every rule and mapping, including required fields and enums; add no other fields. Limits: flow id/title 1-200 characters, at most 16 rules, 4 mappings, 16 reasons of at most 1000 characters each. Every suggested rule must have confirmation:"pending". Suggestions do not authorize execution. Do not invent confirmed rules. If no mapping change is needed, return mappingProposals: [].',payload:{catalog:publicCatalog,format:{$defs:definitions}}});
  if(!keys(p,['flow','pendingRules','mappingProposals','matchReasons'])||!keys(p.flow,['id','title'])||![p.flow.id,p.flow.title].every(v=>typeof v==='string'&&v.length>0&&v.length<=200)||!Array.isArray(p.pendingRules)||p.pendingRules.length>16||!Array.isArray(p.mappingProposals)||p.mappingProposals.length>4||!Array.isArray(p.matchReasons)||p.matchReasons.length>16||!p.matchReasons.every((v:unknown)=>typeof v==='string'&&v.length<=1000)||!p.pendingRules.every((r:RuleContract)=>r.confirmation==='pending'&&validateContract('RuleContract',r).valid)||!p.mappingProposals.every((m:MappingSpec)=>validateContract('MappingSpec',m).valid))throw new ModelFault('INVALID_PROPOSAL','output');
  return p;
}
const operationFormat={create:{input:['title','intent'],output:['id','title']},query:{input:['id','intent','limit'],output:['id','title','priority','ownerId','items']},update:{input:['id','title'],output:['id','title']}};
// Public executor interface only; no private samples, verdicts or expressions.
const executionRequirements:Record<string,{parameters:string[];assertionIds:string[];singleCheck:boolean;steps:{operationId:string;actorRef:string}[]}>= {
 'save-rule':{parameters:['title'],assertionIds:['saved-title'],singleCheck:true,steps:[{operationId:'create',actorRef:'owner'},{operationId:'query',actorRef:'owner'}]},
 'duplicate-rule':{parameters:['title','intent'],assertionIds:['one-result'],singleCheck:true,steps:[{operationId:'create',actorRef:'owner'},{operationId:'create',actorRef:'owner'},{operationId:'query',actorRef:'owner'}]},
 'permission-rule':{parameters:['title'],assertionIds:['not-visible'],singleCheck:true,steps:[{operationId:'create',actorRef:'owner'},{operationId:'query',actorRef:'other'}]},
 'title-update-rule':{parameters:['title','newTitle'],assertionIds:['updated-title','unchanged-priority','unchanged-owner'],singleCheck:true,steps:[{operationId:'create',actorRef:'owner'},{operationId:'query',actorRef:'owner'},{operationId:'update',actorRef:'owner'},{operationId:'query',actorRef:'owner'}]}
};
const semantics='parameters contains concrete runtime values, not JSON Schema or type declarations. Read declared concrete inputs through params field expressions rather than hardcoded values. field reads var + path from prior step output or params; const has value; eq/neq/contains/all/any have args; exists takes field arg; count/not take arg. query output fields are scalar normalized values, not an array. Outputs remain immutable snapshots. Missing fields are unknown, never pass. Assertions belong to a check and evaluate after its steps. Use distinct output names. Never use status codes as business assertions. Template limits: maxActions<=32, actionTimeoutMs<=5000, runTimeoutMs<=min(60000, rule.completionDeadline).';
export interface CandidateReference {applicable:string[];excluded:string[];instructions:string}
export async function generateCandidate(provider:ModelProvider,rule:RuleContract,capabilities:CapabilitySet,context:ModelContext,revisionIndex:number,diagnostics:string[]=[]):Promise<{spec:unknown;reference?:CandidateReference}>{
  const schema=JSON.parse(await readFile(new URL('../../../../packages/contracts/schema.json',import.meta.url),'utf8'));
  // Include only the schema closure, never a complete target template, source,
  // case list, fixture, expected labels or target trial result.
  const definitions:Record<string,unknown>={};
  function include(name:string){if(Object.hasOwn(definitions,name))return;const def=schema.$defs[name];if(!def)throw new Error('MISSING_TEMPLATE_SCHEMA');definitions[name]=def;for(const match of JSON.stringify(def).matchAll(/#\/\$defs\/([A-Za-z0-9_]+)/g))include(match[1]!);}
  include('TemplateSpec');
  (definitions.TemplateSpec as any).properties.requiredCapabilities={...schema.$defs.Strings,items:{type:'string',enum:[...capabilities.operations]}};
  const statusRule=rule.source.startsWith('project-rule:')||rule.id==='status-transition-rule';
  const obligations=statusRule?`Controlled status-transition public obligations: ${statusTransitionObligations.join(', ')}. Declare concrete nonempty title and intent parameters. Require rejected acceptance for the forbidden reopen request, query its final business state, and assert title and ownership separately after closing and after rejected reopening.`:rule.id==='title-update-rule'?'Public assertion obligation ids: updated-title, unchanged-priority, unchanged-owner. Declare distinct nonempty concrete title and newTitle parameters.':'Declare concrete parameters required by this confirmed rule and the public operation format.';
  const result=await provider.json({...context,purpose:'candidate',instructions:`Return JSON with exactly two fields: spec (one executable TemplateSpec satisfying the confirmed rule exactly) and reference (Chinese draft guidance with applicable:string[], excluded:string[], instructions:string). Reference must describe only prerequisites, exclusions and usage supported by the rule and proposed steps; do not claim validation, review, publication or cross-project success. Each list has 1-16 nonempty items of at most 500 characters; instructions is at most 3000 characters. No code, filesystem access or evaluation answers. Do not change the rule, omit invariants, hardcode observed values, or weaken assertions. ${semantics} ${obligations} requiredCapabilities must contain only operation IDs from capabilities.operations, never actors or expression names. Follow supplied executionRequirements exactly: declare its concrete parameters, use exactly its assertion IDs and ordered operation/actor sequence in one check. These are public executor constraints, not validation answers; construct bindings and expressions yourself. Do not add update operations to a submission-only rule. revision is a positive integer. Checks are independently reset; keep dependent steps in the same check.`,payload:{rule,capabilities,executionRequirements:executionRequirements[rule.id],operationFormat:statusRule?{create:{input:['title','status'],output:['id','title','status','ownerId']},query:{input:['id'],output:['id','title','status','ownerId','items']},update:{input:['id','status'],output:['id','title','status','ownerId']}}:operationFormat,format:{type:'object',required:['spec','reference'],additionalProperties:false,properties:{spec:{$ref:'#/$defs/TemplateSpec'},reference:{type:'object',required:['applicable','excluded','instructions'],additionalProperties:false,properties:{applicable:{type:'array',minItems:1,maxItems:16,items:{type:'string',minLength:1,maxLength:500}},excluded:{type:'array',minItems:1,maxItems:16,items:{type:'string',minLength:1,maxLength:500}},instructions:{type:'string',minLength:1,maxLength:3000}}}},$defs:definitions},revisionIndex,diagnostics}});
  const value=result.value;
  // Older responses and saved candidates still use the bare executable contract.
  const spec=Object.hasOwn(value,'spec')?value.spec:value;
  if(Array.isArray(spec?.requiredCapabilities)&&spec.requiredCapabilities.some((id:string)=>!capabilities.operations.includes(id)&&(capabilities.actorRefs.includes(id)||capabilities.expressions.includes(id as any))))throw new ModelFault('INVALID_CAPABILITY_DECLARATION','output');
  if(!Object.hasOwn(value,'spec'))return {spec:value};
  if(Object.keys(value).some(k=>!['spec','reference'].includes(k)))throw new ModelFault('INVALID_CANDIDATE_RESPONSE','output');
  const reference=value.reference;
  const valid=keys(reference,['applicable','excluded','instructions'])&&
    [reference.applicable,reference.excluded].every(a=>Array.isArray(a)&&a.length>0&&a.length<=16&&a.every(v=>typeof v==='string'&&v.trim()&&v.length<=500))&&
    typeof reference.instructions==='string'&&!!reference.instructions.trim()&&reference.instructions.length<=3000;
  return {spec:value.spec,...(valid?{reference:reference as CandidateReference}:{})};
}
export function candidateShape(value:unknown,rule:RuleContract):value is TemplateSpec{
  if(!validateContract('TemplateSpec',value).valid)return false;const s=value as TemplateSpec;
  const required=executionRequirements[rule.id];
  if(required&&(s.checks.length!==1||required.parameters.some(p=>typeof s.parameters[p]!=='string'||!String(s.parameters[p]).trim())||s.assertions.length!==required.assertionIds.length||required.assertionIds.some(id=>!s.assertions.some(a=>a.id===id&&a.checkId===s.checks[0]))||s.steps.length!==required.steps.length||s.steps.some((step,i)=>step.operationId!==required.steps[i]!.operationId||step.actorRef!==required.steps[i]!.actorRef||step.checkId!==s.checks[0])))return false;
  return s.ruleRef.id===rule.id&&s.ruleRef.version===rule.version&&executableParameters(s,rule)&&s.limits.maxActions<=32&&s.limits.actionTimeoutMs<=5000&&s.limits.runTimeoutMs<=Math.min(60000,rule.completionDeadline);
}
