import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ModelProvider} from '../../apps/host/dist/model/provider.js';
import {ModelBudget} from '../../apps/host/dist/model/budget.js';
import {ModelCredentials} from '../../apps/host/dist/model/credentials.js';
import {disclose,confirmDisclosure,filterContext} from '../../apps/host/dist/model/context.js';
import {startWorkbench} from '../../apps/host/dist/api.js';
const url='https://synthetic.invalid';
const success={choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}],usage:{total_tokens:20}};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
async function provider(t){const keys=new ModelCredentials();t.after(()=>keys.close());const credentialRef=await keys.set(url,'SYNTHETIC-ONLY',{remember:false}),budget=new ModelBudget();return {budget,provider:new ModelProvider({serviceUrl:url,model:'fixture',credentialRef},keys,budget)}}
for(const [status,code]of [[400,'MODEL_REQUEST_REJECTED'],[402,'MODEL_PAYMENT_REQUIRED'],[429,'MODEL_RATE_LIMITED'],[503,'PROVIDER_UNAVAILABLE']])test(`HTTP ${status} has safe actionable classification`,async t=>{const x=await provider(t);t.mock.method(globalThis,'fetch',async()=>response({error:{message:'do not expose secret'}},status));await assert.rejects(x.provider.checkConnection(),e=>e.message===code);assert.equal(x.budget.usage.calls,1)});
for(const [content,finish,code]of [['not json','stop','INVALID_JSON'],['{}','length','TRUNCATED_OUTPUT']])test(`known usage settles even for ${code}`,async t=>{const x=await provider(t);t.mock.method(globalThis,'fetch',async()=>response({choices:[{finish_reason:finish,message:{content}}],usage:{total_tokens:20}}));await assert.rejects(x.provider.checkConnection(),new RegExp(code));assert.equal(x.budget.usage.tokens,20);assert.equal(x.provider.audit[0].usageUnknown,false);assert.equal(x.provider.audit[0].status,'failed')});
test('missing usage remains conservatively reserved without discarding valid output',async t=>{const x=await provider(t),body=structuredClone(success);delete body.usage;t.mock.method(globalThis,'fetch',async()=>response(body));assert.equal((await x.provider.checkConnection()).value.ok,true);assert.ok(x.budget.usage.tokens>6000);assert.equal(x.provider.audit[0].usageUnknown,true)});
test('invalid supplied usage remains incompatible',async t=>{const x=await provider(t);t.mock.method(globalThis,'fetch',async()=>response({...success,usage:{total_tokens:-1}}));await assert.rejects(x.provider.checkConnection(),/INCOMPATIBLE_RESPONSE/)});
test('pause during response body remains a pause',async t=>{const x=await provider(t),controller=new AbortController();t.mock.method(globalThis,'fetch',async()=>{controller.abort();return new Response(new ReadableStream({start(c){c.error(new DOMException('aborted','AbortError'))}}),{headers:{'content-type':'application/json'}})});await assert.rejects(x.provider.json({purpose:'connection',instructions:'JSON',payload:{},signal:controller.signal}),/ANALYSIS_PAUSED/)});
test('body deadline has a distinct timeout classification',async t=>{const x=await provider(t);const short=new ModelProvider(x.provider.config,x.provider.credentials,new ModelBudget({...x.budget.preset,timeoutMs:20}));t.mock.method(globalThis,'fetch',async(_url,options)=>new Response(new ReadableStream({start(c){options.signal.addEventListener('abort',()=>c.error(options.signal.reason),{once:true})}}),{headers:{'content-type':'application/json'}}));const keepAlive=setTimeout(()=>{},1000);try{await assert.rejects(short.checkConnection(),/MODEL_TIMEOUT/)}finally{clearTimeout(keepAlive)}});
async function host(t){const directory=await mkdtemp(join(tmpdir(),'cangjie-reliability-')),h=await startWorkbench({directory,port:0});t.after(async()=>{await h.close();await rm(directory,{recursive:true,force:true})});const fetch=globalThis.fetch;return {h,call:async(path,body)=>{const res=await fetch(h.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+h.token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,body:await res.json()}}}}
test('equivalent endpoint spelling retains key',async t=>{const {call}=await host(t);await call('/settings',{serviceUrl:url,model:'fixture',key:'SYNTHETIC-ONLY',remember:false});await call('/settings',{serviceUrl:url+'/',model:'fixture',remember:false});const state=(await call('/state')).body;assert.equal(state.settings.hasKey,true);assert.equal(state.settings.serviceUrl,url)});
test('late connection result cannot certify changed settings; duplicate check is rejected',async t=>{const {call}=await host(t);await call('/settings',{serviceUrl:url,model:'old',key:'SYNTHETIC-ONLY',remember:false});let release,entered;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);t.mock.method(globalThis,'fetch',async()=>{entered();await gate;return response(success)});const pending=call('/settings/check',{});await started;try{assert.equal((await call('/settings/check',{})).body.error,'MODEL_CHECK_BUSY');await call('/settings',{serviceUrl:url,model:'new',remember:false})}finally{release()}assert.equal((await pending).body.error,'MODEL_CONFIGURATION_CHANGED');const state=(await call('/state')).body;assert.equal(state.settings.model,'new');assert.equal(state.settings.connection.status,'not_checked')});
test('source material retains actual filesystem case',async t=>{const root=await mkdtemp(join(tmpdir(),'CangJie-MixedCase-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(join(root,'Summary.md'),'Synthetic facts');const request={projectId:'fixture',root,serviceUrl:url,entries:[{path:'Summary.md',contentType:'summary'}]},consent=confirmDisclosure(await disclose(request),true);assert.equal((await filterContext(request,consent,url,[])).files[0].content,'Synthetic facts')});
test('folder selection returns a literal path and cancel returns null',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'cangjie-picker-'));let choice='C:\\项目 目录\\app';
 const h=await startWorkbench({directory,port:0,pickDirectory:async signal=>{assert.ok(signal instanceof AbortSignal);return choice}});
 t.after(async()=>{await h.close();await rm(directory,{recursive:true,force:true})});
 const call=()=>fetch(h.url+'/api/projects/pick-directory',{method:'POST',headers:{authorization:'Bearer '+h.token,'content-type':'application/json'},body:'{}'}).then(r=>r.json());
 assert.deepEqual(await call(),{directory:choice});choice=null;assert.deepEqual(await call(),{directory:null});
});
test('clear during connection check cannot resurrect connected state',async t=>{
 const {call}=await host(t);await call('/settings',{serviceUrl:url,model:'old',key:'SYNTHETIC-ONLY',remember:false});
 let release,entered;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 t.mock.method(globalThis,'fetch',async()=>{entered();await gate;return response(success)});
 const pending=call('/settings/check',{});await started;try{await call('/settings/clear',{})}finally{release()}
 assert.equal((await pending).body.error,'MODEL_CONFIGURATION_CHANGED');const state=(await call('/state')).body;
 assert.equal(state.settings.hasKey,false);assert.equal(state.settings.connection.status,'not_checked');
});
