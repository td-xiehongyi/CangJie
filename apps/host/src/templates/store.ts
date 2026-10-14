import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {TemplateSpec,RuleContract,CapabilitySet,ValidationRecord,ReviewRecord} from '@website-verification/contracts';
import {CandidateTask} from '../model/candidate.js';
import {ModelCredentials} from '../model/credentials.js';
import {digest} from '../projects/inspect.js';
import {loadValidationSuite} from '../validation/reference-runner.js';
import {checkReview,evidenceSeal,projectRoot,registryCore} from '../validation/review.js';

export interface TemplateMetadata {version:string;applicable:string[];excluded:string[];instructions:string}
export interface TemplateRef {id:string;version:string;hash:string}
export interface RegistryDraft {taskId:string;spec:TemplateSpec;rule:RuleContract;capabilities:CapabilitySet;candidateHash:string;ruleHash:string;validation:ValidationRecord;trial:ValidationRecord;metadata:TemplateMetadata;evidenceHash:string;draftHash:string}
export interface PublishedTemplate extends RegistryDraft {status:'published';ref:TemplateRef;review:ReviewRecord;publishedAt:string}
export interface Match {ref:TemplateRef;ruleHash:string;reasons:string[];requiresProjectConfirmation:true;applicable:string[];excluded:string[];instructions:string}
const unavailableCodes=new Set(['VERSION_DISABLED','STALE_QUALIFICATION','STALE_INTERPRETER_OR_TEMPLATE','STALE_EVIDENCE','STALE_VALIDATION_RECORD','STALE_TRIAL_RECORD','EVIDENCE_MISSING','EVIDENCE_CORRUPT','UNSUPPORTED_RULE','STALE_PROJECT_RULE','RULE_PROJECT_MISMATCH','RULE_MAPPING_MISMATCH','COMPILED_RULE_ALREADY_BOUND','CORRUPT_COMPILED_RULE','REFERENCE_CHANGED_REVIEW_REQUIRED']);
function hash(value:string):void{if(!/^[a-f0-9]{64}$/.test(value))throw new Error('INVALID_HASH');}
function refValid(ref:TemplateRef):void{if(!/^[A-Za-z0-9_-]{1,80}$/.test(ref.id)||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(ref.version)||!ref.hash||!/^[a-f0-9]{64}$/.test(ref.hash))throw new Error('INVALID_REF');}
function metadataValid(m:TemplateMetadata):void{
  if(!m||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(m.version)||typeof m.instructions!=='string'||!m.instructions.trim()||
    ![m.applicable,m.excluded].every(a=>Array.isArray(a)&&a.length>0&&a.every(v=>typeof v==='string'&&v.trim())))throw new Error('INVALID_METADATA');
  if(Object.keys(m).some(k=>!['version','applicable','excluded','instructions'].includes(k)))throw new Error('INVALID_METADATA');
}
async function readEnvelope<T>(path:string):Promise<T>{const saved=JSON.parse(await readFile(path,'utf8'));if(saved.hash!==digest(saved.record))throw new Error('CORRUPT_REGISTRY_RECORD');return saved.record;}
async function immutable(path:string,record:unknown):Promise<void>{await writeFile(path,JSON.stringify({record,hash:digest(record)},null,2)+'\n',{flag:'wx'});}
function draftBody(d:RegistryDraft){const {taskId,spec,rule,capabilities,candidateHash,ruleHash,validation,trial,metadata,evidenceHash}=d;return {taskId,spec,rule,capabilities,candidateHash,ruleHash,validation,trial,metadata,evidenceHash};}

/** Trusted local host API. T6 must collect authenticated human decisions; model
 * output has no route to this API. Drafts and immutable publications are separate. */
export class TemplateRegistry {
  readonly directory:string;
  constructor(directory=join(projectRoot,'.local-data/templates')){this.directory=resolve(directory);}
  versionPath(ref:TemplateRef):string{refValid(ref);return join(this.directory,'published',`${ref.id}@${ref.version}.json`);}
  private disabledPath(ref:TemplateRef){refValid(ref);return join(this.directory,'disabled',`${ref.id}@${ref.version}.json`);}
  private async initialize(){for(const folder of ['drafts','published','disabled'])await mkdir(join(this.directory,folder),{recursive:true});}
  async stageCandidate(taskId:string,metadata:TemplateMetadata):Promise<RegistryDraft>{
    metadataValid(metadata);metadata=structuredClone(metadata);
    const keys=new ModelCredentials();let c;
    try{c=(await CandidateTask.open(taskId,keys)).snapshot();}finally{keys.close();}
    if(c.status!=='ready_for_review'||!c.validation||!c.trial)throw new Error('CANDIDATE_NOT_READY');
    const spec=c.drafts.at(-1)?.value as TemplateSpec;
    if(digest(spec)!==c.candidateHash||digest(c.input.rule)!==c.ruleHash)throw new Error('STALE_CANDIDATE');
    const body={taskId,spec,rule:c.input.rule,capabilities:c.input.capabilities,candidateHash:c.candidateHash,ruleHash:c.ruleHash,validation:c.validation,trial:c.trial,metadata,evidenceHash:await evidenceSeal(c.validation,c.trial)};
    const draft={...body,draftHash:digest(body)};await this.current(draft);
    await this.initialize();const path=join(this.directory,'drafts',draft.draftHash+'.json');
    try{await immutable(path,draft);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;if(digest(await readEnvelope(path))!==digest(draft))throw new Error('CORRUPT_DRAFT');}
    return structuredClone(draft);
  }
  private async current(d:RegistryDraft):Promise<void>{
    if(digest(draftBody(d))!==d.draftHash||digest(d.spec)!==d.candidateHash||digest(d.rule)!==d.ruleHash||d.validation.candidateHash!==d.candidateHash||d.validation.ruleHash!==d.ruleHash)throw new Error('STALE_CANDIDATE_OR_RULE');
    const suite=await loadValidationSuite(d.rule.id,d.rule.version);
    if(digest(suite.rule)!==d.ruleHash||suite.suiteHash!==d.validation.suiteHash)throw new Error('STALE_QUALIFICATION');
    const validation=await registryCore({operation:'validateTemplate',spec:d.spec,capabilities:d.capabilities});
    if(!validation.valid||validation.interpreterVersion!==d.validation.interpreterVersion||d.trial.interpreterVersion!==validation.interpreterVersion)throw new Error('STALE_INTERPRETER_OR_TEMPLATE');
    if(await evidenceSeal(d.validation,d.trial)!==d.evidenceHash)throw new Error('STALE_EVIDENCE');
  }
  async publishCandidate(candidateHash:string,record:ValidationRecord,review:ReviewRecord):Promise<PublishedTemplate>{
    // Snapshot caller-owned objects before awaiting, so edits cannot race approval.
    record=structuredClone(record);review=structuredClone(review);hash(candidateHash);hash(review.scope);
    const d=await readEnvelope<RegistryDraft>(join(this.directory,'drafts',review.scope+'.json'));
    if(candidateHash!==d.candidateHash||digest(record)!==digest(d.validation))throw new Error('STALE_VALIDATION_RECORD');
    checkReview(review,d.draftHash,record.recordRef??'');await this.current(d);
    const decision=await registryCore({operation:'publishCandidate',draft:d,review});
    if(decision.status!=='published')throw new Error('CORE_PUBLICATION_REJECTED');
    const ref={id:d.spec.id,version:d.metadata.version,hash:d.draftHash};refValid(ref);
    const published:PublishedTemplate={...d,status:'published',ref,review,publishedAt:new Date().toISOString()};
    await this.initialize();
    try{await immutable(this.versionPath(ref),published);}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw new Error('VERSION_EXISTS');throw e;}
    return structuredClone(published);
  }
  /** History remains readable even when qualification has been withdrawn. */
  async getVersion(ref:TemplateRef):Promise<PublishedTemplate>{
    ref=structuredClone(ref);
    const p=await readEnvelope<PublishedTemplate>(this.versionPath(ref));
    if(p.status!=='published'||p.ref.id!==ref.id||p.ref.version!==ref.version||p.ref.hash!==ref.hash||p.draftHash!==ref.hash)throw new Error('VERSION_HASH_MISMATCH');
    if(digest(draftBody(p))!==p.draftHash)throw new Error('CORRUPT_PUBLICATION');return p;
  }
  async assertQualified(ref:TemplateRef):Promise<PublishedTemplate>{
    ref=structuredClone(ref);const p=await this.getVersion(ref);
    let disabled=false;
    try{const record=await readEnvelope<{ref:TemplateRef}>(this.disabledPath(ref));if(digest(record.ref)!==digest(ref))throw new Error('CORRUPT_DISABLE_RECORD');disabled=true;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    if(disabled)throw new Error('VERSION_DISABLED');
    await this.current(p);checkReview(p.review,p.draftHash,p.validation.recordRef??'');
    await registryCore({operation:'checkQualification',draft:p,review:p.review,disabled:false});return p;
  }
  async disableVersion(ref:TemplateRef,reason:string):Promise<void>{
    ref=structuredClone(ref);
    if(typeof reason!=='string'||!reason.trim())throw new Error('DISABLE_REASON_REQUIRED');
    await this.getVersion(ref);await this.initialize();
    try{await immutable(this.disabledPath(ref),{ref,reason:reason.trim(),time:new Date().toISOString()});}
    catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;await readEnvelope(this.disabledPath(ref));}
  }
  async matchTemplates(capabilities:CapabilitySet,rules:RuleContract[]):Promise<Match[]>{
    return (await this.matchReport(capabilities,rules)).matches;
  }
  async matchReport(capabilities:CapabilitySet,rules:RuleContract[]):Promise<{matches:Match[];unavailableVersions:{ref:TemplateRef;code:string}[]}>{
    capabilities=structuredClone(capabilities);rules=structuredClone(rules);await this.initialize();const matches:Match[]=[],unavailableVersions:{ref:TemplateRef;code:string}[]=[];
    for(const file of (await readdir(join(this.directory,'published'))).sort()){
      if(!file.endsWith('.json'))continue;
      const p=await readEnvelope<PublishedTemplate>(join(this.directory,'published',file));
      try{await this.assertQualified(p.ref);}catch(e){const code=(e as Error).message;if(unavailableCodes.has(code)){unavailableVersions.push({ref:p.ref,code});continue;}throw e;}
      const result=await registryCore({operation:'matchTemplate',spec:p.spec,capabilities,ruleHash:p.ruleHash,ruleHashes:rules.filter(r=>r.confirmation==='confirmed').map(r=>digest(r))});
      if(result.matched)matches.push({ref:p.ref,ruleHash:p.ruleHash,reasons:['Confirmed rule content matches the validated rule','Required operations, actors and expressions are available','Exact published version remains qualified'],requiresProjectConfirmation:true,applicable:p.metadata.applicable,excluded:p.metadata.excluded,instructions:p.metadata.instructions});
    }
    return {matches,unavailableVersions};
  }
  async summarize(capabilities:CapabilitySet,rules:RuleContract[]){
    const {matches,unavailableVersions}=await this.matchReport(capabilities,rules),matched=new Set(matches.map(m=>m.ruleHash));
    return {publishedVersions:(await readdir(join(this.directory,'published'))).filter(f=>f.endsWith('.json')).length,matchedRules:matched.size,unresolvedRules:new Set(rules.filter(r=>!matched.has(digest(r))).map(r=>digest(r))).size,unavailableVersions};
  }
}
