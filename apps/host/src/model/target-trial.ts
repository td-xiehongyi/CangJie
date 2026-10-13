import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import type {TemplateSpec,RuleContract,Transition,ValidationRecord,Verdict} from '@website-verification/contracts';
import {inspectProject,digest} from '../projects/inspect.js';
import type {TestConfig} from '../projects/reset.js';
import type {MappingSpec} from '@website-verification/contracts';
import {prepareCopy} from '../projects/copy.js';
import {CredentialSession} from '../execution/session.js';
import {execute} from '../execution/http.js';
import {bindMapping,mappingHash} from '../execution/mapping.js';
import {CoreClient} from '../core/client.js';
import {command,runPayload} from '../validation/observations.js';
export interface TargetTrialInput {source:string;projectId:string;confirmed:boolean;sourceHash?:string;mapping?:MappingSpec;data?:TestConfig['data'];accounts?:TestConfig['accounts'];credentials?:CredentialSession}
export interface TargetTrial extends ValidationRecord {completed:boolean;copyId:string;verdicts:Verdict[]}
const root=fileURLToPath(new URL('../../../../',import.meta.url));
export async function runTargetTrial(spec:TemplateSpec,rule:RuleContract,input:TargetTrialInput):Promise<TargetTrial>{
  if(!input.confirmed)throw new Error('TARGET_TRIAL_NOT_CONFIRMED');
  const profile=await inspectProject(input.source);if(input.sourceHash&&profile.sourceHash!==input.sourceHash)throw new Error('CONDITIONS_CHANGED_RECONNECT_REQUIRED');if(!profile.supported||!profile.mapping)throw new Error('TARGET_PROFILE_GAP');
  const socket=createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));const port=(socket.address() as {port:number}).port;await new Promise<void>((r,j)=>socket.close(e=>e?j(e):r()));
  const credentials=input.credentials??new CredentialSession();if(!input.credentials){credentials.set(input.projectId,'owner',randomUUID());credentials.set(input.projectId,'other',randomUUID());}
  const env=await prepareCopy(profile,{projectId:input.projectId,port,confirmed:true,data:input.data??{source:'synthetic',count:2,seedVersion:'ticket-seed-v1'},accounts:input.accounts??[{actorRef:'owner',username:'alpha',userId:'user-a',role:'user'},{actorRef:'other',username:'beta',userId:'user-b',role:'user'}],credentials});
  const {coreCommand}=await import(pathToFileURL(join(root,'scripts/toolchain.mjs')).href);const core=new CoreClient({...coreCommand(),timeoutMs:5000});
  // Additional normalized fields are declared locally and bound to this copy.
  // This T4 fixed pilot uses the ticket adapter, not arbitrary website inference.
  const definition=structuredClone(input.mapping??profile.mapping);if(!input.mapping)definition.resultBindings.query={...definition.resultBindings.query,priority:['items','0','priority'],ownerId:['items','0','ownerId']};
  const mapping=bindMapping(definition,env.id),runId=randomUUID(),refs:string[]=[];
  const record:TargetTrial={scope:'project_trial',projectId:input.projectId,copyId:env.id,candidateHash:digest(spec),ruleHash:digest(rule),suiteHash:'',interpreterVersion:'1.0.0',mappingHash:mappingHash(mapping),mappingDefinitionHash:digest(definition),gateResults:{completed:false},evidenceRefs:refs,completed:false,verdicts:[]};
  try{
    const prepare=async(checkId:string)=>env.prepareExperiment({runId,checkId,ruleHash:digest(rule),mapping,mappingHash:record.mappingHash,confirmed:true,budget:{maxOperations:spec.limits.maxActions,deadlineMs:spec.limits.runTimeoutMs}});
    await prepare(spec.checks[0]!);let state:Transition=await command(core,runId,'start',runPayload(spec,rule,'T4-target-trial'));let incomplete=false;
    while(state.state==='running'){
      const action=state.actions[0];if(!action)throw new Error('NO_ACTION');
      if(action.attemptId!==env.currentAttempt?.id){await env.completeAttempt();await prepare(action.checkId);}
      const observation=await execute(action,{environment:env,mapping});
      refs.push(...observation.evidenceRefs.map(ref=>`target:${env.id}:${ref.replace(/^evidence:/,'')}`));if(observation.transportStatus!=='ok')incomplete=true;
      state=await command(core,runId,'observation',{observation});
    }
    if(env.currentAttempt?.status==='running')await env.completeAttempt();
    record.verdicts=state.verdicts.map(v=>({...v,evidenceRefs:v.evidenceRefs.map(ref=>`target:${env.id}:${ref.replace(/^evidence:/,'')}`)}));
    record.completed=state.state==='completed'&&!incomplete;record.gateResults.completed=record.completed;
    record.gateResults.conclusive=record.completed&&record.verdicts.length===spec.assertions.length&&record.verdicts.every(v=>v.status!=='inconclusive'&&v.evidenceRefs.length>0);
    await env.record({kind:'candidate_trial_result',record});return record;
  }finally{try{await env.close();}finally{if(!input.credentials)credentials.close();await core.close();}}
}
