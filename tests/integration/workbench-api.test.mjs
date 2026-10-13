import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
test('local workbench API guards mutations and preserves real empty state',async t=>{
  assert.ok(existsSync('apps/host/dist/api.js'),'T6 workbench API must exist');
  const {startWorkbench}=await import('../../apps/host/dist/api.js');
  const server=await startWorkbench({directory:join(process.cwd(),'.local-data/workbench-tests',randomUUID()),port:0});t.after(()=>server.close());
  const session=await(await fetch(server.url+'/api/session')).json();assert.ok(session.token);
  assert.equal((await fetch(server.url+'/api/state')).status,401);
  const state=await(await fetch(server.url+'/api/state',{headers:{authorization:`Bearer ${session.token}`}})).json();assert.deepEqual(state.runs,[]);assert.equal(state.settings.model,'');
  assert.equal((await fetch(server.url+'/api/settings',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${session.token}`,origin:'https://untrusted.example'},body:'{}'})).status,403);
  const bad=await fetch(server.url+'/api/projects',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${session.token}`},body:JSON.stringify({directory:'missing-project',purpose:'test'})});assert.notEqual(bad.status,200);
  const after=await(await fetch(server.url+'/api/state',{headers:{authorization:`Bearer ${session.token}`}})).json();assert.equal(after.projects.length,0);
});
test('scope changes retain project secrets; analysis budget survives retries',{timeout:30000},async t=>{
  const {startWorkbench}=await import('../../apps/host/dist/api.js');let calls=0;
  const provider=createServer(async(req,res)=>{for await(const c of req){}calls++;res.writeHead(200,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({flow:{id:'submit',title:'提交'},pendingRules:[],mappingProposals:[],matchReasons:[]})}}],usage:{total_tokens:20}}));});await new Promise(r=>provider.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>provider.close(r)));
  const host=await startWorkbench({directory:join(process.cwd(),'.local-data/workbench-tests',randomUUID()),port:0});t.after(()=>host.close());
  const token=(await(await fetch(host.url+'/api/session')).json()).token;
  const request=async(path,body)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;};
  await request('/settings',{serviceUrl:`http://127.0.0.1:${provider.address().port}`,model:'fixture-proposal',key:'synthetic-api-model',remember:false});
  const created=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),purpose:'persist me',accounts:[{actorRef:'owner',username:'alpha',userId:'user-a',role:'user',password:'synthetic-api-owner'},{actorRef:'other',username:'beta',userId:'user-b',role:'user',password:'synthetic-api-other'}]});
  const id=created.projectId;let p=(await request('/state')).projects[0];const disclosure=await request(`/projects/${id}/disclosure`);await request(`/projects/${id}/confirm`,{environment:true,environmentHash:p.environmentHash,send:true,scopeHash:disclosure.scopeHash});
  await request(`/projects/${id}/scope`,{entries:[{path:'verification.json',contentType:'summary'},{path:'package.json',contentType:'summary'}]});p=(await request('/state')).projects[0];assert.equal(p.consent,undefined);assert.equal(p.environmentConfirmed,true);assert.equal(p.purpose,'persist me');assert.ok(p.accounts.every(a=>a.hasPassword));
  await request(`/projects/${id}/analyze`,{});
  const wait=async()=>{for(let i=0;i<80;i++){const p=(await request('/state')).projects[0];if(p.analysis?.status!=='running')return p.analysis;await new Promise(r=>setTimeout(r,30));}throw new Error('analysis timeout');};
  assert.equal((await wait()).code,'SENDING_NOT_CONFIRMED');assert.equal(calls,0);
  const next=await request(`/projects/${id}/disclosure`);await request(`/projects/${id}/confirm`,{send:true,scopeHash:next.scopeHash});
  for(let i=0;i<9;i++){await request(`/projects/${id}/analyze`,{});await wait();}
  assert.equal(calls,8,'Repeated analysis must not reset the finite call budget');assert.equal((await wait()).code,'BUDGET_EXHAUSTED');
});

test('recovered analysis keeps reservations and changed source needs fresh environment confirmation',async t=>{
  const {startWorkbench}=await import('../../apps/host/dist/api.js');
  const directory=join(process.cwd(),'.local-data/workbench-tests',randomUUID()),source=join(directory,'source');await cp('samples/ticket',source,{recursive:true});
  let host=await startWorkbench({directory,port:0});t.after(()=>host.close());
  const request=async(path,body)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;};
  const created=await request('/projects',{directory:source,accounts:[{actorRef:'owner',username:'alpha',userId:'user-a',role:'user'},{actorRef:'other',username:'beta',userId:'user-b',role:'user'}]});
  let p=(await request('/state')).projects[0];await request(`/projects/${p.id}/confirm`,{environment:true,environmentHash:p.environmentHash});
  await writeFile(join(source,'src/server.ts'),(await readFile(join(source,'src/server.ts'),'utf8'))+'\n// changed after confirmation\n');
  await assert.rejects(request(`/projects/${p.id}/confirm`,{environment:true,environmentHash:p.environmentHash}),/CONDITIONS_CHANGED_RECONNECT_REQUIRED/);
  await assert.rejects(request(`/projects/${p.id}/candidate`,{ruleId:'save-rule',confirmRule:true}),/CONDITIONS_CHANGED_RECONNECT_REQUIRED/);
  await host.close();const saved=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));saved.projects[0].analysis={status:'running',environmentHash:p.environmentHash,budget:{calls:3,tokens:18000,startedAt:Date.now()}};await writeFile(join(directory,'state.json'),JSON.stringify(saved));
  host=await startWorkbench({directory,port:0});p=(await request('/state')).projects[0];assert.equal(p.analysis.status,'paused');assert.equal(p.analysis.code,'INTERRUPTED_MODEL_CALL');assert.equal(p.analysis.budget.calls,3);
  await request('/projects',{id:created.projectId,directory:source});p=(await request('/state')).projects[0];assert.equal(p.environmentConfirmed,false);assert.equal(p.analysis.budget.calls,3);
  await request(`/projects/${p.id}/confirm`,{environment:true,environmentHash:p.environmentHash});await request(`/projects/${p.id}/analyze`,{});for(let i=0;i<40;i++){p=(await request('/state')).projects[0];if(p.analysis.status==='paused')break;await new Promise(r=>setTimeout(r,20));}assert.equal(p.analysis.budget.calls,0);assert.equal(p.analysis.code,'MODEL_REQUIRED');const after=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));assert.equal(after.projects[0].analysisHistory[0].budget.calls,3);
});
