import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import type {RuleContract,MappingSpec,CapabilitySet} from '@website-verification/contracts';
import type {ProjectRuleRef,ProjectRuleVersion} from '@website-verification/contracts/discovery';
import {validProjectRuleVersion} from '@website-verification/contracts/discovery';
import {validateMapping} from '../execution/mapping.js';
import {digest,inspectProject} from '../projects/inspect.js';
import {ProjectRuleStore} from './store.js';
import {projectRuleRef} from './readiness.js';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const directory=join(root,'.local-data/rule-compilations');
export {statusTransitionBehavior,statusTransitionRequirements} from '@website-verification/contracts/status-transition';
import {statusTransitionBehavior,statusTransitionRequirements} from '@website-verification/contracts/status-transition';
export interface CompiledRulePlan {status:'compiled';rule:RuleContract;ruleRef:ProjectRuleRef;resourceId:'status-transition';mappingHash:string;capabilities:CapabilitySet}
export interface CompileGap {status:'blocked';ruleRef:ProjectRuleRef;missing:{code:string;detail:string}[]}
interface Binding {schemaVersion:1;plan:CompiledRulePlan;ruleVersion:ProjectRuleVersion;ruleStoreDirectory:string;sourceRoot:string;sourceHash:string}
export const mappingDefinitionHash=(mapping:MappingSpec)=>{const {targetRef:_target,...definition}=mapping;return digest(definition)};
const sameRef=(a:ProjectRuleRef,b:ProjectRuleRef)=>a.projectId===b.projectId&&a.id===b.id&&a.version===b.version&&a.contentHash===b.contentHash;
function identity(id:string,version:number){if(!/^[a-f0-9-]{36}$/.test(id)||!Number.isSafeInteger(version)||version<1)throw new Error('INVALID_COMPILED_RULE_REF');return `${id}@${version}.json`}
/** A developer-owned, frozen semantic bridge. It does not infer equivalence from action names,
 * approve a candidate, or expose private cases to discovery/model context. */
async function frozenSemantic():Promise<void>{
  const resource=join(root,'tests/reference/status-transition'),manifestPath='tests/reference/status-transition/suite-manifest.json';
  let lock:Record<string,string>,manifest:any;
  try{lock=JSON.parse(await readFile(join(resource,'suite-lock.json'),'utf8'));manifest=JSON.parse(await readFile(join(root,manifestPath),'utf8'))}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new Error('VALIDATION_RESOURCE_GAP');throw e}
  if(!lock[manifestPath])throw new Error('VALIDATION_RESOURCE_GAP');
  // Only this host-private resource tree and its reviewed observation fixture are eligible.
  for(const [path,hash]of Object.entries(lock)){
    if(!/^tests\/reference\/status-transition\/[A-Za-z0-9_.-]+$/.test(path)&&!['tests/fixtures/status-transition-observations.json','tests/fixtures/status-transition-template.json'].includes(path))throw new Error('INVALID_VALIDATION_RESOURCE');
    if(digest(await readFile(join(root,path),'utf8'))!==hash)throw new Error('REFERENCE_CHANGED_REVIEW_REQUIRED');
  }
  const semantic=manifest.suites?.find((s:any)=>s.rule?.id==='status-transition-rule')?.semanticContract;
  if(!isDeepStrictEqual(semantic?.expectedBehavior,statusTransitionBehavior)||!isDeepStrictEqual(semantic?.requirements,statusTransitionRequirements))throw new Error('VALIDATION_SEMANTIC_MISMATCH');
}
export async function compileRulePlan(ruleVersion:ProjectRuleVersion,mapping:MappingSpec,capabilities:CapabilitySet):Promise<CompiledRulePlan|CompileGap>{
  const rule=structuredClone(ruleVersion),ruleRef=projectRuleRef(rule),missing:CompileGap['missing']=[];
  const gap=(code:string,detail:string)=>missing.push({code,detail});
  if(!validProjectRuleVersion(rule)||rule.confirmation.status!=='confirmed')gap('RULE_CONFIRMATION_REQUIRED','需要已确认的精确项目规则版本。');
  if(!isDeepStrictEqual(rule.expectedBehavior,statusTransitionBehavior)||!isDeepStrictEqual(rule.requirements,statusTransitionRequirements))gap('RULE_CAPABILITY_GAP','初版仅编译冻结的工单关闭性质；同名动作不能证明业务语义相同。');
  try{validateMapping(mapping)}catch{gap('OPERATION_MAPPING_GAP','接口映射无效。')}
  const allowed:Record<string,string[]>={create:['title','status','intent'],query:['id','intent','limit'],update:['status']};
  const required:Record<string,string[]>={create:['title','status'],query:['id'],update:['id','status']};
  for(const operationId of ['create','query','update']){
    const op=mapping.operations?.find(o=>o.operationId===operationId);
    const body=Object.values(op?.bodyBindings??{}),query=Object.values(op?.queryBindings??{}),path=[...(op?.path.match(/:[A-Za-z0-9_-]+/g)??[])].map(p=>p.slice(1));
    const inputs=[...body,...query,...path];
    if(!op||required[operationId]!.some(p=>!inputs.includes(p)))gap('OPERATION_MAPPING_GAP',`动作 ${operationId} 缺所需显式参数绑定。`);
    if(op&&(body.concat(query).some(p=>!allowed[operationId]!.includes(p))||path.some(p=>p!=='id')))gap('RULE_CAPABILITY_GAP',`动作 ${operationId} 含未允许参数；不执行脚本或任意字段。`);
    if(!capabilities.operations.includes(operationId))gap('RULE_CAPABILITY_GAP',`执行器缺动作 ${operationId}。`);
  }
  for(const field of ['id','title','status','ownerId'])if(!isDeepStrictEqual(mapping.resultBindings?.query?.[field],['items','0',field]))gap('BUSINESS_EVIDENCE_GAP',`受控验证仅支持 query.${field} → items[0].${field} 的已审查观察含义，禁止用同名声明或稳定ID替代。`);
  if(!mapping.queryCompleteness?.query)gap('QUERY_COMPLETENESS_GAP','查询缺完整性声明。');
  if(!capabilities.actorRefs.includes('owner')||!mapping.actorRefs?.includes('owner'))gap('ACTOR_CONDITION_GAP','缺所有者角色。');
  if(!['field','const','eq'].every(op=>capabilities.expressions.includes(op as 'eq')))gap('RULE_CAPABILITY_GAP','缺相等断言表达能力。');
  try{await frozenSemantic()}catch(e){gap((e as Error).message,'独立私有验证资源不可用或已变化，需开发者重新审查。')}
  if(missing.length)return {status:'blocked',ruleRef,missing};
  const executable:RuleContract={id:rule.id,version:rule.version,confirmation:'confirmed',source:`project-rule:${rule.projectId}:${rule.id}:${rule.version}:${rule.contentHash}`,preconditions:['合成工单初始状态 open；认证所有者；完整独立查询。'],expectedChanges:[statusTransitionBehavior[0]!,statusTransitionBehavior[1]!],invariants:[statusTransitionBehavior[2]!],completionDeadline:30000};
  return {status:'compiled',rule:executable,ruleRef,resourceId:'status-transition',mappingHash:mappingDefinitionHash(mapping),capabilities:structuredClone(capabilities)};
}
/** Bind only a still-current rule while the existing project transaction protects identity
 * and source validation. Registration is not validation, publication or formal review. */
export async function registerCompiledRule(store:ProjectRuleStore,ref:ProjectRuleRef,mapping:MappingSpec,capabilities:CapabilitySet,source:{root:string;hash:string;validateRuntime?:()=>void|Promise<void>}):Promise<CompiledRulePlan|CompileGap>{
  return store.withCurrentRule(ref,async rule=>{
    await source.validateRuntime?.();
    const profile=await inspectProject(source.root);if(!profile.supported||profile.sourceHash!==source.hash)throw new Error('CONDITIONS_CHANGED_RECONNECT_REQUIRED');
    const plan=await compileRulePlan(rule,mapping,capabilities);if(plan.status!=='compiled')return plan;
    const binding:Binding={schemaVersion:1,plan,ruleVersion:rule,ruleStoreDirectory:store.directory,sourceRoot:profile.root,sourceHash:profile.sourceHash};
    await source.validateRuntime?.();
    await mkdir(directory,{recursive:true});const path=join(directory,identity(ref.id,ref.version));
    try{await writeFile(path,JSON.stringify({record:binding,hash:digest(binding)},null,2)+'\n',{flag:'wx'})}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const existing=await readBinding(ref.id,ref.version);if(digest(existing)!==digest(binding))throw new Error('COMPILED_RULE_ALREADY_BOUND')}
    return plan;
  });
}
async function readBinding(id:string,version:number):Promise<Binding>{
  const saved=JSON.parse(await readFile(join(directory,identity(id,version)),'utf8')),binding=saved.record as Binding;
  if(!binding||saved.hash!==digest(binding)||binding.schemaVersion!==1||binding.plan.status!=='compiled'||binding.plan.rule.id!==id||binding.plan.rule.version!==version||!sameRef(binding.plan.ruleRef,projectRuleRef(binding.ruleVersion)))throw new Error('CORRUPT_COMPILED_RULE');
  const store=new ProjectRuleStore(binding.ruleStoreDirectory);const current=await store.assertCurrent(binding.plan.ruleRef);
  if(digest(current)!==digest(binding.ruleVersion))throw new Error('STALE_PROJECT_RULE');
  const profile=await inspectProject(binding.sourceRoot);if(!profile.supported||profile.sourceHash!==binding.sourceHash)throw new Error('STALE_PROJECT_RULE');
  await frozenSemantic();return binding;
}
export async function loadCompiledValidationRule(id:string,version=1):Promise<{rule:RuleContract;ruleRef:ProjectRuleRef;resourceId:'status-transition';bindingHash:string}|undefined>{
  if(!/^[a-f0-9-]{36}$/.test(id))return undefined;
  let binding:Binding;try{binding=await readBinding(id,version)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e}
  return {rule:structuredClone(binding.plan.rule),ruleRef:structuredClone(binding.plan.ruleRef),resourceId:binding.plan.resourceId,bindingHash:digest(binding)};
}
export async function assertCompiledRuleProject(rule:RuleContract,projectId:string,mapping:MappingSpec,sourceHash?:string,sourceRoot?:string):Promise<void>{
  if(!rule.source.startsWith('project-rule:'))return;
  const binding=await readBinding(rule.id,rule.version);
  if(binding.plan.ruleRef.projectId!==projectId||digest({...rule,confirmation:'confirmed'})!==digest(binding.plan.rule))throw new Error('RULE_PROJECT_MISMATCH');
  if(binding.plan.mappingHash!==mappingDefinitionHash(mapping))throw new Error('RULE_MAPPING_MISMATCH');
  if(sourceRoot!==undefined&&resolve(sourceRoot).toLowerCase()!==resolve(binding.sourceRoot).toLowerCase())throw new Error('RULE_PROJECT_MISMATCH');
  if(sourceHash!==undefined&&binding.sourceHash!==sourceHash)throw new Error('STALE_PROJECT_RULE');
}
