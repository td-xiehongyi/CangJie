import {ModelCredentials} from './credentials.js';
import {ModelBudget} from './budget.js';
import {serviceUrl,OFFICIAL_SERVICE} from './endpoint.js';
import {filterContext,filterDiscoveryContext,type DiscoveryContext,type ContextRequest,type DisclosureConsent} from './context.js';
import {randomUUID} from 'node:crypto';
import {readJson} from '../execution/http-json.js';
export interface ModelConfig {serviceUrl:string;model:string;credentialRef?:string}
export class ModelFault extends Error {constructor(readonly code:string,readonly category:'provider'|'output'|'budget'|'scope'|'config'){super(code);}}
export interface ModelRequest {purpose:'connection'|'proposal'|'candidate'|'discovery';instructions:string;payload:unknown;context?:ContextRequest;consent?:DisclosureConsent;discovery?:DiscoveryContext;signal?:AbortSignal}
export class ModelProvider {
  readonly config:ModelConfig;readonly audit:Record<string,unknown>[]=[];
  constructor(config:ModelConfig,readonly credentials:ModelCredentials,readonly budget:ModelBudget,private readonly checkpoint:()=>Promise<void>=async()=>{}){this.config=Object.freeze({...config,serviceUrl:serviceUrl(config.serviceUrl)});}
  async checkConnection(){const result=await this.json({purpose:'connection',instructions:'Return JSON only: {"ok":true}.',payload:{}});if(result.value.ok!==true)throw new ModelFault('INCOMPATIBLE_STRUCTURED_OUTPUT','output');return result;}
  /** Local request construction only; no reservation, checkpoint or network. */
  async prepare(request:ModelRequest){
    if(!this.config.model||this.config.model!==this.config.model.trim())throw new ModelFault('MODEL_REQUIRED','config');
    const key=await this.credentials.get(this.config.credentialRef,this.config.serviceUrl);
    let context:{files:unknown[];manifest:unknown[];index?:unknown[];sourceBytes?:number}={files:[],manifest:[]};
    if(request.purpose==='discovery'){
      if(!request.discovery)throw new ModelFault('SENDING_NOT_CONFIRMED','scope');
      context=await filterDiscoveryContext(request.discovery,this.config.serviceUrl,[key]);
    }else if(request.purpose!=='connection'){
      if(!request.context)throw new ModelFault('SENDING_NOT_CONFIRMED','scope');
      context=await filterContext(request.context,request.consent,this.config.serviceUrl,[key]);
    }
    const material={input:request.payload,...(context.index?{index:context.index}:{}),files:context.files};
    const encodedMaterial=JSON.stringify(request.purpose==='discovery'?material:this.credentials.redact(material));
    if(request.purpose==='discovery'&&encodedMaterial.includes(key))throw new ModelFault('SENSITIVE_FILE','scope');
    const messages=[{role:'system',content:this.credentials.redact(request.instructions+'\nRespond with a JSON object only.')},{role:'user',content:encodedMaterial}];
    const body={model:this.config.model,messages,response_format:{type:'json_object'},max_tokens:this.budget.preset.maxOutputTokens,stream:false,...(new URL(this.config.serviceUrl).origin===OFFICIAL_SERVICE?{thinking:{type:'disabled'}}:{})};
    return {encoded:JSON.stringify(body),context,key};
  }
  async json(request:ModelRequest):Promise<{value:any;usage:{totalTokens:number};audit:Record<string,unknown>}>{
    const {encoded,context,key}=await this.prepare(request),reservation=this.budget.reserve(Buffer.byteLength(encoded));
    const audit:Record<string,unknown>={id:randomUUID(),purpose:request.purpose,model:this.config.model,serviceUrl:this.config.serviceUrl,presetVersion:this.budget.preset.version,manifest:context.manifest,inputBytes:Buffer.byteLength(encoded),sourceBytes:context.sourceBytes??0,startedAt:new Date().toISOString(),status:'started',usageUnknown:true};this.audit.push(audit);
    // Durably reserve the call before the network side effect. A crashed task
    // retains that reservation; reopening never resets spent/uncertain usage.
    await this.checkpoint();
    try{
      const timeout=AbortSignal.timeout(Math.min(this.budget.preset.timeoutMs,Math.max(1,this.budget.preset.deadlineMs-(Date.now()-this.budget.usage.startedAt))));
      let response:Response;try{response=await fetch(this.config.serviceUrl+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:encoded,redirect:'manual',signal:request.signal?AbortSignal.any([timeout,request.signal]):timeout});}catch{throw new ModelFault(request.signal?.aborted?'ANALYSIS_PAUSED':'PROVIDER_UNAVAILABLE','provider');}
      if(response.status===401||response.status===403)throw new ModelFault('AUTHENTICATION_FAILED','provider');
      if(response.status===404)throw new ModelFault('MODEL_NOT_FOUND','provider');
      if(!response.ok)throw new ModelFault('PROVIDER_UNAVAILABLE','provider');
      let raw:any;try{raw=await readJson(response);}catch{throw new ModelFault('INCOMPATIBLE_RESPONSE','provider');}
      const choice=raw?.choices?.[0];if(!choice?.message||typeof choice.message.content!=='string'||typeof choice.finish_reason!=='string')throw new ModelFault('INCOMPATIBLE_RESPONSE','provider');
      if(choice.finish_reason==='length')throw new ModelFault('TRUNCATED_OUTPUT','output');if(choice.finish_reason!=='stop')throw new ModelFault('INCOMPATIBLE_RESPONSE','provider');
      if(!choice.message.content.trim())throw new ModelFault('EMPTY_OUTPUT','output');
      let value:any;try{value=JSON.parse(choice.message.content);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();}catch{throw new ModelFault('INVALID_JSON','output');}
      const total=raw.usage?.total_tokens;if(!Number.isSafeInteger(total)||total<0)throw new ModelFault('INCOMPATIBLE_RESPONSE','provider');
      this.budget.settle(reservation,total);audit.status='completed';audit.totalTokens=total;audit.usageUnknown=false;
      if(request.purpose==='discovery')audit.response=this.credentials.redact(value);
      return {value:this.credentials.redact(value),usage:{totalTokens:total},audit};
    }catch(error){audit.status='failed';audit.code=error instanceof ModelFault?error.code:'MODEL_REQUEST_FAILED';throw error;}finally{await this.checkpoint();}
  }
}
