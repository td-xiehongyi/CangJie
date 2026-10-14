import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
// Only the OS mutex is substituted. Real store persistence, provider, API,
// source validation and service code run unchanged. This is not Windows QA.
const held=new Set();let onRelease;
mock.module('../../apps/host/dist/model/task-lock.js',{namedExports:{async acquireTask(id){
  if(held.has(id))throw new Error('CANDIDATE_BUSY');held.add(id);
  return async()=>{try{if(onRelease)await onRelease(id)}finally{held.delete(id)}};
}}});
const {setupDiscovery,action,read,overview}=await import('../support/discovery.mjs');
const {startWorkbench}=await import('../../apps/host/dist/api.js');
const {DiscoveryService}=await import('../../apps/host/dist/discovery/service.js');
const gate=()=>{let release;const promise=new Promise(r=>release=r);return {promise,release}};
const insufficient={kind:'insufficient',unresolved:['Missing permission evidence'],limitations:[]};

test('a read that captured running before completion cannot report an orphaned pause',async t=>{
  const response=gate(),started=gate(),captured=gate(),finishRead=gate();
  const x=await setupDiscovery(t,async()=>{started.release();await response.promise;return insufficient});
  const initial=await x.create(),work=x.service.runDiscovery(initial.id,initial.revision);await started.promise;
  const get=x.store.get.bind(x.store);let intercept=true;
  x.store.get=async id=>{const record=await get(id);if(intercept){intercept=false;assert.equal(record.session.status,'running');captured.release();await finishRead.promise}return record};
  const reading=x.service.getDiscovery(initial.id);await captured.promise;response.release();
  const done=await work;assert.equal(done.status,'partial');assert.equal(x.service.active(),false);
  finishRead.release();const observed=await reading;
  assert.equal(observed.status,'partial');assert.equal(observed.revision,done.revision);
  assert.ok(!observed.unresolved.includes('INTERRUPTED_MODEL_CALL'));
  assert.equal(x.requests.length,1);
});

test('a persisted terminal state stays running until the task mutex is released',async t=>{
  const release=gate(),finalizing=gate();
  const x=await setupDiscovery(t,()=>insufficient),initial=await x.create();
  onRelease=async id=>{if(id===initial.id){finalizing.release();await release.promise}};
  t.after(()=>{onRelease=undefined;release.release()});
  const work=x.service.runDiscovery(initial.id,initial.revision);await finalizing.promise;
  assert.equal((await x.store.get(initial.id)).session.status,'partial');assert.equal(x.service.active(),true);
  const during=await x.service.getDiscovery(initial.id);release.release();const done=await work;
  assert.equal(during.status,'running');assert.equal(done.status,'partial');
  assert.equal((await x.service.getDiscovery(initial.id)).status,'partial');assert.equal(x.service.active(),false);
});

test('API observation of a terminal discovery allows settings and runtime import immediately',async t=>{
  const release=gate(),finalizing=gate(),modelResponse=gate();let analysisId,analysisWork;
  const x=await setupDiscovery(t,async()=>{await modelResponse.promise;return insufficient}),directory=x.directory+'/api';
  const run=DiscoveryService.prototype.runDiscovery;
  t.mock.method(DiscoveryService.prototype,'runDiscovery',function(...args){const work=run.apply(this,args);analysisWork=work;return work});
  const host=await startWorkbench({directory,registryDirectory:directory+'/registry',port:0});t.after(()=>host.close());
  const request=async(path,body,expected=200)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await r.json();assert.equal(r.status,expected,JSON.stringify(value));return value};
  await request('/settings',{...x.config,key:'synthetic-api-model-key',remember:false});
  const project=await request('/source-projects',{directory:x.root},201);
  onRelease=async id=>{if(id===analysisId){finalizing.release();await release.promise}};
  t.after(()=>{onRelease=undefined;release.release()});
  const accepted=await request(`/projects/${project.id}/discovery`,{confirmed:true,scopeHash:project.scope.scopeHash,expectedRevision:project.revision,requestId:crypto.randomUUID()},202);analysisId=accepted.id;
  modelResponse.release();await finalizing.promise;
  try{
  const during=await request('/discovery/'+analysisId);
  const busy=await request('/settings',{...x.config,model:'changed',key:'synthetic-api-model-key',remember:false},during.status==='running'?400:200);
  assert.equal(busy.error,'MODEL_WORK_ACTIVE');assert.equal(during.status,'running');
  release.release();await analysisWork;
  const terminal=await request('/discovery/'+analysisId)
  assert.equal(terminal.status,'partial');
  await request('/settings',{...x.config,model:'changed',key:'synthetic-api-model-key',remember:false});
  const {cp}=await import('node:fs/promises');
  for(const name of ['verification.json','package.json'])await cp('samples/ticket/'+name,x.root+'/'+name);
  assert.equal((await request('/projects',{id:project.id,directory:x.root,accountMode:'automatic'})).projectId,project.id);
  assert.equal(x.requests.length,1);
  }finally{release.release();await analysisWork}
});

test('explicit resume stays running before the initial persisted running checkpoint',async t=>{
  const x=await setupDiscovery(t,()=>insufficient),initial=await x.create();
  const partial=await x.service.runDiscovery(initial.id,initial.revision);
  const captured=gate(),finishRead=gate(),get=x.store.get.bind(x.store);let intercept=true;
  x.store.get=async id=>{const record=await get(id);if(intercept){intercept=false;assert.equal(record.session.status,'partial');captured.release();await finishRead.promise}return record};
  const work=x.service.runDiscovery(initial.id,partial.revision);await captured.promise;
  let observed;try{observed=await x.service.getDiscovery(initial.id)}finally{finishRead.release();await work}
  assert.equal(observed.status,'running');assert.equal(x.requests.length,2);
});

test('idempotent run of a completed discovery returns its terminal state without another request',async t=>{
  const x=await setupDiscovery(t,(p,n)=>n===1?action([read('src/orders.ts',1,9)]):overview(p.files)),initial=await x.create();
  const completed=await x.service.runDiscovery(initial.id,initial.revision);
  const again=await x.service.runDiscovery(initial.id,completed.revision);
  assert.equal(again.status,'completed');assert.equal(again.revision,completed.revision);assert.equal(x.requests.length,2);
});

test('a complete job lifecycle during an initially idle read cannot produce an ABA orphan pause',async t=>{
  const started=gate(),respond=gate(),captured=gate(),finishRead=gate();
  const x=await setupDiscovery(t,async()=>{started.release();await respond.promise;return insufficient}),initial=await x.create();
  const get=x.store.get.bind(x.store);let intercept=true;
  x.store.get=async id=>{if(intercept){intercept=false;await started.promise;const record=await get(id);assert.equal(record.session.status,'running');captured.release();await finishRead.promise;return record}return get(id)};
  assert.equal(x.service.active(),false);const reading=x.service.getDiscovery(initial.id);
  const work=x.service.runDiscovery(initial.id,initial.revision);await captured.promise;
  respond.release();const done=await work;assert.equal(x.service.active(),false);
  finishRead.release();const observed=await reading;
  assert.equal(observed.status,'partial');assert.equal(observed.revision,done.revision);
  assert.ok(!observed.unresolved.includes('INTERRUPTED_MODEL_CALL'));assert.equal(x.requests.length,1);
});
