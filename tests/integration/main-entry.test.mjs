import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';

test('main entry resolves its chosen workspace from the project root, with delivery fallback',async()=>{
  const source=await readFile('scripts/workbench.mjs','utf8');
  for(const mode of ['main','delivery','invalid']){
    const root=join(process.cwd(),'.local-data/main-launcher-tests',randomUUID());
    for(const path of ['scripts','apps/host/dist','other-cwd'])await mkdir(join(root,path),{recursive:true});
    await writeFile(join(root,'package.json'),JSON.stringify({type:'module'}));
    await writeFile(join(root,'scripts/workbench.mjs'),source);
    await writeFile(join(root,'apps/host/dist/api.js'),"export async function startWorkbench(options){console.log(JSON.stringify(options));return {url:'http://127.0.0.1:'+options.port,close:async()=>{}}}");
    if(mode!=='delivery')await writeFile(join(root,'main-version.json'),JSON.stringify(mode==='invalid'?{schemaVersion:999}:{schemaVersion:1,id:'test-main',runtime:{port:4317,directory:'.local-data/current',registryDirectory:'.local-data/current/registry'}}));
    const run=spawnSync(process.execPath,[join(root,'scripts/workbench.mjs')],{cwd:join(root,'other-cwd'),env:{...process.env,WORKBENCH_PORT:'0'},encoding:'utf8',windowsHide:true});
    if(mode==='invalid'){assert.notEqual(run.status,0);assert.match(run.stderr,/INVALID_MAIN_VERSION/);continue;}
    assert.equal(run.status,0,run.stderr);const options=JSON.parse(run.stdout.split(/\r?\n/)[0]);assert.equal(options.port,0);
    if(mode==='main'){assert.equal(options.directory,join(root,'.local-data/current'));assert.equal(options.registryDirectory,join(root,'.local-data/current/registry'));}
    else{assert.equal(options.directory,undefined);assert.equal(options.registryDirectory,undefined);}
  }
});
