import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {TemplateSpec,RuleContract,Observation,Transition,ValidationCaseResult,CapabilitySet} from '@website-verification/contracts';
import {CoreClient} from '../core/client.js';

export const capabilities:CapabilitySet={operations:['create','query','update'],actorRefs:['owner','other'],expressions:['field','const','exists','eq','neq','count','contains','all','any','not']};
export type Sample=Pick<Observation,'transportStatus'|'identityVerified'|'acceptance'|'result'|'queryComplete'>;
export interface SampleFrame {operationId:string;actorRef:string;observation:Sample}
export type CaseResult=ValidationCaseResult;
export async function command(core:CoreClient,runId:string,kind:string,payload:Record<string,unknown>):Promise<any>{
  const events=await core.send({schemaVersion:1,messageId:randomUUID(),runId,kind,payload});
  const event=events.at(-1)!;if(event.payload.status==='error')throw new Error(event.payload.code??'CORE_REJECTED');
  return event.payload.data;
}
export function runPayload(spec:TemplateSpec,rule:RuleContract,validationRef:string){return {operation:'runTemplate',spec,capabilities,rule,scope:{kind:'observation_validation',confirmed:true,validationRef}};}
export function matches(result:CaseResult,expected:Record<string,string>):boolean {
  // A crash/cancel/blocked run is never a business-defect detection. Exactly
  // the reviewed assertion set must be present, with evidence on every verdict.
  return result.completed&&result.verdicts.length===Object.keys(expected).length&&new Set(result.verdicts.map(v=>v.assertionRef)).size===result.verdicts.length&&result.verdicts.every(v=>expected[v.assertionRef]===v.status&&v.evidenceRefs.length>0);
}
export async function validateObservations(core:CoreClient,spec:TemplateSpec,rule:RuleContract,caseId:string,samples:SampleFrame[],evidenceRoot:string):Promise<CaseResult>{
  const runId=randomUUID(),refs:string[]=[],delivered:Observation[]=[];
  let state:Transition=await command(core,runId,'start',runPayload(spec,rule,caseId));
  try{
    while(state.state==='running'){
      const action=state.actions[0];if(!action)throw new Error('NO_ACTION');
      const frame=samples[delivered.length];
      if(!frame||frame.operationId!==action.operationId||frame.actorRef!==action.actorRef)throw new Error('OBSERVATION_TRACE_UNSUPPORTED');
      const sample=frame.observation;
      const ref=`observation:${runId}:${action.stepId}`;refs.push(ref);
      const observation:Observation={...structuredClone(sample),actionId:action.actionId,intentId:action.intentId,attemptId:action.attemptId,evidenceRefs:[ref]};delivered.push(observation);
      state=await command(core,runId,'observation',{observation});
    }
    return {caseId,phase:'observation',completed:state.state==='completed'&&delivered.length===samples.length,matched:false,verdicts:state.verdicts,evidenceRefs:refs};
  }catch{
    try{state=await command(core,runId,'cancel',{});}catch{}
    return {caseId,phase:'observation',completed:false,matched:false,verdicts:state.verdicts,evidenceRefs:refs,reason:'OBSERVATION_TRACE_INCOMPLETE'};
  }finally{
    await mkdir(evidenceRoot,{recursive:true});await writeFile(join(evidenceRoot,`${runId}.json`),JSON.stringify({caseId,runId,observations:delivered,state},null,2)+'\n');
  }
}
