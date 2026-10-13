import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
import type {RuleContract,MappingSpec,Observation,ToolAction,Verdict,Transition,TemplateSpec} from '@website-verification/contracts';
import {validateContract} from '@website-verification/contracts/validate';
import {TemplateRegistry,type TemplateRef} from './templates/store.js';
import {ArtifactStore} from './artifacts/store.js';
import {digest,inspectProject} from './projects/inspect.js';
import {prepareCopy,isolateCopyForReplay} from './projects/copy.js';
import type {TestEnvironment,TestConfig} from './projects/reset.js';
import {CredentialSession} from './execution/session.js';
import {bindMapping,mappingHash,validateMapping} from './execution/mapping.js';
import {execute} from './execution/http.js';
import {CoreClient} from './core/client.js';
import {command,capabilities} from './validation/observations.js';
import {projectRoot} from './validation/review.js';
import {readPackage} from './manifest.js';
import {scrubSecrets} from './model/context.js';

export interface PlannedCheck {rule:RuleContract;templateRef:TemplateRef;mode:'verify'|'observe'}
export interface ConfirmedPlan {id:string;projectId:string;flow:{id:string;title:string};checks:PlannedCheck[];mapping:MappingSpec;sourceHash:string;confirmedAt:string}
export interface RunCheck extends PlannedCheck {template?:TemplateSpec;status:string;actions:ToolAction[];observations:Observation[];verdicts:Verdict[];copyId?:string;preparation?:unknown}
export interface RunRecord {schemaVersion:1;id:string;projectId:string;flow:ConfirmedPlan['flow'];kind:'verification'|'observations';status:'running'|'completed'|'cancelled'|'blocked'|'interrupted';startedAt:string;finishedAt?:string;parentRunId?:string;plan:ConfirmedPlan;checks:RunCheck[];events:{time:string;phase:string;detail?:string}[];evidence:Record<string,unknown>;uncovered:string[]}
export interface RunEnvironment {source:string;projectId:string;confirmed:boolean;data:TestConfig['data'];accounts:TestConfig['accounts'];credentials:CredentialSession;reconfirmedChanges?:boolean;sourceRun?:RunRecord}
export function confirmPlan(input:Omit<ConfirmedPlan,'id'|'confirmedAt'> & {flows?:unknown}):ConfirmedPlan{
  if(input.flows!==undefined||!input.flow||typeof input.flow.id!=='string'||!input.flow.id||typeof input.flow.title!=='string'||!input.flow.title)throw new Error('SINGLE_FLOW_REQUIRED');
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(input.projectId)||!Array.isArray(input.checks)||!input.checks.length||input.checks.length>8)throw new Error('INVALID_PLAN');
  for(const c of input.checks){if(!validateContract('RuleContract',c.rule).valid||!['verify','observe'].includes(c.mode)||!c.templateRef||c.mode==='verify'&&c.rule.confirmation!=='confirmed'||c.mode==='observe'&&c.rule.confirmation!=='pending')throw new Error('RULE_CONFIRMATION_REQUIRED');}
  if(new Set(input.checks.map(c=>c.rule.id)).size!==input.checks.length)throw new Error('DUPLICATE_RULE');
  validateMapping(input.mapping);if(!/^[a-f0-9]{64}$/.test(input.sourceHash))throw new Error('INVALID_SOURCE_HASH');
  return structuredClone({id:randomUUID(),projectId:input.projectId,flow:input.flow,checks:input.checks,mapping:input.mapping,sourceHash:input.sourceHash,confirmedAt:new Date().toISOString()});
}
async function freePort(){const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const port=(s.address() as {port:number}).port;await new Promise<void>((r,j)=>s.close(e=>e?j(e):r()));return port;}
export async function qualifyPlan(plan:ConfirmedPlan,registry:TemplateRegistry){
  const checked=confirmPlan(plan); // Structural validation, never auto-confirm a pending rule.
  const templates=[];
  for(const c of checked.checks){const p=await registry.assertQualified(c.templateRef);if(digest({...c.rule,confirmation:'confirmed'})!==p.ruleHash)throw new Error('RULE_VERSION_MISMATCH');templates.push(p);}
  return templates;
}
export async function loadReplay(input:unknown,environment:RunEnvironment,registry:TemplateRegistry):Promise<{plan:ConfirmedPlan;parentRunId:string}>{
  const {run}=readPackage(input);if(run.kind!=='verification'||run.checks.every(c=>c.mode==='observe'))throw new Error('OBSERVATION_PACKAGE_NOT_REPLAYABLE');
  if(!environment.confirmed||run.projectId!==environment.projectId)throw new Error('PROJECT_CONFIRMATION_REQUIRED');
  const profile=await inspectProject(environment.source);if(!profile.supported)throw new Error('PROJECT_UNSUPPORTED');
  if(profile.sourceHash!==run.plan.sourceHash&&!environment.reconfirmedChanges)throw new Error('CONDITIONS_CHANGED_CONFIRMATION_REQUIRED');
  const templates=await qualifyPlan(run.plan,registry);
  if(run.plan.projectId!==run.projectId||digest(run.plan.flow)!==digest(run.flow))throw new Error('INVALID_PACKAGE_PLAN');
  for(const c of run.checks){const i=run.plan.checks.findIndex(p=>p.rule.id===c.rule.id);if(i<0||digest(c.rule)!==digest(run.plan.checks[i]!.rule)||digest(c.templateRef)!==digest(run.plan.checks[i]!.templateRef)||c.mode!==run.plan.checks[i]!.mode||!c.template||digest(c.template)!==digest(templates[i]!.spec))throw new Error('PACKAGE_TEMPLATE_MISMATCH');}
  return {plan:confirmPlan({...run.plan,sourceHash:profile.sourceHash}),parentRunId:run.id};
}
export class RunExecutor {
  private stopped=false;private active?:TestEnvironment;
  constructor(readonly registry:TemplateRegistry,readonly store:ArtifactStore){}
  async stop(){this.stopped=true;if(this.active)await this.active.interrupt();}
  async run(plan:ConfirmedPlan,input:RunEnvironment,parentRunId?:string,onUpdate:(run:RunRecord)=>void=()=>{},id=randomUUID()):Promise<RunRecord>{
    plan=structuredClone(plan);const templates=await qualifyPlan(plan,this.registry);
    if(!input.confirmed||input.projectId!==plan.projectId)throw new Error('PROJECT_CONFIRMATION_REQUIRED');
    const profile=await inspectProject(input.source);if(!profile.supported)throw new Error('PROJECT_UNSUPPORTED');if(profile.sourceHash!==plan.sourceHash)throw new Error('CONDITIONS_CHANGED_CONFIRMATION_REQUIRED');
    for(const account of input.accounts)input.credentials.get(input.projectId,account.actorRef);
    const secrets=input.accounts.map(a=>input.credentials.get(input.projectId,a.actorRef));
    const run:RunRecord={schemaVersion:1,id,projectId:plan.projectId,flow:plan.flow,plan,kind:plan.checks.some(c=>c.mode==='verify')?'verification':'observations',status:'running',startedAt:new Date().toISOString(),...(parentRunId?{parentRunId}:{}),checks:[],events:[],evidence:{},uncovered:['只覆盖本轮已选规则、测试副本及数据条件；不证明所有业务或容量。']};
    const update=async(phase:string,detail?:string)=>{run.events.push({time:new Date().toISOString(),phase,...(detail?{detail}:{})});await this.store.checkpoint(scrubSecrets(run,secrets));onUpdate(structuredClone(scrubSecrets(run,secrets)));};
    await update('preparing');
    try{
      if(parentRunId){
        let previous=input.sourceRun;
        try{const local=await this.store.get(parentRunId);if(previous&&digest(previous)!==digest(local))throw new Error('PACKAGE_SOURCE_MISMATCH');previous=local;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
        if(previous&&(previous.id!==parentRunId||previous.projectId!==input.projectId))throw new Error('PROJECT_MISMATCH');
        if(previous?.status==='interrupted')for(const old of previous.checks){if(old.copyId){await isolateCopyForReplay(old.copyId,input.projectId,input.credentials);await update('previous_copy_isolated',old.copyId);}}
      }
      for(let i=0;i<plan.checks.length;i++){
        if(this.stopped)break;const c=plan.checks[i]!,p=templates[i]!;
        // Recheck at dispatch time; a package or cached match cannot bypass disable.
        await this.registry.assertQualified(c.templateRef);
        const env=await prepareCopy(profile,{projectId:input.projectId,port:await freePort(),confirmed:input.confirmed,data:input.data,accounts:input.accounts,credentials:input.credentials});this.active=env;
        const mapping=bindMapping(plan.mapping,env.id),coreRunId=randomUUID();
        const result:RunCheck={...c,template:structuredClone(p.spec),status:'running',actions:[],observations:[],verdicts:[],copyId:env.id};run.checks.push(result);
        const {coreCommand}=await import(pathToFileURL(join(projectRoot,'scripts/toolchain.mjs')).href);const core=new CoreClient({...coreCommand(),timeoutMs:5000});
        try{
          const prepare=async(checkId:string)=>env.prepareExperiment({runId:coreRunId,checkId,ruleHash:digest(c.rule),mapping,mappingHash:mappingHash(mapping),confirmed:true,budget:{maxOperations:p.spec.limits.maxActions,deadlineMs:p.spec.limits.runTimeoutMs}});
          await prepare(p.spec.checks[0]!);await update('running',c.rule.id);
          let state:Transition=await command(core,coreRunId,'start',{operation:'runTemplate',spec:p.spec,rule:c.rule,capabilities,scope:{kind:c.mode==='observe'?'observation_only':'published_template',confirmed:true,qualification:p}});
          while(state.state==='running'&&!this.stopped){
            const action=state.actions[0];if(!action)throw new Error('NO_ACTION');
            if(env.currentAttempt?.id!==action.attemptId){await env.completeAttempt();await prepare(action.checkId);}
            result.actions.push(action);const observation=await execute(action,{environment:env,mapping});
            for(const ref of observation.evidenceRefs){if(!/^evidence:[a-f0-9]{64}\.json$/.test(ref))throw new Error('INVALID_EVIDENCE');const key=`${env.id}/${ref.slice(9)}`;run.evidence[key]=JSON.parse(await readFile(join(env.evidenceRoot,ref.slice(9)),'utf8'));}
            result.observations.push(observation);state=await command(core,coreRunId,'observation',{observation});await update('running',`${c.rule.id}: ${result.observations.length} 条观察`);
          }
          if(this.stopped){state=await command(core,coreRunId,'cancel',{});await env.interrupt();}else if(env.currentAttempt?.status==='running')await env.completeAttempt();
          result.status=state.state;result.verdicts=state.verdicts;result.preparation=await env.exportRecord();
        }finally{try{result.preparation=await env.exportRecord();}finally{await core.close();await env.close();this.active=undefined;}}
      }
      run.status=this.stopped?'cancelled':'completed';
    }catch(e){run.status=this.stopped?'cancelled':'blocked';run.uncovered.push((e as Error).message);}
    finally{run.finishedAt=new Date().toISOString();await update(run.status);const safe=scrubSecrets(run,secrets) as RunRecord;await this.store.finish(safe);onUpdate(structuredClone(safe));}
    return scrubSecrets(run,secrets) as RunRecord;
  }
}
