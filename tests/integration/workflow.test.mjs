import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {startWorkbench} from '../../apps/host/dist/api.js';

test('workflow drafts survive restart, reject stale writes and invalidate changed conditions', {timeout:60000}, async t=>{
  const directory=join(process.cwd(),'.local-data/workflow-tests',randomUUID());
  let host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  t.after(()=>host.close());
  async function request(path,body){const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();if(!r.ok)throw Error(v.error);return v;}
  const {projectId}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'});
  let state=await request('/state'),p=state.projects[0],rule=state.rules.find(r=>r.id==='save-rule');
  assert.equal(p.workflow.revision,0);
  const body={revision:0,flow:'submit',choices:{'save-rule':{enabled:true,confirmed:true,ruleHash:rule.hash,environmentHash:p.environmentHash}}};
  const saved=await request(`/projects/${projectId}/workflow`,body);
  assert.equal(saved.revision,1);
  await assert.rejects(request(`/projects/${projectId}/workflow`,body),/WORKFLOW_CONFLICT/);
  await assert.rejects(request(`/projects/${projectId}/workflow`,{...body,revision:1,key:'should-not-persist'}),/INVALID_WORKFLOW/);
  await assert.rejects(request(`/projects/${projectId}/workflow`,{...body,revision:1,choices:{...body.choices,evil:{enabled:true,password:'secret'}}}),/INVALID_WORKFLOW/);
  await host.close();host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  p=(await request('/state')).projects[0];
  assert.equal(p.workflow.flows.submit['save-rule'].enabled,true);
  assert.equal(p.workflow.flows.submit['save-rule'].confirmed,true);
  await request('/projects',{id:projectId,directory:p.directory,accountMode:'automatic',count:3});
  p=(await request('/state')).projects[0];
  assert.equal(p.workflow.flows.submit['save-rule'].enabled,true);
  assert.equal(p.workflow.flows.submit['save-rule'].confirmed,false);
  const draft=JSON.parse(await readFile(join(directory,'state.json'),'utf8')).projects[0].workflow;
  assert.ok(!JSON.stringify(draft).includes('should-not-persist'));
});

test('environment preparation records actual success separately from confirmation', {timeout:60000}, async t=>{
  const directory=join(process.cwd(),'.local-data/workflow-tests',randomUUID());
  let host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});t.after(()=>host.close());
  async function request(path,body){const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();assert.ok(r.ok,JSON.stringify(v));return v;}
  const {projectId}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'});
  let p=(await request('/state')).projects[0];
  await request(`/projects/${projectId}/confirm`,{environment:true,environmentHash:p.environmentHash});
  p=(await request('/state')).projects[0];assert.equal(p.preparation,undefined);
  await request(`/projects/${projectId}/prepare`,{});
  p=(await request('/state')).projects[0];assert.equal(p.preparation.status,'ready');assert.equal(p.preparation.verifiedAccounts,2);assert.ok(p.preparation.completedAt);assert.equal(p.preparation.environmentHash,p.environmentHash);
  await host.close();host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  p=(await request('/state')).projects[0];assert.equal(p.preparation.status,'ready');assert.equal(p.preparation.sessionCurrent,false);
  await request('/projects',{id:projectId,directory:p.directory,accountMode:'automatic',count:3});
  p=(await request('/state')).projects[0];assert.notEqual(p.preparation.environmentHash,p.environmentHash);
});

test('retired versions keep their identity but lose confirmation; changed rules do not inherit approval',async()=>{
  const {writeWorkflow,reconcileWorkflow,emptyWorkflow}=await import('../../apps/host/dist/projects/workflow.js');
  const environmentHash='a'.repeat(64),ruleHash='b'.repeat(64),version='c'.repeat(64),hashes=new Map([['save-rule',ruleHash]]),versions=new Set([`save-rule:${version}`]);
  const draft=writeWorkflow(emptyWorkflow(),{revision:0,flow:'submit',choices:{'save-rule':{enabled:true,confirmed:true,environmentHash,ruleHash,version}}},hashes,environmentHash,versions);
  assert.equal(draft.flows.submit['save-rule'].confirmed,true);
  const retired=reconcileWorkflow(draft,hashes,environmentHash,new Set());
  assert.equal(retired.flows.submit['save-rule'].version,version);assert.equal(retired.flows.submit['save-rule'].confirmed,false);assert.equal(retired.revision,2);
  assert.equal(reconcileWorkflow(draft,new Map([['save-rule','d'.repeat(64)]]),environmentHash,versions).flows.submit['save-rule'].confirmed,false);
});

test('failed preparations and interrupted old state are truthful after restart', {timeout:60000},async t=>{
  const directory=join(process.cwd(),'.local-data/workflow-tests',randomUUID());
  let host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});t.after(()=>host.close());
  const request=async(path,body)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {ok:r.ok,value:await r.json()};};
  const accounts=['owner','other'].map(actorRef=>({actorRef,username:actorRef,userId:actorRef,role:'user'}));
  const {value:{projectId}}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accounts});
  let p=(await request('/state')).value.projects[0];await request(`/projects/${projectId}/confirm`,{environment:true,environmentHash:p.environmentHash});
  assert.equal((await request(`/projects/${projectId}/prepare`,{})).ok,false);
  p=(await request('/state')).value.projects[0];assert.equal(p.preparation.status,'failed');assert.ok(p.preparation.code);assert.equal(p.preparation.sessionCurrent,false);
  await host.close();const saved=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));saved.projects[0].preparation.status='preparing';await writeFile(join(directory,'state.json'),JSON.stringify(saved));
  host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  p=(await request('/state')).value.projects[0];assert.equal(p.preparation.status,'interrupted');
});

test('folder picker is authenticated, rejects cross-origin requests, serializes dialogs and supports cancellation',async t=>{
  const directory=join(process.cwd(),'.local-data/workflow-tests',randomUUID());let resolvePicker;let calls=0;
  const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0,pickDirectory:()=>{calls++;return new Promise(r=>resolvePicker=r);}});t.after(()=>host.close());
  const post=(headers={})=>fetch(host.url+'/api/projects/pick-directory',{method:'POST',headers:{'content-type':'application/json',...headers},body:'{}'});
  assert.equal((await post()).status,401);assert.equal((await post({authorization:`Bearer ${host.token}`,origin:'https://example.com'})).status,403);assert.equal(calls,0);
  const pending=post({authorization:`Bearer ${host.token}`});while(!resolvePicker)await new Promise(r=>setTimeout(r,10));
  assert.equal((await (await post({authorization:`Bearer ${host.token}`})).json()).error,'FOLDER_PICKER_BUSY');resolvePicker(null);
  assert.deepEqual(await (await pending).json(),{directory:null});assert.equal(calls,1);
});

test('closing a host cancels its pending directory chooser',async()=>{
  const directory=join(process.cwd(),'.local-data/workflow-tests',randomUUID());let receivedSignal,started=false;
  const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0,pickDirectory:signal=>{receivedSignal=signal;started=true;return new Promise(resolve=>signal?.addEventListener('abort',()=>resolve(null),{once:true}));}});
  const pending=fetch(host.url+'/api/projects/pick-directory',{method:'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:'{}'}).catch(()=>{});
  while(!started)await new Promise(r=>setTimeout(r,10));await host.close();await pending;assert.equal(receivedSignal?.aborted,true);
});

test('a draft saving during reconnection writes the current project rather than a detached object',async t=>{
  const directory=join(process.cwd(),'.local-data/workflow-tests',randomUUID()),host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});t.after(()=>host.close());
  const request=async(path,body)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();assert.ok(r.ok,JSON.stringify(v));return v;};
  const {projectId}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'}),state=await request('/state'),p=state.projects[0],rule=state.rules.find(r=>r.id==='save-rule');
  const original=host.registry.matchReport.bind(host.registry);let release,entered=false;host.registry.matchReport=async(...args)=>{if(!entered){entered=true;await new Promise(r=>release=r);}return original(...args);};
  const saving=request(`/projects/${projectId}/workflow`,{revision:0,flow:'submit',choices:{'save-rule':{enabled:true,confirmed:true,ruleHash:rule.hash,environmentHash:p.environmentHash}}});
  while(!entered)await new Promise(r=>setTimeout(r,5));await request('/projects',{id:projectId,directory:p.directory,accountMode:'automatic',count:3});release();const result=await saving;host.registry.matchReport=original;
  const current=(await request('/state')).projects[0];assert.equal(current.workflow.revision,result.revision);assert.equal(current.workflow.flows.submit['save-rule'].enabled,true);assert.equal(current.workflow.flows.submit['save-rule'].confirmed,false);
});

test('review routing preserves materials for an owned inactive candidate without changing the active one',async t=>{
  const directory=join(process.cwd(),'.local-data/workflow-tests',randomUUID());let host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});t.after(()=>host.close());
  const request=async(path,body)=>{const r=await fetch(host.url+'/api'+path,{method:'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:JSON.stringify(body)});return {ok:r.ok,value:await r.json()};};
  const {value:{projectId}}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'});await host.close();
  const stateFile=join(directory,'state.json'),saved=JSON.parse(await readFile(stateFile,'utf8')),oldId=randomUUID(),activeId=randomUUID(),candidateHash='a'.repeat(64);saved.projects[0].candidateId=activeId;saved.projects[0].candidateIds={'save-rule':oldId,'duplicate-rule':activeId};await writeFile(stateFile,JSON.stringify(saved));
  host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  // Routing-only fixture: real qualification/publishing remains covered by candidate/review suites.
  const {CandidateTask}=await import('../../apps/host/dist/model/candidate.js');
  const originalOpen=CandidateTask.open,rule={source:'reference:save-rule'};
  CandidateTask.open=async id=>{assert.equal(id,oldId);return {snapshot:()=>({input:{rule}})};};
  t.after(()=>{CandidateTask.open=originalOpen;});
  let routed;host.registry.stageCandidate=async(taskId,metadata)=>{routed=taskId;return {taskId,metadata,rule,candidateHash,draftHash:'b'.repeat(64),validation:{recordRef:'routing-fixture'}};};
  const metadata={version:'1.0.0',applicable:['local'],excluded:['other'],instructions:'retained input'};
  assert.equal((await request(`/projects/${projectId}/review`,{candidateId:oldId,candidateHash,metadata})).ok,true);assert.equal(routed,oldId);
  const p=JSON.parse(await readFile(stateFile,'utf8')).projects[0];assert.equal(p.candidateId,activeId);assert.equal(p.reviewDrafts[oldId].metadata.instructions,'retained input');assert.equal(p.draft,undefined);
  routed=undefined;assert.equal((await request(`/projects/${projectId}/review`,{candidateId:randomUUID(),candidateHash,metadata})).value.error,'STALE_CANDIDATE');assert.equal(routed,undefined);
});

test('ready records are not exposed as reviewable until the candidate job finishes',async()=>{
  const {CandidateTask}=await import('../../apps/host/dist/model/candidate.js');
  const directory=join(process.cwd(),'.local-data/workflow-tests',randomUUID()),host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0}),original=CandidateTask.prototype.run;
  let release,finishing=false;
  // Exercise the persisted-ready/job-still-open interval without running a model.
  CandidateTask.prototype.run=async function(){this.data.status='ready_for_review';await this.save();finishing=true;await new Promise(r=>release=r);return this.snapshot();};
  const request=async(path,body)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();assert.ok(r.ok,JSON.stringify(v));return v;};
  try{
    const {projectId}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'}),p=(await request('/state')).projects[0];await request(`/projects/${projectId}/confirm`,{environment:true,environmentHash:p.environmentHash});await request(`/projects/${projectId}/candidate`,{ruleId:'save-rule',confirmRule:true});
    while(!finishing)await new Promise(r=>setTimeout(r,5));assert.equal((await request('/state')).projects[0].candidate.status,'validating');
    release();for(let i=0;i<50;i++){if((await request('/state')).projects[0].candidate.status==='ready_for_review')return;await new Promise(r=>setTimeout(r,10));}assert.fail('candidate did not become reviewable after the job closed');
  }finally{release?.();CandidateTask.prototype.run=original;await host.close();}
});
