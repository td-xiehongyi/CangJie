import test from 'node:test';import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';
import {inspectProject} from '../../apps/host/dist/projects/inspect.js';
test('unused demo launchers do not block runtime, but reachable and unresolved unsafe imports do',async t=>{
 await mkdir('output/candidate-recovery-20261016',{recursive:true});const root=await mkdtemp(join(process.cwd(),'output/candidate-recovery-20261016/scope-'));t.after(()=>rm(root,{recursive:true,force:true}));await cp('samples/ticket',root,{recursive:true});
 assert.equal((await inspectProject(root)).supported,true);
 await writeFile(join(root,'src/unsafe.ts'),"import {spawn} from 'node:child_process'; spawn('anything');");
 assert.equal((await inspectProject(root)).supported,true,'unreferenced tooling is not a runtime entry');
 for(const dependency of ["import './unsafe.ts';","export * from './unsafe.ts';","await import('./unsafe.ts');","await import(process.env.MODULE);","import './missing.ts';", "import {createRequire} from 'node:module';const load=createRequire(import.meta.url);load('./unsafe.ts');", "import {Worker} from 'node:worker_threads';new Worker(new URL('./unsafe.ts',import.meta.url));", "import * as vm from 'node:vm';vm.runInThisContext('anything');", "const load=process.getBuiltinModule;load('module');", "import cluster from 'node:cluster';cluster.setupPrimary({exec:'./unsafe.ts'});cluster.fork();", "import {run} from 'node:test';run({files:['./unsafe.ts']});", "import {Session} from 'node:inspector';new Session();"]){
  await writeFile(join(root,'src/server.ts'),dependency);const profile=await inspectProject(root);assert.equal(profile.supported,false,dependency);assert.ok(profile.gaps.some(g=>g.code==='UNSAFE_INITIALIZATION_TARGET'),dependency);
 }
});


test('malformed runtime argv remains an explicit configuration gap',async t=>{
 const root=await mkdtemp(join(process.cwd(),'output/candidate-recovery-20261016/argv-'));t.after(()=>rm(root,{recursive:true,force:true}));await cp('samples/ticket',root,{recursive:true});const {readFile}=await import('node:fs/promises'),manifest=JSON.parse(await readFile(join(root,'verification.json'),'utf8'));
 for(const value of [7,{},null]){await writeFile(join(root,'verification.json'),JSON.stringify({...manifest,start:{argv:value}}));const profile=await inspectProject(root);assert.equal(profile.supported,false);assert.ok(profile.gaps.some(g=>g.code==='STARTUP_GAP'))}
});
