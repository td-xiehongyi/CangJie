export interface WorkflowChoice {enabled:boolean;confirmed:boolean;version?:string;ruleHash:string;environmentHash:string}
export interface WorkflowDraft {revision:number;flow:string;flows:Record<string,Record<string,WorkflowChoice>>}
export interface PreparationResult {status:'preparing'|'ready'|'failed'|'interrupted';environmentHash:string;startedAt:string;completedAt?:string;verifiedAccounts?:number;code?:string}
const flows=['submit','edit','proposal'];
const hash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const emptyWorkflow=():WorkflowDraft=>({revision:0,flow:'submit',flows:{}});

export function writeWorkflow(previous:WorkflowDraft,input:unknown,ruleHashes:Map<string,string>,environmentHash:string,versions:Set<string>):WorkflowDraft{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('INVALID_WORKFLOW');
  const data=input as Record<string,unknown>;
  if(Object.keys(data).some(k=>!['revision','flow','choices'].includes(k))||!Number.isSafeInteger(data.revision)||!flows.includes(String(data.flow))||!data.choices||typeof data.choices!=='object'||Array.isArray(data.choices))throw new Error('INVALID_WORKFLOW');
  if(data.revision!==previous.revision)throw new Error('WORKFLOW_CONFLICT');
  const choices:Record<string,WorkflowChoice>={};
  if(Object.keys(data.choices).length>ruleHashes.size)throw new Error('INVALID_WORKFLOW');
  for(const [id,value]of Object.entries(data.choices)){
    if(!ruleHashes.has(id)||!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_WORKFLOW');
    const c=value as Record<string,unknown>;
    if(Object.keys(c).some(k=>!['enabled','confirmed','version','ruleHash','environmentHash'].includes(k))||typeof c.enabled!=='boolean'||typeof c.confirmed!=='boolean'||!hash(c.ruleHash)||!hash(c.environmentHash)||c.version!==undefined&&!hash(c.version))throw new Error('INVALID_WORKFLOW');
    const valid=c.ruleHash===ruleHashes.get(id)&&c.environmentHash===environmentHash&&(!c.version||versions.has(`${id}:${c.version}`));
    choices[id]={enabled:c.enabled,confirmed:c.confirmed&&valid,ruleHash:String(c.ruleHash),environmentHash:String(c.environmentHash),...(c.version?{version:String(c.version)}:{})};
  }
  return {revision:previous.revision+1,flow:String(data.flow),flows:{...previous.flows,[String(data.flow)]:choices}};
}

export function reconcileWorkflow(draft:WorkflowDraft,ruleHashes:Map<string,string>,environmentHash:string,versions:Set<string>):WorkflowDraft{
  let changed=false;const next=structuredClone(draft);
  for(const choices of Object.values(next.flows))for(const [id,c]of Object.entries(choices)){
    if(c.confirmed&&(c.ruleHash!==ruleHashes.get(id)||c.environmentHash!==environmentHash||!!c.version&&!versions.has(`${id}:${c.version}`))){c.confirmed=false;changed=true;}
  }
  if(changed){next.revision++;return next;}return draft;
}
