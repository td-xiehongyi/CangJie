import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setImmediate as turn} from 'node:timers/promises';
import {ArtifactStore} from '../../apps/host/dist/artifacts/store.js';
import {TemplateRegistry} from '../../apps/host/dist/templates/store.js';
import {startWorkbench} from '../../apps/host/dist/api.js';
import {publishedFixture} from '../support/published.mjs';

test('state never reports a live run as interrupted when it finishes during a history read',{timeout:60000},async t=>{
  const directory=join(process.cwd(),'.local-data/run-state-race',randomUUID());
  const registryDirectory=join(directory,'registry');
  const published=await publishedFixture(directory,new TemplateRegistry(registryDirectory),'templates/saved-result.json','save-rule');
  const host=await startWorkbench({directory,registryDirectory,port:0});
  const api=async(path,body)=>{const response=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
  const entered=Promise.withResolvers(),release=Promise.withResolvers(),finished=Promise.withResolvers();
  t.after(async()=>{release.resolve();await host.close();});
  const originalFinish=ArtifactStore.prototype.finish,originalList=ArtifactStore.prototype.list;
  let runId,armed=false;
  t.mock.method(ArtifactStore.prototype,'finish',async function(record){
    if(this.directory!==join(directory,'runs'))return originalFinish.call(this,record);
    entered.resolve();await release.promise;const result=await originalFinish.call(this,record);finished.resolve();return result;
  });
  t.mock.method(ArtifactStore.prototype,'list',async function(){
    const records=await originalList.call(this);
    if(armed&&this.directory===join(directory,'runs')){
      armed=false;assert.equal(records.find(r=>r.id===runId)?.status,'interrupted','disk checkpoint precedes terminal commit');
      release.resolve();await finished.promise;await turn(); // Let launch remove the completed active entry.
    }
    return records;
  });
  const {projectId}=await api('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'});
  const project=(await api('/state')).projects[0];
  await api(`/projects/${projectId}/confirm`,{environment:true,environmentHash:project.environmentHash});
  ({runId}=await api(`/projects/${projectId}/run`,{flow:{id:'submit',title:'submit'},checks:[{ruleId:'save-rule',confirmed:true,templateRef:published.ref}]}));
  await entered.promise;armed=true;
  const state=await api('/state'),run=state.runs.find(r=>r.id===runId);
  assert.equal(run.status,'completed');
  assert.ok(!run.uncovered.includes('HOST_EXITED_BEFORE_TERMINAL'));
  assert.deepEqual(run,await api(`/runs/${runId}`));
  // A genuinely abandoned checkpoint must still be shown as interrupted.
  const abandoned={...run,id:randomUUID(),status:'running'};delete abandoned.finishedAt;
  await new ArtifactStore(join(directory,'runs')).checkpoint(abandoned);
  const orphan=(await api('/state')).runs.find(r=>r.id===abandoned.id);
  assert.equal(orphan.status,'interrupted');assert.ok(orphan.uncovered.includes('HOST_EXITED_BEFORE_TERMINAL'));
});
