import {mkdir,writeFile,readFile,rename,open} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import type {RuleContract,CapabilitySet,TemplateSpec} from '@website-verification/contracts';
import {validateContract} from '@website-verification/contracts/validate';
import {CoreClient} from '../core/client.js';
import {digest} from '../projects/inspect.js';
import {command} from '../validation/observations.js';
import {loadValidationSuite,validateAgainstSuite,type SuiteValidationRecord} from '../validation/reference-runner.js';
import {ModelProvider,ModelFault,type ModelConfig} from './provider.js';
import {ModelBudget,MODEL_PRESET,type ModelPreset,type BudgetUsage} from './budget.js';
import {ModelCredentials} from './credentials.js';
import {generateCandidate,candidateShape,type CandidateReference} from './proposal.js';
import type {ContextRequest,DisclosureConsent} from './context.js';
import {runTargetTrial,type TargetTrialInput,type TargetTrial} from './target-trial.js';
import {acquireTask} from './task-lock.js';
import {loadCompiledValidationRule,assertCompiledRuleProject} from '../rules/compiler.js';
import {repairLegacyTitleParameters} from '../validation/parameters.js';
const root=fileURLToPath(new URL('../../../../',import.meta.url)),base=join(root,'.local-data/candidates');
export const digestRule=(rule:RuleContract)=>digest(rule);
export interface CandidateInput {rule:RuleContract;capabilities:CapabilitySet;context:ContextRequest;consent?:DisclosureConsent;config:ModelConfig;preset?:ModelPreset}
export interface AdmissionState {revisionIndex:number;status:string;phase:string;candidateHash:string;ruleHash:string;suiteHash:string;interpreterVersion:string;code:string}
interface CandidateRecord extends AdmissionState {schemaVersion:1;id:string;input:CandidateInput;budget:BudgetUsage;drafts:{revisionIndex:number;value:unknown;hash:string;reference?:CandidateReference}[];history:{kind:string;revisionIndex:number;candidateHash:string;validationRef?:string;diagnostics:string[];time:string;code:string}[];audit:Record<string,unknown>[];validation?:SuiteValidationRecord;trial?:TargetTrial;diagnostics:string[]}
/** One task owns one immutable rule and one finite cumulative budget. The local
 * journal persists reservations before calls and never contains a model key.
 * Reopening is read-only; run() is an explicit resume, never a background retry. */
export class CandidateTask {
  readonly path:string;private busy=false;private budget:ModelBudget;private provider:ModelProvider;
  private constructor(private data:CandidateRecord,private readonly credentials:ModelCredentials,private readonly credentialOverride?:string){this.path=join(base,data.id,'state.json');this.budget=new ModelBudget(data.input.preset??MODEL_PRESET,data.budget);this.provider=new ModelProvider(data.input.config,credentials,this.budget,()=>this.save());this.provider.audit.push(...data.audit);}
  get id(){return this.data.id;}
  snapshot():CandidateRecord{return structuredClone({...this.data,budget:this.budget.usage,audit:this.provider.audit});}
  async checkConnection():Promise<void>{return this.exclusive(async()=>{await this.provider.checkConnection();await this.save();});}
  async reconfigure(input:Pick<CandidateInput,'context'|'consent'|'config'>):Promise<void>{
    return this.exclusive(async()=>{
      if(input.context.projectId!==this.data.input.context.projectId)throw new Error('PROJECT_MISMATCH');
      Object.assign(this.data.input,structuredClone(input));
      this.provider=new ModelProvider(this.data.input.config,this.credentials,this.budget,()=>this.save());
      this.provider.audit.push(...this.data.audit);await this.save();
    });
  }
  private async exclusive<T>(work:()=>Promise<T>):Promise<T>{
    if(this.busy)throw new Error('CANDIDATE_BUSY');this.busy=true;let release:(()=>Promise<void>)|undefined;
    try{release=await acquireTask(this.id);const current=await CandidateTask.open(this.id,this.credentials,this.credentialOverride);this.data=current.data;this.budget=current.budget;this.provider=new ModelProvider(this.data.input.config,this.credentials,this.budget,()=>this.save());this.provider.audit.push(...this.data.audit);return await work();}
    finally{try{if(release)await release();}finally{this.busy=false;}}
  }
  static async create(input:CandidateInput,credentials:ModelCredentials):Promise<CandidateTask>{
    if(!validateContract('RuleContract',input.rule).valid||!validateContract('CapabilitySet',input.capabilities).valid)throw new Error('INVALID_CANDIDATE_INPUT');
    if(input.rule.source.startsWith('project-rule:')){const compiled=await loadCompiledValidationRule(input.rule.id,input.rule.version);if(!compiled||compiled.ruleRef.projectId!==input.context.projectId||digest(compiled.rule)!==digest(input.rule))throw new Error('RULE_PROJECT_MISMATCH');}
    const preset=input.preset??MODEL_PRESET,budget=new ModelBudget(preset);const data:CandidateRecord={schemaVersion:1,id:randomUUID(),input:structuredClone(input),revisionIndex:0,status:'draft',phase:'generating',candidateHash:'',ruleHash:digest(input.rule),suiteHash:'',interpreterVersion:'1.0.0',code:'',budget:budget.usage,drafts:[],history:[],audit:[],diagnostics:[]};
    const task=new CandidateTask(data,credentials);await mkdir(join(base,data.id),{recursive:true});await task.save();return task;
  }
  static async open(id:string,credentials:ModelCredentials,credentialRef?:string):Promise<CandidateTask>{
    if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('INVALID_CANDIDATE_ID');const saved=JSON.parse(await readFile(join(base,id,'state.json'),'utf8')),data=saved.record as CandidateRecord;
    if(saved.hash!==digest(data)||data.schemaVersion!==1||data.id!==id||data.ruleHash!==digest(data.input.rule)||!Number.isInteger(data.revisionIndex)||data.revisionIndex<0||data.revisionIndex>2||data.drafts.some(d=>d.hash!==digest(d.value)))throw new Error('CORRUPT_CANDIDATE_RECORD');
    if(credentialRef)data.input.config.credentialRef=credentialRef;
    if(data.phase==='model_call'){data.phase='paused';data.code='INTERRUPTED_MODEL_CALL';}
    return new CandidateTask(data,credentials,credentialRef);
  }
  private async save():Promise<void>{
    this.data.budget={...this.budget.usage};this.data.audit=structuredClone(this.provider.audit);
    const record=this.provider.credentials.redact(this.data),temporary=this.path+'.tmp';const file=await open(temporary,'w');try{await file.writeFile(JSON.stringify({record,hash:digest(record)},null,2)+'\n');await file.sync();}finally{await file.close();}
    // Windows readers can briefly deny replacement. Retry only this local,
    // idempotent rename; failure still prevents the network request.
    for(let attempt=0;;attempt++)try{await rename(temporary,this.path);break;}catch(error){if(attempt===7||!['EPERM','EACCES','EBUSY'].includes((error as NodeJS.ErrnoException).code??''))throw new Error('CANDIDATE_SAVE_FAILED');await new Promise(r=>setTimeout(r,25*(attempt+1)));}
  }
  private async event(core:CoreClient,event:string,extra:Record<string,unknown>={}):Promise<void>{
    const keys=['revisionIndex','status','phase','candidateHash','ruleHash','suiteHash','interpreterVersion','code'] as const;const candidate=Object.fromEntries(keys.map(k=>[k,this.data[k]]));
    const next=await command(core,randomUUID(),'start',{operation:'advanceAdmission',candidate,record:{event,...extra}}) as AdmissionState;
    const revisionIndex=this.data.revisionIndex;Object.assign(this.data,next);this.data.history.push({kind:event,revisionIndex,candidateHash:this.data.candidateHash,...(this.data.validation?.candidateHash===this.data.candidateHash?{validationRef:this.data.validation.recordRef}:{}),diagnostics:[...this.data.diagnostics],time:new Date().toISOString(),code:this.data.code});await this.save();
  }
  async run(target?:TargetTrialInput):Promise<CandidateRecord>{
    return this.exclusive(async()=>{
    const {coreCommand}=await import(pathToFileURL(join(root,'scripts/toolchain.mjs')).href);const core=new CoreClient({...coreCommand(),timeoutMs:5000});
    try{
      if(['rejected','ready_for_review'].includes(this.data.status))return this.snapshot();
      const {rule,capabilities,context,consent}=this.data.input;
      if(rule.confirmation!=='confirmed'){await this.event(core,'needs_rule');return this.snapshot();}
      let suite;try{suite=await loadValidationSuite(rule.id,rule.version);}catch(error){if((error as Error).message!=='UNSUPPORTED_RULE')throw error;await this.event(core,'capability_gap');return this.snapshot();}
      if(digest(rule)!==digest(suite.rule))throw new Error('CONFIRMED_RULE_DIFFERS_FROM_REFERENCE');
      if(rule.source.startsWith('project-rule:')){const compiled=await loadCompiledValidationRule(rule.id,rule.version);if(!compiled||compiled.ruleRef.projectId!==context.projectId||digest(compiled.rule)!==digest(rule))throw new Error('RULE_PROJECT_MISMATCH');if(target){const profile=await (await import('../projects/inspect.js')).inspectProject(target.source);await assertCompiledRuleProject(rule,target.projectId,target.mapping??profile.mapping,profile.sourceHash,profile.root);}}
      if(['create','query','update'].some(op=>!capabilities.operations.includes(op))){await this.event(core,'capability_gap');return this.snapshot();}
      this.data.suiteHash=suite.suiteHash;
      for(;;){
        if(this.data.phase==='awaiting_trial'){
          const spec=this.data.drafts.at(-1)!.value as TemplateSpec;
          // Repair only the legacy type-declaration bug; never use target verdicts as revision guidance.
          if(!candidateShape(spec,rule)){
            const repaired=repairLegacyTitleParameters(spec);
            if(!repaired||!candidateShape(repaired,rule)){this.data.code='TEMPLATE_SCHEMA_OR_RULE_BINDING_INVALID';await this.save();return this.snapshot();}
            this.data.diagnostics=['TEMPLATE_SCHEMA_OR_RULE_BINDING_INVALID'];
            delete this.data.validation;delete this.data.trial;
            await this.event(core,'validation_failed',{canRevise:true});
            if(this.data.status==='rejected')return this.snapshot();
            const hash=digest(repaired),previous=this.data.drafts.at(-1)!;
            this.data.drafts.push({revisionIndex:this.data.revisionIndex,value:repaired,hash,...(previous.reference?{reference:previous.reference}:{})});
            this.data.candidateHash=hash;this.data.phase='validating_draft';
            this.data.history.push({kind:'developer_parameter_repair',revisionIndex:this.data.revisionIndex,candidateHash:hash,diagnostics:['LEGACY_TITLE_DEFAULTS_REPLACED_WITH_SYNTHETIC_VALUES'],time:new Date().toISOString(),code:'REVALIDATION_REQUIRED'});
            await this.save();
            continue;
          }
          if(!target)return this.snapshot();
          try{this.data.trial=await runTargetTrial(spec,rule,target);if(!this.data.trial.completed)throw new Error('TARGET_TRIAL_INCOMPLETE');if(!this.data.trial.gateResults.conclusive)throw new Error('TARGET_TRIAL_EVIDENCE_INCOMPLETE');await this.event(core,'trial',{record:this.data.trial});}
          catch(error){this.data.code=(error as Error).message;await this.save();}return this.snapshot();
        }
        if(this.data.phase!=='validating_draft'){
          this.data.phase='model_call';await this.save();
          let value:unknown,reference:CandidateReference|undefined;
          try{const generated=await generateCandidate(this.provider,rule,capabilities,{context,consent},this.data.revisionIndex,this.data.diagnostics);value=generated.spec;reference=generated.reference;}
          catch(error){
            const code=(error as Error).message;
            if(error instanceof ModelFault&&error.category==='output'){this.data.candidateHash=digest({invalidOutput:code});this.data.drafts.push({revisionIndex:this.data.revisionIndex,value:{invalidOutput:code},hash:this.data.candidateHash});this.data.diagnostics=[code];await this.event(core,'validation_failed',{canRevise:true});if(this.data.status==='rejected')return this.snapshot();continue;}
            await this.event(core,code==='BUDGET_EXHAUSTED'?'budget_exhausted':error instanceof ModelFault&&error.category==='provider'?'provider_fault':'scope_fault',{code});return this.snapshot();
          }
          this.data.drafts.push({revisionIndex:this.data.revisionIndex,value,hash:digest(value),...(reference?{reference}:{})});this.data.candidateHash=digest(value);this.data.phase='validating_draft';await this.save();
        }
        const value=this.data.drafts.at(-1)!.value;
        if(candidateShape(value,rule)){
          if(value.requiredCapabilities.some(op=>!capabilities.operations.includes(op))||value.steps.some(s=>!capabilities.operations.includes(s.operationId)||!capabilities.actorRefs.includes(s.actorRef))){await this.event(core,'capability_gap');return this.snapshot();}
          const available=await command(core,randomUUID(),'start',{operation:'validateTemplate',spec:value,capabilities});
          if(available.issues.some((issue:{code:string})=>['UNKNOWN_CAPABILITY','UNKNOWN_OPERATION','UNKNOWN_ACTOR','UNKNOWN_EXPRESSION'].includes(issue.code))){await this.event(core,'capability_gap');return this.snapshot();}
          this.data.interpreterVersion=available.interpreterVersion;
          this.data.validation=await validateAgainstSuite(value,suite);
          if(this.data.validation.gateResults.admitted){await this.event(core,'validated',{record:this.data.validation});continue;}
          // Never send expected verdicts, private observations, held-out case ids,
          // concrete values or project failures back as revision instructions.
          this.data.diagnostics=['CANDIDATE_DID_NOT_ESTABLISH_ALL_RULE_OBLIGATIONS'];
        }else this.data.diagnostics=['TEMPLATE_SCHEMA_OR_RULE_BINDING_INVALID'];
        await this.event(core,'validation_failed',{canRevise:true});if(this.data.status==='rejected')return this.snapshot();
      }
    }finally{await core.close();}
    });
  }
}
