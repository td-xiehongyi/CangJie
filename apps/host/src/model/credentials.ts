import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {serviceUrl} from './endpoint.js';
import {scrubSecrets} from './context.js';
const bridge=fileURLToPath(new URL('../../../../scripts/windows-credential.ps1',import.meta.url));
async function native(operation:string,target:string,value?:string):Promise<any>{
  if(process.platform!=='win32')throw new Error('CREDENTIAL_STORE_UNAVAILABLE');
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',bridge],{windowsHide:true,stdio:'pipe'});let output='';let failed=false;
    const timer=setTimeout(()=>{failed=true;child.kill();reject(new Error('CREDENTIAL_STORE_UNAVAILABLE'));},10000);
    child.stderr.resume();child.stdout.on('data',v=>{output+=v;if(output.length>16384){failed=true;child.kill();}});child.once('error',()=>{clearTimeout(timer);reject(new Error('CREDENTIAL_STORE_UNAVAILABLE'));});
    child.once('close',code=>{clearTimeout(timer);if(failed||code!==0){reject(new Error('CREDENTIAL_STORE_UNAVAILABLE'));return;}try{resolve(JSON.parse(output));}catch{reject(new Error('CREDENTIAL_STORE_UNAVAILABLE'));}});
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({operation,target,value}));
  });
}
export class ModelCredentials {
  #keys=new Map<string,{key:string;service:string}>();#closed=false;
  async set(endpoint:string,key:string,{remember}:{remember:boolean}):Promise<string>{
    if(this.#closed||!key||key.length>2000||/[\r\n]/.test(key))throw new Error('INVALID_MODEL_KEY');
    const ref=`${remember?'windows':'session'}:${randomUUID()}`,entry={key,service:serviceUrl(endpoint)};
    if(remember)await native('write',`website-verification/model/${ref.split(':')[1]}`,JSON.stringify(entry));this.#keys.set(ref,entry);return ref;
  }
  async get(ref:string|undefined,endpoint:string):Promise<string>{
    if(this.#closed)throw new Error('CREDENTIAL_SESSION_CLOSED');if(!ref||!/^(windows|session):[a-f0-9-]{36}$/.test(ref))throw new Error('MODEL_KEY_REQUIRED');
    let entry=this.#keys.get(ref);
    if(!entry&&ref.startsWith('windows:')){const loaded=await native('read',`website-verification/model/${ref.split(':')[1]}`);if(loaded.value)try{entry=JSON.parse(loaded.value);}catch{throw new Error('CREDENTIAL_STORE_UNAVAILABLE');}}
    if(!entry?.key)throw new Error('MODEL_KEY_REQUIRED');if(entry.service!==serviceUrl(endpoint))throw new Error('KEY_SERVICE_MISMATCH');this.#keys.set(ref,entry);return entry.key;
  }
  async clear(ref:string):Promise<void>{this.#keys.delete(ref);if(ref.startsWith('windows:'))await native('delete',`website-verification/model/${ref.split(':')[1]}`);}
  redact(value:unknown):any{return scrubSecrets(value,[...this.#keys.values()].map(e=>e.key));}
  close():void{this.#keys.clear();this.#closed=true;}
}
