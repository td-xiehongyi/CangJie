import type {HttpEnvironment} from './http.js';
import {readPath,safePath,type HttpMapping} from './mapping.js';
import {readJson} from './http-json.js';

export async function authenticate(env:HttpEnvironment,mapping:HttpMapping,actor:string,signal:AbortSignal):Promise<{token:string;userId:string}>{
  const cached=env.sessions.get(actor);if(cached)return cached;
  const account=env.config.accounts.find(a=>a.actorRef===actor);if(!account||!mapping.actorRefs.includes(actor))throw new Error('UNKNOWN_ACTOR');
  safePath(mapping.auth.loginPath);safePath(mapping.auth.identityPath);
  const login=await fetch(env.baseUrl+mapping.auth.loginPath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({[mapping.auth.usernameField]:account.username,[mapping.auth.passwordField]:env.config.credentials.get(env.config.projectId,actor)}),redirect:'manual',signal});
  if(login.status!==200)throw new Error('LOGIN_REJECTED');
  const token=readPath(await readJson(login),mapping.auth.tokenPath);if(typeof token!=='string'||!token||token.length>8192)throw new Error('LOGIN_IDENTITY_UNVERIFIED');
  const identity=await fetch(env.baseUrl+mapping.auth.identityPath,{headers:{authorization:`Bearer ${token}`},redirect:'manual',signal});
  if(identity.status!==200||readPath(await readJson(identity),mapping.auth.idPath)!==account.userId)throw new Error('LOGIN_IDENTITY_UNVERIFIED');
  env.sessions.set(actor,token,account.userId);await env.record({kind:'actor_verified',attemptId:env.currentAttempt?.id,actorRef:actor,userId:account.userId});return env.sessions.get(actor)!;
}
