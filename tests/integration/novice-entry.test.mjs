import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {startWorkbench} from '../../apps/host/dist/api.js';
import {TemplateRegistry} from '../../apps/host/dist/templates/store.js';
import {publishedFixture} from '../support/published.mjs';

async function setup(t,base='output/novice-entry-20261017/api'){
 const directory=resolve(base,randomUUID());
 const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});t.after(()=>host.close());
 const req=async(path,body,status=200,token=host.token)=>{
  const response=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
 };
 return {directory,req};
}
async function fingerprints(directory){
 const rows=[];
 for(const path of await readdir(directory,{recursive:true})){try{rows.push([path,createHash('sha256').update(await readFile(join(directory,path))).digest('hex')]);}catch(e){if(e.code!=='EISDIR'&&e.code!=='EPERM')throw e;}}
 return rows.sort(([a],[b])=>a.localeCompare(b));
}

test('early support is a read-only static assessment and grants no runtime or model consent',async t=>{
 const {directory,req}=await setup(t),p=await req('/source-projects',{directory:resolve('samples/ticket')},201);
 const before=await fingerprints(directory),state=await req('/state');
 const support=await req(`/projects/${p.id}/support`);
 assert.equal(support.status,'compatible');assert.equal(support.projectId,p.id);assert.match(support.sourceHash,/^[a-f0-9]{64}$/);assert.equal(support.gaps.length,0);
 assert.deepEqual(await fingerprints(directory),before);assert.deepEqual(await req('/state'),state);
 assert.equal(state.projects[0].sourceOnly,true);assert.equal(state.runs.length,0);assert.equal(state.projects[0].accounts,undefined);
 await req(`/projects/${p.id}/support`,undefined,401,'invalid-session');
});

test('early support distinguishes missing conditions, unsupported runtime and changed source',async t=>{
 const {directory,req}=await setup(t),missing=join(directory,'missing');await mkdir(missing);await writeFile(join(missing,'package.json'),JSON.stringify({dependencies:{express:'^5.1.0'}}));
 const p=await req('/source-projects',{directory:missing},201),support=await req(`/projects/${p.id}/support`);
 assert.equal(support.status,'needs_configuration');assert.ok(support.gaps.some(g=>g.code==='INITIALIZATION_GAP'));assert.match(support.gapMarkdown,/尚未验证/);
 const source=join(directory,'unsupported');await cp('samples/ticket',source,{recursive:true});
 const q=await req('/source-projects',{directory:source},201);const first=await req(`/projects/${q.id}/support`);assert.equal(first.status,'compatible');
 await writeFile(join(source,'package.json'),JSON.stringify({dependencies:{express:'^4.0.0'}}));
 const changed=await req(`/projects/${q.id}/support`);assert.equal(changed.status,'unsupported');assert.notEqual(changed.sourceHash,first.sourceHash);assert.ok(changed.gaps.some(g=>g.code==='DEPENDENCY_GAP'));
 const state=await req('/state');assert.equal(state.runs.length,0);assert.ok(state.projects.every(p=>p.sourceOnly));
 await req('/projects/not-a-project/support',undefined,400);
});

test('example preparation requires explicit intent and creates independent editable copies without importing or execution',async t=>{
 const {directory,req}=await setup(t),original=await fingerprints(resolve('samples/ticket'));
 await req('/examples/ticket',{},400);await req('/examples/ticket',{confirmed:true},401,'invalid-session');
 const first=await req('/examples/ticket',{confirmed:true},201),second=await req('/examples/ticket',{confirmed:true},201);
 assert.equal(first.kind,'practice');assert.notEqual(first.directory,second.directory);assert.ok(first.directory.startsWith(resolve('practice-projects')));
 assert.match(first.name,/示例/);assert.match(JSON.parse(await readFile(join(first.directory,'verification.json'),'utf8')).name,/示例/);
 assert.equal(await readFile(join(first.directory,'src/server.ts'),'utf8'),await readFile('samples/ticket/src/server.ts','utf8'));
 assert.ok(!(await readdir(first.directory)).some(name=>['node_modules','dist','.local-data'].includes(name)));
 assert.deepEqual(await fingerprints(resolve('samples/ticket')),original);
 const state=await req('/state');assert.equal(state.projects.length,0);assert.equal(state.runs.length,0);
 const p=await req('/source-projects',{directory:first.directory},201);assert.match(p.name,/示例/);assert.equal((await req(`/projects/${p.id}/support`)).status,'compatible');
 await writeFile(join(first.directory,'src/practice-notes.md'),'Only this practice copy changes.');assert.deepEqual(await fingerprints(resolve('samples/ticket')),original);
});

test('a workbench using the default private data-tree shape can import its practice example without relaxing source exclusions',async t=>{
 const {req}=await setup(t,'.local-data/novice-entry-tests');
 const example=await req('/examples/ticket',{confirmed:true},201);
 const p=await req('/source-projects',{directory:example.directory},201);
 assert.match(p.name,/示例/);assert.equal((await req(`/projects/${p.id}/support`)).status,'compatible');
 const rejected=await req('/source-projects',{directory:resolve('.local-data/novice-entry-tests')},400);assert.match(rejected.error,/^SENSITIVE_FILE/);
});

test('a prepared practice copy executes the existing failure-repair-retest loop with original rules and history intact',async t=>{
 const {directory,req}=await setup(t);
 await publishedFixture(directory,new TemplateRegistry(join(directory,'registry')),'packages/contracts/fixtures/save-result.json','save-rule');
 const example=await req('/examples/ticket',{confirmed:true},201),file=join(example.directory,'src/server.ts'),healthy=await readFile(file,'utf8');
 assert.ok(healthy.includes("String(req.body.title??'无标题')"));await writeFile(file,healthy.replace("String(req.body.title??'无标题')","'practice-wrong-title'"));
 const source=await req('/source-projects',{directory:example.directory},201),{projectId}=await req('/projects',{id:source.id,directory:example.directory,accountMode:'automatic'});
 let state=await req('/state'),project=state.projects.find(p=>p.id===projectId);
 await req(`/projects/${projectId}/confirm`,{environment:true,environmentHash:project.environmentHash});
 const templateRef=state.catalog.matches.find(m=>m.ref.id==='save-result').ref;
 const {runId:oldId}=await req(`/projects/${projectId}/run`,{flow:{id:'submit',title:'工单示例练习'},checks:[{ruleId:'save-rule',confirmed:true,templateRef}]},202);
 const wait=async id=>{for(let i=0;i<200;i++){const run=(await req('/state')).runs.find(r=>r.id===id);if(run&&run.status!=='running')return run;await new Promise(resolve=>setTimeout(resolve,200));}throw new Error('PRACTICE_RUN_TIMEOUT')};
 const old=await wait(oldId);assert.equal(old.status,'completed');assert.equal(old.checks[0].verdicts[0].status,'fail');
 const original=await req('/runs/'+oldId);await writeFile(file,healthy);await req('/projects',{id:projectId,directory:example.directory});
 project=(await req('/state')).projects.find(p=>p.id===projectId);await req(`/projects/${projectId}/confirm`,{environment:true,environmentHash:project.environmentHash});
 const {runId:newId}=await req(`/projects/${projectId}/replay`,{runId:oldId,reconfirmedChanges:true},202),next=await wait(newId);
 assert.equal(next.status,'completed');assert.equal(next.parentRunId,oldId);assert.equal(next.checks[0].verdicts[0].status,'pass');assert.deepEqual(next.plan.checks,old.plan.checks);
 assert.deepEqual(await req('/runs/'+oldId),original);
});
