import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setupDiscovery,action,read,overview} from '../support/discovery.mjs';
import {startWorkbench} from '../../apps/host/dist/api.js';
async function hostFor(t,respond){
  const x=await setupDiscovery(t,respond),directory=join(x.directory,'host');let host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  t.after(()=>host.close());
  const request=async(path,body,expected=200,token=host.token)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await r.json();assert.equal(r.status,expected,JSON.stringify(result));return result};
  await request('/settings',{...x.config,key:'synthetic-api-model-key',remember:false});
  return {...x,get host(){return host},request,async restart(){const port=Number(new URL(host.url).port);await host.close();host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port});},async wait(id){for(let i=0;i<150;i++){const s=await request('/discovery/'+id);if(!['draft','running'].includes(s.status))return s;await new Promise(r=>setTimeout(r,50))}throw new Error('analysis timed out')}};
}
async function start(x,p,requestId=crypto.randomUUID()){
  return x.request(`/projects/${p.id}/discovery`,{confirmed:true,scopeHash:p.scope.scopeHash,expectedRevision:p.revision,requestId},202);
}
test('source-only import needs no run configuration and analysis APIs retain session authentication',async t=>{
  const x=await hostFor(t,()=>({kind:'insufficient',unresolved:['需要更多资料'],limitations:[]}));
  const p=await x.request('/source-projects',{directory:x.root},201);assert.ok(p.id&&p.snapshot.files.length);assert.equal(x.requests.length,0);
  const state=await x.request('/state');assert.equal(state.projects.find(v=>v.id===p.id).sourceOnly,true);
  await x.request('/source-projects',{directory:x.root},401,'wrong-token');
  await x.request(`/projects/${p.id}/discovery`,{confirmed:false,scopeHash:p.scope.scopeHash,expectedRevision:p.revision,requestId:crypto.randomUUID()},400);assert.equal(x.requests.length,0);
  const accepted=await start(x,p),done=await x.wait(accepted.id);assert.equal(done.status,'partial',JSON.stringify(done));assert.ok(done.unresolved.includes('需要更多资料'));
  for(let i=0;i<3;i++)await x.request('/discovery/'+accepted.id);assert.equal(x.requests.length,1);
});
test('cited project-specific recommendations remain draft suggestions, never catalog rules or execution verdicts',async t=>{
  const x=await hostFor(t,(p,n)=>n===1?action([read('src/routes.ts',1,5),read('src/orders.ts',1,9),read('src/storage.ts',1,2),read('README.md',1,2)]):overview(p.files));
  const p=await x.request('/source-projects',{directory:x.root},201),accepted=await start(x,p),done=await x.wait(accepted.id);
  assert.equal(done.status,'completed');assert.equal(done.result.suggestions[0].id,'cancel-order-once');assert.equal(done.result.suggestions[0].status,'suggestion');
  const excerpt=await x.request(`/discovery/${done.id}/excerpts/0`);assert.equal(excerpt.valid,true);assert.ok(excerpt.text.includes('cancelOrder'));
  const selected=await x.request(`/discovery/${done.id}/selection`,{revision:done.revision,suggestionId:'cancel-order-once'});assert.equal(selected.selectedSuggestionId,'cancel-order-once');
  const conflict=await x.request(`/discovery/${done.id}/selection`,{revision:done.revision,suggestionId:'cancel-order-once'},400);assert.equal(conflict.error,'ANALYSIS_CONFLICT');
  const state=await x.request('/state');assert.equal(state.rules.length,4);assert.equal(state.runs.length,0);assert.ok(!state.rules.some(r=>r.id==='cancel-order-once'));
  await writeFile(join(x.root,'src/routes.ts'),'export const changed=1;');assert.equal((await x.request('/discovery/'+done.id)).status,'stale');assert.equal((await x.request(`/discovery/${done.id}/excerpts/0`)).valid,false);
});
test('duplicate request IDs, scope conflicts and host restart do not automatically dispatch new model calls',async t=>{
  const x=await hostFor(t,()=>({kind:'insufficient',unresolved:['暂缺权限资料'],limitations:[]}));
  const p=await x.request('/source-projects',{directory:x.root},201),requestId=crypto.randomUUID(),accepted=await start(x,p,requestId);
  const again=await start(x,p,requestId);assert.equal(again.id,accepted.id);await x.wait(accepted.id);assert.equal(x.requests.length,1);
  await x.restart();assert.equal((await x.request('/discovery/'+accepted.id)).status,'partial');assert.equal(x.requests.length,1);
  const old=await x.request(`/projects/${p.id}/discovery-scope`,{expectedRevision:0,allowedPaths:['src'],excludedPaths:[],includeProjectTests:false},400);assert.equal(old.error,'ANALYSIS_CONFLICT');
});
test('later runtime import preserves explicitly scoped business sources and project identity',async t=>{
  const x=await hostFor(t,(p,n)=>n===1?action([read('src/orders.ts',1,9)]):overview(p.files));
  const p=await x.request('/source-projects',{directory:x.root,allowedPaths:['src','README.md']},201),accepted=await start(x,p),done=await x.wait(accepted.id);
  for(const name of ['verification.json','package.json'])await cp(join('samples/ticket',name),join(x.root,name));
  const imported=await x.request('/projects',{id:p.id,directory:x.root,accountMode:'automatic'});assert.equal(imported.projectId,p.id);
  const state=await x.request('/state');assert.equal(state.projects.filter(v=>v.id===p.id).length,1);assert.equal(state.projects.find(v=>v.id===p.id).sourceOnly,false);
  assert.equal((await x.request('/discovery/'+done.id)).referencesValid,true);
});
test('resume rejects changed model configuration visibly before accepting asynchronous work',async t=>{
  const x=await hostFor(t,()=>({kind:'insufficient',unresolved:['待补充权限依据'],limitations:[]}));
  const p=await x.request('/source-projects',{directory:x.root},201),done=await x.wait((await start(x,p)).id);
  await x.request('/settings',{...x.config,model:'changed-model',key:'synthetic-api-model-key',remember:false});
  const rejected=await x.request(`/discovery/${done.id}/resume`,{revision:done.revision},400);assert.equal(rejected.error,'SERVICE_CONFIRMATION_REQUIRED');
  const after=await x.request('/discovery/'+done.id);assert.deepEqual(after.budget,done.budget);assert.equal(x.requests.length,1);
});
test('different source fixtures generate different business and check suggestions through the same pipeline',async t=>{
  const x=await hostFor(t,p=>{if(!p.files.length)return action(p.index.some(f=>f.path==='src/memberships.ts')?[read('src/memberships.ts',1,5)]:[read('src/orders.ts',1,9)]);const result=overview(p.files,p.index.some(f=>f.path==='src/memberships.ts')?'续费会员有效期':'取消订单');if(result.result.summary==='续费会员有效期'){result.result.objects=['会员','到期时间'];result.result.suggestions[0].id='membership-expiry';result.result.suggestions[0].flow='续费会员有效期';result.result.suggestions[0].facts[0].text='实现按天数增加expiresAt';result.result.suggestions[0].expectations[0].text='相同续费请求是否只能延长一次仍待确认'}return result});
  const p=await x.request('/source-projects',{directory:x.root},201),first=await x.wait((await start(x,p)).id);
  const secondRoot=join(x.directory,'memberships');await cp('tests/fixtures/discovery-memberships',secondRoot,{recursive:true});
  const second=await x.request('/source-projects',{directory:secondRoot},201),other=await x.wait((await start(x,second)).id);
  assert.notEqual(first.result.summary,other.result.summary);assert.notEqual(first.result.suggestions[0].id,other.result.suggestions[0].id);assert.equal(other.result.suggestions[0].status,'suggestion');
});

test('full-file mode sends every previewed whole file on the first call and binds prompt consent',async t=>{
 const x=await hostFor(t,p=>{const result=overview(p.files);Object.assign(result.result.suggestions[0],{preconditions:['订单未付款'],exceptions:['权限待确认'],stateChanges:['取消后释放库存']});return result;});
 const p=await x.request('/source-projects',{directory:x.root},201);
 const preview=await x.request('/projects/'+p.id+'/discovery-input',{expectedRevision:p.revision,mode:'prompt',prompt:'识别取消订单业务'});
 assert.equal(preview.reads.length,p.snapshot.files.length);
 const input={mode:'prompt',prompt:'识别取消订单业务',manifestHash:preview.manifestHash};
 const rejected=await x.request('/projects/'+p.id+'/discovery',{confirmed:true,scopeHash:p.scope.scopeHash,expectedRevision:p.revision,requestId:crypto.randomUUID(),input:{...input,prompt:'未确认的新提示词'}},400);
 assert.equal(rejected.error,'SCOPE_CONFIRMATION_REQUIRED');assert.equal(x.requests.length,0);
 const accepted=await x.request('/projects/'+p.id+'/discovery',{confirmed:true,scopeHash:p.scope.scopeHash,expectedRevision:p.revision,requestId:crypto.randomUUID(),input},202);
 const done=await x.wait(accepted.id);
 assert.equal(done.status,'completed',JSON.stringify(done));
 assert.equal(x.requests.length,1);
 assert.equal(done.reads.length,preview.reads.length);
 for(const read of done.reads){assert.equal(read.kind,'full-file');assert.equal(read.ref.startLine,1);const shown=await x.request('/discovery/'+done.id+'/excerpts/'+done.reads.indexOf(read));assert.equal(shown.valid,true);}
});

test('journey goals persist with revision conflicts and repair remains opt-in',async t=>{
 const x=await hostFor(t,()=>({kind:'insufficient',unresolved:[],limitations:[]}));
 const p=await x.request('/source-projects',{directory:x.root},201),path='/projects/'+p.id+'/journey';
 const initial=await x.request(path);assert.equal(initial.repairEnabled,false);assert.equal(initial.goal,'correctness');
 const input={...initial,goal:'both',rate:'2',durationSeconds:'10',analysisMode:'prompt',analysisPrompt:'人工指定取消订单',businessNotes:'核对取消后的库存',lastStep:3,skipAnalysis:false};
 const viewed=await x.request(path,{...initial,lastStep:4,viewOnly:true});assert.equal(viewed.revision,0);
 const next=await x.request(path,input);assert.equal(next.revision,1);assert.equal(next.lastStep,4);
 const conflict=await x.request(path,input,400);assert.equal(conflict.error,'JOURNEY_CONFLICT');
 await x.restart();assert.deepEqual(await x.request(path),next);assert.equal(x.requests.length,0);
 const invalid=await x.request(path,{...next,durationSeconds:'301'},400);assert.equal(invalid.error,'INVALID_JOURNEY');
 const enabled=await x.request(path,{...next,repairEnabled:true});assert.equal(enabled.repairEnabled,true);
});
