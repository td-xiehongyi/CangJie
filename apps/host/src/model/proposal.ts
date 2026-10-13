import {readFile} from 'node:fs/promises';
import type {RuleContract,CapabilitySet,TemplateSpec,MappingSpec} from '@website-verification/contracts';
import {validateContract} from '@website-verification/contracts/validate';
import {ModelProvider,ModelFault} from './provider.js';
import type {ContextRequest,DisclosureConsent} from './context.js';
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
const operationFormat={create:{input:['title'],output:['id','title']},query:{input:['id'],output:['id','title','priority','ownerId','items']},update:{input:['id','title'],output:['id','title']}};
const semantics='field reads var + path from prior step output or params; const has value; eq/neq/contains/all/any have args; exists takes field arg; count/not take arg. query output fields are scalar normalized values, not an array. Outputs remain immutable snapshots. Missing fields are unknown, never pass. Assertions belong to a check and evaluate after its steps. Use distinct output names. Never use status codes as business assertions. Template limits: maxActions<=32, actionTimeoutMs<=5000, runTimeoutMs<=60000.';
export async function generateCandidate(provider:ModelProvider,rule:RuleContract,capabilities:CapabilitySet,context:ModelContext,revisionIndex:number,diagnostics:string[]=[]):Promise<unknown>{
  const schema=JSON.parse(await readFile(new URL('../../../../packages/contracts/schema.json',import.meta.url),'utf8'));
  // Include only the schema closure, never a complete target template, source,
  // case list, fixture, expected labels or target trial result.
  const definitions:Record<string,unknown>={};
  function include(name:string){if(Object.hasOwn(definitions,name))return;const def=schema.$defs[name];if(!def)throw new Error('MISSING_TEMPLATE_SCHEMA');definitions[name]=def;for(const match of JSON.stringify(def).matchAll(/#\/\$defs\/([A-Za-z0-9_]+)/g))include(match[1]!);}
  include('TemplateSpec');
  const result=await provider.json({...context,purpose:'candidate',instructions:`Generate one executable TemplateSpec JSON object satisfying the confirmed rule exactly. No wrapper, code, filesystem access or evaluation answers. Do not change the rule, omit invariants, hardcode observed values, or weaken assertions. ${semantics} Public assertion obligation ids for title-update-rule: updated-title, unchanged-priority, unchanged-owner. Declare title and newTitle parameters. Only those obligations and format constraints are supplied; construct the steps and expressions yourself. revision is a positive integer. Checks are independently reset; keep dependent steps in the same check.`,payload:{rule,capabilities,operationFormat,format:{$ref:'#/$defs/TemplateSpec',$defs:definitions},revisionIndex,diagnostics}});
  return result.value;
}
export function candidateShape(value:unknown,rule:RuleContract):value is TemplateSpec{
  if(!validateContract('TemplateSpec',value).valid)return false;const s=value as TemplateSpec;
  return s.ruleRef.id===rule.id&&s.ruleRef.version===rule.version&&s.limits.maxActions<=32&&s.limits.actionTimeoutMs<=5000&&s.limits.runTimeoutMs<=60000;
}
