import {createHash} from 'node:crypto';
import type {MappingSpec,Json} from '@website-verification/contracts';
import {validateContract} from '@website-verification/contracts/validate';
export type HttpMapping=MappingSpec;
export function bindMapping(mapping:HttpMapping,targetRef:string):HttpMapping{const bound=structuredClone(mapping);bound.targetRef=targetRef;return bound;}
export function mappingHash(mapping:HttpMapping):string{return createHash('sha256').update(JSON.stringify(mapping)).digest('hex');}
const keyPattern=/^[A-Za-z0-9_-]+$/;
export function safePath(path:string):void{
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||path.includes('\\')||path.includes('#')||path.includes('?'))throw new Error('EXTERNAL_SERVICE_BLOCKED');
  let decoded:string;try{decoded=decodeURIComponent(path);}catch{throw new Error('INVALID_PATH');}
  if(decoded.includes('..')||decoded.includes('\\')||decoded.startsWith('//'))throw new Error('PATH_ESCAPE');
}
export function validateMapping(mapping:HttpMapping):void{
  // Inspect paths first so an external target is always rejected before authentication.
  for(const op of mapping?.operations??[])safePath(op.path);
  if(!validateContract('MappingSpec',mapping).valid)throw new Error('INVALID_MAPPING');
  if(!mapping||mapping.authMode!=='token'||!mapping.id||!Number.isSafeInteger(mapping.version)||mapping.version<1||!mapping.targetRef||!Array.isArray(mapping.operations)||!Array.isArray(mapping.actorRefs)||new Set(mapping.actorRefs).size!==mapping.actorRefs.length)throw new Error('INVALID_MAPPING');
  for(const path of [mapping.auth?.loginPath,mapping.auth?.identityPath])safePath(path);
  for(const field of [mapping.auth.usernameField,mapping.auth.passwordField])if(!keyPattern.test(field)||['__proto__','constructor','prototype'].includes(field))throw new Error('INVALID_MAPPING_FIELD');
  for(const path of [mapping.auth.tokenPath,mapping.auth.idPath,...Object.values(mapping.resultBindings??{}).flatMap(x=>Object.values(x)),...Object.values(mapping.queryCompleteness??{}).flatMap(x=>Object.values(x))])validateFieldPath(path);
  const ids=new Set<string>();for(const op of mapping.operations){if(!keyPattern.test(op.operationId)||ids.has(op.operationId)||!['GET','POST','PATCH','PUT','DELETE'].includes(op.method))throw new Error('INVALID_MAPPING');ids.add(op.operationId);safePath(op.path);for(const [k,v]of Object.entries({...op.bodyBindings,...op.queryBindings}))if(!keyPattern.test(k)||!keyPattern.test(v)||['__proto__','constructor','prototype'].includes(k))throw new Error('INVALID_MAPPING_FIELD');if(!mapping.resultBindings?.[op.operationId])throw new Error('RESULT_BINDING_REQUIRED');if(op.method==='GET'&&!mapping.queryCompleteness?.[op.operationId])throw new Error('QUERY_COMPLETENESS_REQUIRED');}
}
function validateFieldPath(path:unknown):void{if(!Array.isArray(path)||path.length>12||path.some(k=>typeof k!=='string'||!keyPattern.test(k)||['__proto__','constructor','prototype'].includes(k)))throw new Error('INVALID_MAPPING_FIELD');}
export function readPath(value:unknown,path:string[]):unknown{let v=value;for(const k of path){if(!v||typeof v!=='object'||!Object.hasOwn(v,k))return undefined;v=(v as Record<string,unknown>)[k];}return v;}
export function normalized(mapping:HttpMapping,op:string,response:unknown):Record<string,Json>{const out:Record<string,Json>={};for(const [k,path]of Object.entries(mapping.resultBindings[op]??{})){const value=readPath(response,path);if(value!==undefined)out[k]=value as Json;}return out;}
