import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {startWorkbench} from '../../apps/host/dist/api.js';

test('automatic accounts prepare a real isolated website and recover after host restart', {timeout:60000}, async t=>{
  const directory=join(process.cwd(),'.local-data/auto-account-tests',randomUUID());
  let host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  t.after(()=>host.close());
  const request=async(path,body)=>{
    const response=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
  };
  const {projectId}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'});
  let p=(await request('/state')).projects[0];
  assert.equal(p.accountMode,'automatic');assert.equal(p.accounts.length,2);
  assert.equal(new Set(p.accounts.map(a=>a.userId)).size,2);
  assert.ok(p.accounts.every(a=>a.hasPassword&&!('password' in a)));
  await assert.rejects(request(`/projects/${projectId}/prepare`,{}),/PROJECT_CONFIRMATION_REQUIRED/);
  await request(`/projects/${projectId}/confirm`,{environment:true,environmentHash:p.environmentHash});
  const ready=await request(`/projects/${projectId}/prepare`,{});
  assert.equal(ready.status,'ready');assert.equal(ready.verifiedAccounts,2);
  assert.ok(ready.copyId);
  const saved=await readFile(join(directory,'state.json'),'utf8');
  const persisted=JSON.parse(saved).projects[0];
  assert.ok(persisted.accounts.every(a=>!('password' in a)&&!('token' in a)));
  assert.equal(persisted.credentials,undefined);
  const identities=p.accounts.map(a=>a.userId);
  await host.close();host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  p=(await request('/state')).projects[0];assert.deepEqual(p.accounts.map(a=>a.userId),identities);
  assert.ok(p.accounts.every(a=>!a.hasPassword));
  assert.equal((await request(`/projects/${projectId}/prepare`,{})).verifiedAccounts,2);
  // Explicit manual mode remains available and is never silently replaced.
  await assert.rejects(request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'manual',accounts:[]}),/TEST_ACCOUNT_CONFIG_GAP/);
});
