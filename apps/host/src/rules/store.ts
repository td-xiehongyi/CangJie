import {mkdir,readFile,open} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {BusinessSuggestion,ProjectRuleRef,ProjectRuleVersion,RuleRequirements} from '@website-verification/contracts/discovery';
import {validProjectRuleVersion,validRuleRequirements} from '@website-verification/contracts/discovery';
import {digest} from '../projects/inspect.js';
import {replaceFile} from '../artifacts/replace.js';
import {acquireTask} from '../model/task-lock.js';
export interface ProjectRuleCollection {projectId:string;revision:number;versions:ProjectRuleVersion[];selectedRule?:ProjectRuleRef}
interface StoredRules extends Omit<ProjectRuleCollection,'versions'> {history:ProjectRuleVersion[]}
export interface ConfirmRuleInput {suggestionRef:ProjectRuleVersion['suggestionRef'];suggestion:BusinessSuggestion;answers:Record<string,string>;expectedBehavior:string[];requirements?:RuleRequirements;confirmed:boolean}
const id=(v:string)=>{if(typeof v!=='string'||!/^[a-f0-9-]{36}$/.test(v))throw new Error('INVALID_ID')};
const revision=(v:number)=>{if(!Number.isSafeInteger(v)||v<0)throw new Error('RULE_REVISION_CONFLICT')};
const reference=(v:ProjectRuleVersion):ProjectRuleRef=>({projectId:v.projectId,id:v.id,version:v.version,contentHash:v.contentHash});
const sameRef=(a:ProjectRuleRef,b:ProjectRuleRef)=>a.projectId===b.projectId&&a.id===b.id&&a.version===b.version&&a.contentHash===b.contentHash;
function contentHash(r:ProjectRuleVersion){const {contentHash:_hash,confirmation:_confirmation,corrections:_corrections,...semantics}=r;return digest(semantics)}
function stamp(r:ProjectRuleVersion){r.contentHash=contentHash(r);if(!validProjectRuleVersion(r))throw new Error('INVALID_PROJECT_RULE');return r}
function complete(r:ProjectRuleVersion){if(!r.answers||typeof r.answers!=='object'||Array.isArray(r.answers)||!r.openQuestions.every(q=>typeof r.answers[q]==='string'&&r.answers[q]!.trim()))throw new Error('RULE_CONFIRMATION_REQUIRED')}
/** One atomic append per project; prior versions are never edited or overwritten.
 * The existing native mutex protects revisions across independent host processes. */
export class ProjectRuleStore {
  readonly directory:string;
  constructor(directory:string,private options:{validateSources?:(rule:ProjectRuleVersion)=>Promise<void>}={}){this.directory=resolve(directory)}
  private path(projectId:string){id(projectId);return join(this.directory,projectId+'.json')}
  private async read(projectId:string):Promise<StoredRules>{
    let saved:any;try{saved=JSON.parse(await readFile(this.path(projectId),'utf8'))}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {projectId,revision:0,history:[]};throw e}
    const r=saved.record as StoredRules;
    if(!r||saved.hash!==digest(r)||r.projectId!==projectId||!Number.isSafeInteger(r.revision)||r.revision<0||!Array.isArray(r.history)||!r.history.every(v=>validProjectRuleVersion(v)&&v.projectId===projectId&&v.contentHash===contentHash(v)))throw new Error('CORRUPT_PROJECT_RULES');
    const latest=new Map<string,number>();for(const v of r.history){if(v.version!==(latest.get(v.id)??0)+1)throw new Error('CORRUPT_PROJECT_RULES');latest.set(v.id,v.version)}
    if(r.selectedRule){const v=r.history.find(v=>v.id===r.selectedRule!.id&&v.version===r.selectedRule!.version);if(!v||!sameRef(reference(v),r.selectedRule)||v.confirmation.status!=='confirmed'||v.version!==latest.get(v.id))throw new Error('CORRUPT_PROJECT_RULES')}
    return r;
  }
  private async mutate<T>(projectId:string,expectedRevision:number,work:(r:StoredRules)=>T|Promise<T>):Promise<T>{
    id(projectId);revision(expectedRevision);let release:()=>Promise<void>;try{release=await acquireTask(projectId)}catch(e){if((e as Error).message==='CANDIDATE_BUSY')throw new Error('RULE_REVISION_CONFLICT');throw e}
    try{const r=await this.read(projectId);if(r.revision!==expectedRevision)throw new Error('RULE_REVISION_CONFLICT');const result=await work(r);r.revision++;
      await mkdir(this.directory,{recursive:true});const tmp=join(this.directory,randomUUID()+'.tmp');const handle=await open(tmp,'wx');try{await handle.writeFile(JSON.stringify({record:r,hash:digest(r)}));await handle.sync()}finally{await handle.close()}await replaceFile(tmp,this.path(projectId));return structuredClone(result);
    }finally{await release()}
  }
  async list(projectId:string):Promise<ProjectRuleCollection>{const r=await this.read(projectId),latest=new Map<string,ProjectRuleVersion>();for(const v of r.history)latest.set(v.id,v);return structuredClone({projectId,revision:r.revision,versions:[...latest.values()],...(r.selectedRule?{selectedRule:r.selectedRule}:{})})}
  async confirmProjectRule(projectId:string,input:ConfirmRuleInput,expectedRevision:number):Promise<ProjectRuleVersion>{
    input=structuredClone(input);if(input.confirmed!==true)throw new Error('RULE_CONFIRMATION_REQUIRED');
    return this.mutate(projectId,expectedRevision,async r=>{
      const s=input.suggestion;if(!s||s.status!=='suggestion'||input.suggestionRef?.suggestionId!==s.id)throw new Error('INVALID_PROJECT_RULE');
      if(r.history.some(v=>v.suggestionRef.discoveryId===input.suggestionRef.discoveryId&&v.suggestionRef.suggestionId===input.suggestionRef.suggestionId))throw new Error('RULE_ALREADY_EXISTS');
      const rule:ProjectRuleVersion={projectId,id:randomUUID(),version:1,contentHash:'',suggestionRef:input.suggestionRef,sourceRefs:[...new Map([...s.sourceRefs,...s.facts.flatMap(f=>f.sourceRefs),...s.expectations.flatMap(e=>e.sourceRefs),...s.risks.flatMap(r=>r.sourceRefs)].map(ref=>[digest(ref),ref])).values()],flow:s.flow,facts:s.facts,expectations:s.expectations,openQuestions:s.openQuestions,answers:input.answers,expectedBehavior:input.expectedBehavior,operationNeeds:s.operationNeeds,observationNeeds:s.observationNeeds,...(input.requirements?{requirements:input.requirements}:{}),confirmation:{status:'confirmed',time:new Date().toISOString(),actor:'local_user'},corrections:[]};
      if(input.requirements!==undefined&&!validRuleRequirements(input.requirements))throw new Error('INVALID_PROJECT_RULE');complete(rule);stamp(rule);await this.options.validateSources?.(rule);r.history.push(rule);return rule;
    });
  }
  async getProjectRule(projectId:string,ruleId:string,version:number):Promise<ProjectRuleVersion>{id(ruleId);if(!Number.isSafeInteger(version)||version<1)throw new Error('RULE_NOT_FOUND');const r=await this.read(projectId),v=r.history.find(v=>v.id===ruleId&&v.version===version);if(!v)throw new Error('RULE_NOT_FOUND');return structuredClone(v)}
  private current(r:StoredRules,ref:ProjectRuleRef){if(ref.projectId!==r.projectId)throw new Error('RULE_PROJECT_MISMATCH');const latest=r.history.filter(v=>v.id===ref.id).at(-1);if(!latest||!sameRef(reference(latest),ref))throw new Error('STALE_PROJECT_RULE');return latest}
  async reviseProjectRule(ref:ProjectRuleRef,changes:{expectedBehavior:string[];answers?:Record<string,string>;note:string;requirements?:RuleRequirements},expectedRevision:number):Promise<ProjectRuleVersion>{
    ref=structuredClone(ref);changes=structuredClone(changes);return this.mutate(ref.projectId,expectedRevision,async r=>{const current=this.current(r,ref);if(typeof changes.note!=='string'||!changes.note.trim())throw new Error('RULE_CORRECTION_REQUIRED');const next=stamp({...current,version:current.version+1,expectedBehavior:changes.expectedBehavior,answers:changes.answers??current.answers,...(changes.requirements!==undefined?{requirements:changes.requirements}:{}),confirmation:{status:'pending'},corrections:[...current.corrections,{time:new Date().toISOString(),note:changes.note,previousVersion:current.version}]});await this.options.validateSources?.(next);r.history.push(next);if(r.selectedRule?.id===next.id)delete r.selectedRule;return next});
  }
  async appendRuleCorrection(ref:ProjectRuleRef,note:string,expectedRevision:number):Promise<ProjectRuleVersion>{
    ref=structuredClone(ref);return this.mutate(ref.projectId,expectedRevision,r=>{
      const current=this.current(r,ref);if(typeof note!=='string'||!note.trim()||note.length>8000)throw new Error('RULE_CORRECTION_REQUIRED');
      const next=stamp({...current,version:current.version+1,confirmation:{status:'pending'},corrections:[...current.corrections,{time:new Date().toISOString(),note:note.trim(),previousVersion:current.version}]});
      // A correction may document stale source; it never restores confirmation.
      r.history.push(next);if(r.selectedRule?.id===next.id)delete r.selectedRule;return next;
    });
  }
  async confirmVersion(projectId:string,ruleId:string,version:number,expectedRevision:number,confirmed:boolean):Promise<ProjectRuleVersion>{if(confirmed!==true)throw new Error('RULE_CONFIRMATION_REQUIRED');return this.mutate(projectId,expectedRevision,async r=>{const current=r.history.filter(v=>v.id===ruleId).at(-1);if(!current||current.version!==version)throw new Error('STALE_PROJECT_RULE');if(current.confirmation.status==='confirmed')throw new Error('RULE_ALREADY_CONFIRMED');complete(current);const next=stamp({...current,version:current.version+1,confirmation:{status:'confirmed',time:new Date().toISOString(),actor:'local_user'}});await this.options.validateSources?.(next);r.history.push(next);return next})}
  async assertCurrent(ref:ProjectRuleRef):Promise<ProjectRuleVersion>{ref=structuredClone(ref);const current=this.current(await this.read(ref.projectId),ref);if(current.confirmation.status!=='confirmed')throw new Error('RULE_CONFIRMATION_REQUIRED');return structuredClone(current)}
  async withCurrentRule<T>(ref:ProjectRuleRef,work:(rule:ProjectRuleVersion)=>Promise<T>):Promise<T>{
    ref=structuredClone(ref);let release:()=>Promise<void>;try{release=await acquireTask(ref.projectId)}catch(e){if((e as Error).message==='CANDIDATE_BUSY')throw new Error('RULE_REVISION_CONFLICT');throw e}
    try{const rule=this.current(await this.read(ref.projectId),ref);if(rule.confirmation.status!=='confirmed')throw new Error('RULE_CONFIRMATION_REQUIRED');await this.options.validateSources?.(rule);return await work(structuredClone(rule))}finally{await release()}
  }
  async select(projectId:string,ref:ProjectRuleRef,expectedRevision:number):Promise<ProjectRuleCollection>{ref=structuredClone(ref);await this.mutate(projectId,expectedRevision,async r=>{const current=this.current(r,ref);if(current.confirmation.status!=='confirmed')throw new Error('RULE_CONFIRMATION_REQUIRED');await this.options.validateSources?.(current);r.selectedRule=reference(current)});return this.list(projectId)}
}
