// Copied into a fresh delivery directory; imports only that delivery's runtime.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {startWorkbench} from '../apps/host/dist/api.js';
const root=process.cwd(),phase=process.argv[2];
let succeeded=false;
assert.ok(createRequire(import.meta.url).resolve('express').startsWith(join(root,'node_modules')),'must use fresh installed dependencies');
const host=await startWorkbench({port:0});
async function api(path,body){
  const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=r.headers.get('content-type')?.includes('application/json')?await r.json():await r.text();
  if(!r.ok)throw new Error(data.error??String(data));return data;
}
async function waitFor(get,done){const until=Date.now()+90000;while(Date.now()<until){const value=await get();if(done(value))return value;await new Promise(r=>setTimeout(r,60));}throw new Error('ACCEPTANCE_TIMEOUT');}
const passwords=['t9-isolated-owner-password','t9-isolated-other-password'];
const accounts=[{actorRef:'owner',username:'alpha',userId:'user-a',role:'user',password:passwords[0]},{actorRef:'other',username:'beta',userId:'user-b',role:'user',password:passwords[1]}];
await mkdir(join(root,'acceptance'),{recursive:true});
try{
  let state=await api('/state');
  if(phase==='probe'){
    assert.equal(state.projects.length,0);assert.equal(state.runs.length,0);assert.equal(state.settings.model,'');assert.equal(state.settings.hasKey,false);
    assert.equal((await fetch(host.url)).status,200);
    const {loadValidationSuite}=await import('../apps/host/dist/validation/reference-runner.js');
    await assert.rejects(loadValidationSuite('save-rule'),/VALIDATION_RESOURCES_REQUIRED/);
    console.log(JSON.stringify({phase,blank:true,ui:true,missingResourcesExplicit:true}));
  }else if(phase==='run'){
    assert.equal(state.projects.length,0);assert.equal(state.runs.length,0);
    await api('/settings',{serviceUrl:process.env.T9_MODEL_URL,model:'deterministic-release-test-only',key:'t9-isolated-model-key',remember:true});
    await api('/settings/check',{});
    const {projectId}=await api('/projects',{directory:join(root,'samples/ticket'),purpose:'T9 synthetic acceptance only',accounts});
    let project=(await api('/state')).projects[0];
    const disclosure=await api(`/projects/${projectId}/disclosure`);
    await api(`/projects/${projectId}/confirm`,{environment:true,environmentHash:project.environmentHash,send:true,scopeHash:disclosure.scopeHash});
    await api(`/projects/${projectId}/candidate`,{ruleId:'save-rule',confirmRule:true});
    project=await waitFor(async()=>(await api('/state')).projects[0],p=>p.candidate?.status==='ready_for_review'||['failed','paused','rejected'].includes(p.candidate?.status));
    assert.equal(project.candidate.status,'ready_for_review',JSON.stringify(project.candidate));
    const metadata={version:'1.0.0',applicable:['T9 isolated synthetic HTTP project'],excluded:['Real production data'],instructions:'Confirm mapping and reset baseline.'};
    const draft=await api(`/projects/${projectId}/review`,{metadata});
    await assert.rejects(api(`/projects/${projectId}/publish`,{scope:draft.draftHash}),/REVIEW_REQUIRED/);
    const {ref}=await api(`/projects/${projectId}/publish`,{scope:draft.draftHash,businessConfirmed:true,technicalReviewed:true,businessConfirmation:'T9 automated fixture, not human review',technicalReviewer:'T9 automated fixture, not formal release'});
    const {runId}=await api(`/projects/${projectId}/run`,{flow:{id:'submit',title:'工单提交'},checks:[{ruleId:'save-rule',confirmed:true,templateRef:ref}]});
    const run=await waitFor(async()=>(await api('/state')).runs.find(r=>r.id===runId),r=>r&&!['preparing','running'].includes(r.status));
    assert.equal(run.status,'completed',JSON.stringify(run.uncovered));assert.ok(run.checks[0].verdicts.every(v=>v.status==='pass'));
    const pkg=await api(`/runs/${runId}/package`),report=await api(`/runs/${runId}/report`);
    for(const secret of [...passwords,'t9-isolated-model-key'])assert.ok(!JSON.stringify({pkg,report}).includes(secret));
    await writeFile(join(root,'acceptance/verification-package.json'),JSON.stringify(pkg,null,2));
    await writeFile(join(root,'acceptance/report.md'),report);
    const {loadId}=await api(`/projects/${projectId}/load`,{sourceRunId:runId,target:{confirmed:true,rate:1,durationSeconds:2,latencyMs:2000,errorRate:0,sustainedSamples:2,ratios:{'save-rule':100}}});
    const load=await waitFor(()=>api(`/loads/${loadId}`),r=>['completed','blocked','stopped'].includes(r.status));
    assert.equal(load.verdict,'pass',JSON.stringify({status:load.status,reason:load.reason,generator:load.generator}));
    await writeFile(join(root,'acceptance/load.json'),JSON.stringify(load,null,2));
    await writeFile(join(root,'acceptance/load.md'),await api(`/loads/${loadId}/report`));
    await writeFile(join(root,'acceptance/session.json'),JSON.stringify({projectId,runId,loadId,ref}));
    console.log(JSON.stringify({phase,projectId,runId,loadId,candidate:project.candidate.status,load:load.verdict,formalHumanReview:false,realModel:false}));
  }else if(phase==='replay'){
    const {projectId,runId,loadId}=JSON.parse(await readFile(join(root,'acceptance/session.json'),'utf8'));
    assert.ok(state.settings.remembered);await api('/settings/check',{});
    await api('/settings/clear',{});await assert.rejects(api('/settings/check',{}),/MODEL_KEY_REQUIRED/);
    assert.ok(state.projects[0].accounts.every(a=>!a.hasPassword),'passwords must be re-entered after process restart');
    await api('/projects',{id:projectId,directory:join(root,'samples/ticket'),accounts});
    const pkg=JSON.parse(await readFile(join(root,'acceptance/verification-package.json'),'utf8'));
    const before=JSON.stringify(await api(`/runs/${runId}`));
    const next=await api(`/projects/${projectId}/replay`,{package:pkg});
    const run=await waitFor(async()=>(await api('/state')).runs.find(r=>r.id===next.runId),r=>r&&!['preparing','running'].includes(r.status));
    assert.equal(run.status,'completed',JSON.stringify(run.uncovered));assert.equal(run.parentRunId,runId);assert.notEqual(run.id,runId);
    assert.ok(run.checks[0].verdicts.every(v=>v.status==='pass'));assert.equal(JSON.stringify(await api(`/runs/${runId}`)),before);
    assert.equal((await api(`/loads/${loadId}`)).verdict,'pass');
    await writeFile(join(root,'acceptance/replay.json'),JSON.stringify(run,null,2));
    console.log(JSON.stringify({phase,runId:run.id,parentRunId:runId,rememberReadClear:true,replayWithoutModel:true,oldEvidenceUnchanged:true}));
  }
  succeeded=true;
}finally{try{if(phase==='replay'||!succeeded)await api('/settings/clear',{});}finally{await host.close();}}
