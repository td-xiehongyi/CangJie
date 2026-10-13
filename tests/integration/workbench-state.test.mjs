import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';

test('workbench state save survives a transient Windows reader lock without losing config',{timeout:15000},async()=>{
  const {startWorkbench}=await import('../../apps/host/dist/api.js');
  const directory=join(process.cwd(),'.local-data/workbench-lock-tests',randomUUID());
  const host=await startWorkbench({directory,port:0});
  const request=model=>fetch(host.url+'/api/settings',{method:'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:JSON.stringify({serviceUrl:'https://api.deepseek.com',model,remember:false})});
  assert.equal((await request('before-lock')).status,200);
  const locker=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$stream=[System.IO.File]::Open($env:T7_STATE_FILE,'Open','Read','Read'); [Console]::WriteLine('locked'); [Console]::ReadLine() | Out-Null; $stream.Dispose()"],{env:{...process.env,T7_STATE_FILE:join(directory,'state.json')},windowsHide:true,stdio:['pipe','pipe','pipe']});
  const exited=once(locker,'exit');let release;
  try{
    await new Promise((resolve,reject)=>{locker.stdout.once('data',data=>data.toString().includes('locked')?resolve():reject(new Error('LOCK_NOT_READY')));locker.once('error',reject);locker.once('exit',()=>reject(new Error('LOCK_EXITED_EARLY')));});
    release=setTimeout(()=>locker.stdin.end('\n'),200);
    const response=await request('after-lock'),body=await response.json();
    assert.equal(response.status,200,JSON.stringify(body));
    await exited;
    assert.equal(JSON.parse(await readFile(join(directory,'state.json'),'utf8')).config.model,'after-lock');
  }finally{clearTimeout(release);if(locker.exitCode===null)locker.stdin.end('\n');await exited;await host.close().catch(()=>{});}
});

test('run checkpoint survives the same Windows reader lock and remains readable',{timeout:15000},async()=>{
  const {ArtifactStore}=await import('../../apps/host/dist/artifacts/store.js');
  const directory=join(process.cwd(),'.local-data/workbench-lock-tests',randomUUID()),store=new ArtifactStore(directory);
  const id=randomUUID(),before={id,status:'running',checks:[],events:[],uncovered:[],projectId:'lock-test'};
  await store.checkpoint(before);
  const path=join(directory,id+'.pending.json');
  const locker=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$stream=[System.IO.File]::Open($env:T7_STATE_FILE,'Open','Read','Read'); [Console]::WriteLine('locked'); [Console]::ReadLine() | Out-Null; $stream.Dispose()"],{env:{...process.env,T7_STATE_FILE:path},windowsHide:true,stdio:['pipe','pipe','pipe']});
  const exited=once(locker,'exit');let release;
  try{
    await new Promise((resolve,reject)=>{locker.stdout.once('data',data=>data.toString().includes('locked')?resolve():reject(new Error('LOCK_NOT_READY')));locker.once('error',reject);locker.once('exit',()=>reject(new Error('LOCK_EXITED_EARLY')));});
    release=setTimeout(()=>locker.stdin.end('\n'),200);
    await store.checkpoint({...before,events:[{phase:'saved-after-lock'}]});await exited;
    assert.equal((await store.get(id)).events[0].phase,'saved-after-lock');
  }finally{clearTimeout(release);if(locker.exitCode===null)locker.stdin.end('\n');await exited;}
});

test('persistent Windows state lock fails within a bound, preserves old state and allows recovery',{timeout:15000},async()=>{
  const {startWorkbench}=await import('../../apps/host/dist/api.js');
  const directory=join(process.cwd(),'.local-data/workbench-lock-tests',randomUUID());
  const host=await startWorkbench({directory,port:0});
  const request=model=>fetch(host.url+'/api/settings',{method:'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:JSON.stringify({serviceUrl:'https://api.deepseek.com',model,remember:false})});
  assert.equal((await request('original')).status,200);
  const path=join(directory,'state.json'),original=await readFile(path,'utf8');
  const locker=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$stream=[System.IO.File]::Open($env:T7_STATE_FILE,'Open','Read','Read'); [Console]::WriteLine('locked'); [Console]::ReadLine() | Out-Null; $stream.Dispose()"],{env:{...process.env,T7_STATE_FILE:path},windowsHide:true,stdio:['pipe','pipe','pipe']});
  const exited=once(locker,'exit');
  try{
    await new Promise((resolve,reject)=>{locker.stdout.once('data',data=>data.toString().includes('locked')?resolve():reject(new Error('LOCK_NOT_READY')));locker.once('error',reject);locker.once('exit',()=>reject(new Error('LOCK_EXITED_EARLY')));});
    const response=await request('blocked');assert.equal(response.status,400);assert.match((await response.json()).error,/EPERM|EACCES|EBUSY/);
    assert.equal(await readFile(path,'utf8'),original);
    locker.stdin.end('\n');await exited;
    assert.equal((await request('recovered')).status,200);
    assert.equal(JSON.parse(await readFile(path,'utf8')).config.model,'recovered');
  }finally{if(locker.exitCode===null)locker.stdin.end('\n');await exited;await host.close();}
});
