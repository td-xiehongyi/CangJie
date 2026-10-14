import {readFile,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {digest} from '../projects/inspect.js';
import {serviceUrl} from './endpoint.js';
import {fileURLToPath} from 'node:url';
import type {AnalysisScope,SourceSnapshot,SourceExcerpt} from '@website-verification/contracts/discovery';
import {scopedSourceFiles,validateSourceRefs} from '../discovery/access.js';
import {isProjectTest} from '../discovery/index.js';
export interface ContextRequest {projectId:string;root:string;serviceUrl:string;entries:{path:string;contentType:'source'|'summary'|'rule'}[]}
export interface Disclosure {projectId:string;root:string;serviceUrl:string;entries:{path:string;contentType:string}[];scopeHash:string}
export interface DisclosureConsent extends Disclosure {confirmed:true;confirmedAt:string}
export interface DiscoveryContext {snapshot:SourceSnapshot;scope:AnalysisScope;reads:SourceExcerpt[]}
export async function filterDiscoveryContext(context:DiscoveryContext,endpoint:string,secrets:string[]){
  const {snapshot,scope,reads}=context;
  if(!scope.confirmedAt||!Number.isFinite(Date.parse(scope.confirmedAt)))throw new Error('SENDING_NOT_CONFIRMED');
  if(serviceUrl(scope.serviceUrl)!==serviceUrl(endpoint))throw new Error('SERVICE_CONFIRMATION_REQUIRED');
  const indexed=scopedSourceFiles(snapshot,scope),allowed=new Set(indexed.map(f=>f.path));
  if(reads.some(r=>!allowed.has(r.ref.path)))throw new Error('SCOPE_NOT_ALLOWED');
  const checked=await validateSourceRefs(snapshot,reads,reads.map(r=>r.ref));if(!checked.valid)throw new Error(checked.issues[0]!.code);
  const index=indexed.map(({path,hash,bytes,language,lineCount,symbols,imports,routes})=>({path,hash,bytes,language,lineCount,symbols,imports,routes}));
  const files=reads.map(r=>({path:r.ref.path,content:r.text,sourceRef:r.ref,sourceKind:isProjectTest(r.ref.path)?'project_test':/\.(md|txt)$/i.test(r.ref.path)?'documentation':'source'}));
  // Redaction would invalidate a cited excerpt; reject rather than relabel altered text as original.
  const raw=JSON.stringify({index,files});if(secrets.some(secret=>secret&&raw.includes(secret)))throw new Error('SENSITIVE_FILE');
  return {index,files,manifest:reads.map(r=>({path:r.ref.path,bytes:r.bytes,hash:r.ref.excerptHash})),sourceBytes:reads.reduce((n,r)=>n+r.bytes,0)};
}
const denied=/(^|\/)(?:\.env(?:\.|$)|\.git|\.aws|\.codex|node_modules|tests|templates|\.local-data|\.local-tools)(\/|$)|password|credential|secret|(?:api[-_]?key)|\.(?:sqlite|sqlite3|db|db3|pem|key|pfx|p12|bak|backup|zip)$/i;
const toolRoot=fileURLToPath(new URL('../../../../',import.meta.url));
const protectedTrees=['tests','templates',...['validation','reference-sources','candidates','model','workbench','runs','templates','projects'].map(p=>'.local-data/'+p)].map(p=>resolve(toolRoot,p).toLowerCase());
function protectedPath(path:string):boolean{return protectedTrees.some(tree=>{const rel=relative(tree,path.toLowerCase());return !rel||(!rel.startsWith('..')&&!isAbsolute(rel));});}
async function normalize(request:ContextRequest):Promise<Disclosure>{
  if(!request.projectId||!request.entries.length||request.entries.length>16)throw new Error('INVALID_SCOPE');
  const root=await realpath(request.root),entries:Disclosure['entries']=[];if(protectedPath(root))throw new Error('SENSITIVE_FILE');
  for(const entry of request.entries){
    if(!['source','summary','rule'].includes(entry.contentType))throw new Error('INVALID_SCOPE');
    const path=resolve(root,entry.path),rel=relative(root,path);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('PATH_ESCAPE');
    const normalized=rel.split(sep).join('/');if(denied.test(normalized))throw new Error('SENSITIVE_FILE');
    let current=root;for(const part of rel.split(sep)){current=resolve(current,part);if((await lstat(current)).isSymbolicLink())throw new Error('PATH_ESCAPE');}
    const actual=await realpath(path),outside=relative(root,actual);if(protectedPath(actual))throw new Error('SENSITIVE_FILE');if(outside.startsWith('..')||isAbsolute(outside)||!(await lstat(actual)).isFile())throw new Error('PATH_ESCAPE');
    entries.push({path:normalized.toLowerCase(),contentType:entry.contentType});
  }
  entries.sort((a,b)=>a.path.localeCompare(b.path));if(new Set(entries.map(e=>e.path)).size!==entries.length)throw new Error('INVALID_SCOPE');
  const scope={projectId:request.projectId,root:root.toLowerCase(),serviceUrl:serviceUrl(request.serviceUrl),entries};return {...scope,scopeHash:digest(scope)};
}
export async function disclose(request:ContextRequest):Promise<Disclosure>{return normalize(request);}
export function confirmDisclosure(disclosure:Disclosure,confirmed:boolean):DisclosureConsent{
  if(!confirmed)throw new Error('SENDING_NOT_CONFIRMED');return {...structuredClone(disclosure),confirmed:true,confirmedAt:new Date().toISOString()};
}
export function scrubSecrets(value:unknown,secrets:string[]=[]):any{
  if(typeof value==='string'){
    let out=value.replace(/Bearer\s+[^\s"']+/gi,'[redacted]').replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g,'[redacted]');
    for(const secret of secrets)if(secret)out=out.split(secret).join('[redacted]');
    return out.split('\n').map(line=>/\b(?:password|passwd|api[_-]?key|token|secret|authorization)\b\s*[=:]/i.test(line)?'[redacted sensitive line]':line).join('\n');
  }
  if(Array.isArray(value))return value.map(v=>scrubSecrets(v,secrets));
  if(value&&typeof value==='object'){const out:Record<string,unknown>={};for(const [k,v]of Object.entries(value))if(!/^(?:password|passwd|api[_-]?key|token|secret|authorization|cookie|access_token|refresh_token)$/i.test(k))out[k]=scrubSecrets(v,secrets);return out;}
  return value;
}
export async function filterContext(request:ContextRequest,consent:DisclosureConsent|undefined,endpoint:string,secrets:string[]):Promise<{files:{path:string;contentType:string;content:string}[];manifest:{path:string;contentType:string;bytes:number;hash:string}[]}> {
  if(!consent?.confirmed)throw new Error('SENDING_NOT_CONFIRMED');
  const current=await normalize(request);
  if(current.serviceUrl!==serviceUrl(endpoint)||consent.serviceUrl!==current.serviceUrl)throw new Error('SERVICE_CONFIRMATION_REQUIRED');
  const original={projectId:consent.projectId,root:consent.root,serviceUrl:consent.serviceUrl,entries:consent.entries};
  if(digest(original)!==consent.scopeHash||consent.projectId!==current.projectId||consent.root!==current.root||current.entries.some(e=>!consent.entries.some(c=>c.path===e.path&&c.contentType===e.contentType)))throw new Error('SCOPE_CONFIRMATION_REQUIRED');
  const files=[],manifest=[];let total=0;
  for(const entry of current.entries){const raw=await readFile(resolve(current.root,entry.path),'utf8');total+=Buffer.byteLength(raw);if(Buffer.byteLength(raw)>65536||total>98304||raw.includes('\0'))throw new Error('CONTEXT_BUDGET_EXCEEDED');const content=scrubSecrets(raw,secrets) as string;files.push({...entry,content});manifest.push({...entry,bytes:Buffer.byteLength(content),hash:digest(content)});}
  return {files,manifest};
}
