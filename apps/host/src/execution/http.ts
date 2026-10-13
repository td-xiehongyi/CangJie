import type {Observation,ToolAction,Json} from '@website-verification/contracts';
import type {TestEnvironment} from '../projects/reset.js';
import {validateMapping,mappingHash,normalized,readPath,safePath,type HttpMapping} from './mapping.js';
import {readJson as json} from './http-json.js';
import {authenticate} from './auth.js';

export type HttpEnvironment=Pick<TestEnvironment,'id'|'config'|'baseUrl'|'sessions'|'currentAttempt'|'operation'|'record'|'saveObservation'|'uncertainWrite'>;
export interface ExecutionContext {environment:HttpEnvironment;mapping:HttpMapping}
export async function execute(action:ToolAction,{environment:env,mapping}:ExecutionContext):Promise<Observation>{
  validateMapping(mapping);
  const op=mapping.operations.find(o=>o.operationId===action.operationId);if(!op)throw new Error('UNKNOWN_OPERATION');
  const attempt=env.currentAttempt;if(mapping.targetRef!==env.id||mappingHash(mapping)!==attempt?.mappingHash)throw new Error('MAPPING_CHANGED');
  const account=env.config.accounts.find(a=>a.actorRef===action.actorRef);
  if(!account||!mapping.actorRefs.includes(action.actorRef))throw new Error('UNKNOWN_ACTOR');
  if(!Number.isSafeInteger(action.deadline)||action.deadline<1||action.deadline>300000)throw new Error('INVALID_ACTION_DEADLINE');
  return env.operation(action,async cancellation=>{
    const signal=AbortSignal.any([cancellation,AbortSignal.timeout(Math.max(1,Math.min(action.deadline,attempt.budget.deadlineMs-(Date.now()-Date.parse(attempt.startedAt)))))]);
    let sentWrite=false;
    const http:Record<string,unknown>={actorRef:action.actorRef};
    let observation:Observation={actionId:action.actionId,intentId:action.intentId,attemptId:action.attemptId,transportStatus:'ok',identityVerified:false,acceptance:'unknown',result:null,queryComplete:false,evidenceRefs:[]};
    try{
      const session=await authenticate(env,mapping,action.actorRef,signal);
      observation.identityVerified=true;
      const path=op.path.replace(/:([A-Za-z0-9_]+)/g,(_match,key:string)=>{const value=action.bindings[key];if(typeof value!=='string'&&typeof value!=='number')throw new Error('MISSING_PATH_BINDING');return encodeURIComponent(String(value));});
      safePath(path);const query=new URLSearchParams(),body:Record<string,Json>={};
      for(const [key,binding]of Object.entries(op.queryBindings??{})){const value=action.bindings[binding];if(value!==undefined){if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')throw new Error('INVALID_QUERY_BINDING');query.set(key,String(value));}}
      for(const [key,binding]of Object.entries(op.bodyBindings??{})){const value=action.bindings[binding];if(value!==undefined)body[key]=value;}
      if(op.method==='GET')query.set('attemptId',action.attemptId);
      const headers:Record<string,string>={authorization:`Bearer ${session.token}`,'x-verification-attempt':action.attemptId,'x-verification-intent':typeof action.bindings.intent==='string'?action.bindings.intent:action.intentId,'content-type':'application/json'};
      http.request={method:op.method,path,query:Object.fromEntries(query),body:op.method==='GET'?null:body};
      await env.record({kind:'action_started',actionId:action.actionId,attemptId:action.attemptId,actorRef:action.actorRef,operationId:action.operationId});
      sentWrite=op.method!=='GET';
      const response=await fetch(env.baseUrl+path+(query.size?'?'+query.toString():''),{method:op.method,headers,...(op.method!=='GET'?{body:JSON.stringify(body)}:{}),redirect:'manual',signal});
      const raw=await json(response);
      http.response={status:response.status,body:raw};
      observation.acceptance=response.status>=200&&response.status<300?'accepted':response.status>=400&&response.status<500?'rejected':'unknown';
      const result=normalized(mapping,op.operationId,raw);
      if(op.method==='GET'){
        const completeness=mapping.queryCompleteness[op.operationId]!;
        const items=readPath(raw,completeness.itemsPath),total=readPath(raw,completeness.totalPath);
        // /me establishes the querying identity. For a specifically bound object,
        // ownership is business evidence: filtering a different owner here would
        // conceal unauthorized visibility and unintended ownership changes.
        const associated=(row:unknown)=>!!row&&typeof row==='object'&&readPath(row,['attemptId'])===action.attemptId&&(action.bindings.id!==undefined||readPath(row,['ownerId'])===account.userId)&&(action.bindings.id===undefined||readPath(row,['id'])===action.bindings.id)&&(action.bindings.intent===undefined||readPath(row,['intentId'])===action.bindings.intent);
        const scoped=Array.isArray(items)&&items.every(associated);
        observation.queryComplete=response.status===200&&scoped&&Number.isSafeInteger(total)&&total===(items as unknown[]).length&&readPath(raw,completeness.hasMorePath)===false&&readPath(raw,completeness.completePath)===true;
        if(!scoped){observation.acceptance='unknown';observation.result=null;}else observation.result=result;
      }else{
        const associated=readPath(raw,['attemptId'])===action.attemptId&&(op.method!=='POST'||readPath(raw,['ownerId'])===account.userId)&&readPath(raw,['intentId'])===headers['x-verification-intent']&&(action.bindings.id===undefined||readPath(raw,['id'])===action.bindings.id);
        if(observation.acceptance==='accepted'&&!associated){observation.acceptance='unknown';observation.result=null;}else {observation.result=result;observation.queryComplete=observation.acceptance==='rejected'||associated;}
      }
      observation=env.config.credentials.redact(env.sessions.redact(observation)) as Observation;
      observation.evidenceRefs=[await env.saveObservation(action,observation,http)];
      if(sentWrite&&observation.acceptance==='unknown')await env.uncertainWrite();
      else if(observation.acceptance!=='unknown')attempt.stepIndex++;
      return observation;
    }catch{
      observation={...observation,transportStatus:signal.aborted&&!cancellation.aborted?'timeout':'error',acceptance:'unknown',result:null,queryComplete:false};
      http.interrupted=true;http.writeMayHaveOccurred=sentWrite;
      observation.evidenceRefs=[await env.saveObservation(action,observation,http)];
      if(sentWrite)await env.uncertainWrite();
      return observation;
    }
  });
}
