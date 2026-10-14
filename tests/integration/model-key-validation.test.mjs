import test from 'node:test';
import assert from 'node:assert/strict';
import {ModelCredentials} from '../../apps/host/dist/model/credentials.js';
import {startWorkbench} from '../../apps/host/dist/api.js';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';

test('closing a workbench session revokes its token and permits a fresh key session',async t=>{
  const host=await startWorkbench({directory:join(process.cwd(),'.local-data/workbench-tests',randomUUID()),port:0});
  t.after(()=>host.close());
  const call=(token,path,body)=>fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const settings={serviceUrl:'https://api.deepseek.com',model:'fixture',key:'sk-fictional-rn',remember:false};
  assert.equal((await call(host.token,'/settings',settings)).status,200);
  assert.equal((await call(host.token,'/session/close',{})).status,200);
  assert.equal((await call(host.token,'/state')).status,401);
  const next=await(await fetch(host.url+'/api/session')).json();
  assert.notEqual(next.token,host.token);
  const state=await(await call(next.token,'/state')).json();
  assert.equal(state.settings.hasKey,false);
  assert.equal((await call(next.token,'/settings',settings)).status,200);
});

test('closed credential sessions report lifecycle failure instead of an invalid key', async()=>{
  const credentials=new ModelCredentials();
  credentials.close();
  await assert.rejects(credentials.set('https://api.deepseek.com','sk-fictional',{remember:false}),/CREDENTIAL_SESSION_CLOSED/);
});

test('model keys accept ordinary r and n characters', async()=>{
  const credentials=new ModelCredentials();
  const key='sk-fictional-rn-key';
  const ref=await credentials.set('https://api.deepseek.com',key,{remember:false});
  assert.equal(await credentials.get(ref,'https://api.deepseek.com'),key);
  credentials.close();
});

test('model keys reject actual carriage returns and newlines', async()=>{
  const credentials=new ModelCredentials();
  for(const key of ['sk-abc\rdef','sk-abc\ndef']){
    await assert.rejects(credentials.set('https://api.deepseek.com',key,{remember:false}),/INVALID_MODEL_KEY/);
  }
  credentials.close();
});
