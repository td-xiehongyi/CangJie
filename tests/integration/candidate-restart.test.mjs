import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {startWorkbench} from '../../apps/host/dist/api.js';
import {CandidateTask} from '../../apps/host/dist/model/candidate.js';
import {digest} from '../../apps/host/dist/projects/inspect.js';

test('explicit replacement creates one finite new task and keeps exhausted history immutable',async t=>{
 await mkdir('output/candidate-recovery-20261016',{recursive:true});const directory=await mkdtemp(join(process.cwd(),'output/candidate-recovery-20261016/api-')),ids=[];
 mock.method(CandidateTask.prototype,'run',async function(){return this.snapshot()});t.after(()=>mock.restoreAll());
 const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 t.after(async()=>{await host.close();await rm(directory,{recursive:true,force:true});for(const id of ids)await rm(join(process.cwd(),'.local-data/candidates',id),{recursive:true,force:true})});
 const request=async(path,body,status=200)=>{const response=await fetch(host.url+'/api'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+host.token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result};
 const {projectId}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'}),p=(await request('/state')).projects[0];await request(`/projects/${projectId}/confirm`,{environment:true,environmentHash:p.environmentHash});
 const path=`/projects/${projectId}/candidate`,body={ruleId:'save-rule',confirmRule:true};const first=await request(path,body,202);ids.push(first.candidateId);
 const file=join('.local-data/candidates',first.candidateId,'state.json'),saved=JSON.parse(await readFile(file,'utf8')),r=saved.record;Object.assign(r,{status:'rejected',phase:'stopped',code:'REVISION_LIMIT_REACHED',revisionIndex:2,budget:{calls:3,tokens:10000,startedAt:Date.now()-700000}});await writeFile(file,JSON.stringify({record:r,hash:digest(r)}));const original=await readFile(file,'utf8');
 assert.equal((await request(path,body,400)).error,'CANDIDATE_RESTART_REQUIRED');
 assert.equal((await request(path,{...body,restartCandidateId:'wrong-task'},400)).error,'STALE_CANDIDATE');
 const next=await request(path,{...body,restartCandidateId:first.candidateId},202);ids.push(next.candidateId);assert.notEqual(next.candidateId,first.candidateId);
 assert.equal(await readFile(file,'utf8'),original);const fresh=JSON.parse(await readFile(join('.local-data/candidates',next.candidateId,'state.json'),'utf8')).record;assert.equal(fresh.budget.calls,0);assert.equal(fresh.revisionIndex,0);
 const stored=JSON.parse(await readFile(join(directory,'state.json'),'utf8')).projects[0];assert.ok(stored.candidateHistory.includes(first.candidateId));assert.equal(stored.candidateIds['save-rule'],next.candidateId);
 assert.equal((await request(path,{...body,restartCandidateId:first.candidateId},400)).error,'STALE_CANDIDATE');
 assert.equal((await request(path,{...body,restartCandidateId:next.candidateId},400)).error,'CANDIDATE_RESTART_NOT_ALLOWED');
 assert.equal((await request('/state')).runs.length,0);
});
