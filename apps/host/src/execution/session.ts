export class CredentialSession {
  #passwords=new Map<string,string>();#closed=false;
  set(projectId:string,actorRef:string,password:string):void{if(this.#closed||!password)throw new Error('CREDENTIAL_SESSION_CLOSED_OR_EMPTY');this.#passwords.set(`${projectId}/${actorRef}`,password);}
  get(projectId:string,actorRef:string):string{if(this.#closed)throw new Error('CREDENTIAL_SESSION_CLOSED');const value=this.#passwords.get(`${projectId}/${actorRef}`);if(!value)throw new Error('TEST_PASSWORD_REQUIRED');return value;}
  has(projectId:string,actorRef:string):boolean{return !this.#closed&&this.#passwords.has(`${projectId}/${actorRef}`);}
  redact(value:unknown):unknown{return scrub(value,[...this.#passwords.values()]);}
  close():void{this.#passwords.clear();this.#closed=true;}
}
export class RunSessions {
  #tokens=new Map<string,{token:string;userId:string}>();
  get(actor:string):{token:string;userId:string}|undefined{return this.#tokens.get(actor);}
  set(actor:string,token:string,userId:string):void{this.#tokens.set(actor,{token,userId});}
  get size():number{return this.#tokens.size;}
  redact(value:unknown):unknown{return scrub(value,[...this.#tokens.values()].map(v=>v.token));}
  clear():void{this.#tokens.clear();}
}
/** Explicit backend tool lifecycle. Closing a browser tab does not call this. */
export class ToolSession {
  readonly credentials=new CredentialSession();
  #environments=new Set<{close():Promise<void>}>();#closed=false;
  own<T extends {close():Promise<void>}>(environment:T):T{if(this.#closed)throw new Error('TOOL_SESSION_CLOSED');this.#environments.add(environment);return environment;}
  async close():Promise<void>{if(this.#closed)return;try{const environments=[...this.#environments],results=await Promise.allSettled(environments.map(env=>env.close()));results.forEach((r,i)=>{if(r.status==='fulfilled')this.#environments.delete(environments[i]!);});if(results.some(r=>r.status==='rejected'))throw new Error('TOOL_CHILD_NOT_ISOLATED');this.#closed=true;}finally{this.credentials.close();}}
}
const secretKey=/password|passwd|token|authorization|cookie|secret|api.?key|salt/i;
function scrub(value:unknown,secrets:string[]):unknown{
  if(typeof value==='string'){let out=value.replace(/Bearer\s+[^\s"']+/gi,'[redacted]');for(const s of secrets)if(s)out=out.split(s).join('[redacted]');return out;}
  if(Array.isArray(value))return value.map(v=>scrub(v,secrets));
  if(value&&typeof value==='object'){const out:Record<string,unknown>={};for(const [key,v]of Object.entries(value))if(!secretKey.test(key))out[key]=scrub(v,secrets);return out;}
  return value;
}
