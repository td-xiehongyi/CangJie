import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,access,copyFile,cp,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';

function child(exe,args,options={}){return new Promise((resolve,reject)=>{
  const p=spawn(exe,args,{windowsHide:true,...options,stdio:['ignore','pipe','pipe']});let output='';
  p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>output+=d);p.on('error',reject);
  const timer=setTimeout(()=>{p.kill();reject(new Error('release subprocess timeout'));},150000);
  p.on('exit',code=>{clearTimeout(timer);code===0?resolve(output):reject(new Error(`release subprocess ${code}: ${output}`));});
});}

test('T9 delivery contains declared components, hashes and no development state', {timeout:120000},async()=>{
  const {buildPackage,verifyPackage}=await import('../../scripts/package.mjs');
  const directory=await buildPackage();
  const manifest=await verifyPackage(directory);
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.platform,'win32-x64');
  assert.ok(manifest.files.some(f=>f.path==='apps/core/target/verification-core.exe'));
  assert.ok(manifest.files.some(f=>f.path==='apps/ui/dist/index.html'));
  assert.ok(manifest.files.some(f=>f.path==='packages/contracts/schema.json'));
  assert.ok(!manifest.files.some(f=>/^(?:\.local-data|node_modules|output)\//.test(f.path)));
  assert.ok(manifest.dependencies.node);
  assert.ok(!manifest.files.some(f=>/^tests\//.test(f.path)));
  const rules=JSON.parse(await readFile(join(directory,'resources/public-rules.json'),'utf8'));
  assert.equal(rules.length,4);assert.ok(!JSON.stringify(rules).includes('heldOut'));
  const file=join(directory,'scripts/workbench.mjs'),original=await readFile(file);
  await writeFile(file,'tampered');
  await assert.rejects(verifyPackage(directory),/HASH_MISMATCH/);
  await writeFile(file,original);
  await mkdir(join(directory,'.local-data'));
  await writeFile(join(directory,'.local-data','do-not-export.txt'),'synthetic secret');
  await assert.rejects(verifyPackage(directory),/UNEXPECTED_FILE/);
});

test('T9 fresh delivery performs candidate, report, actual k6 and process-restart replay', {timeout:240000},async t=>{
  const {buildPackage,buildDeveloperResources,installDeveloperResources}=await import('../../scripts/package.mjs');
  const root=process.cwd(),packed=await buildPackage(),directory=await mkdtemp(join(root,'output/delivery/fresh directory 空白-'));
  const {cleanupFixtureCredential}=await import('../support/release-cleanup.mjs');
  t.after(()=>cleanupFixtureCredential(join(directory,'.local-data/workbench/state.json')));
  await cp(packed,directory,{recursive:true});
  const spec=JSON.parse(await readFile('packages/contracts/fixtures/save-result.json','utf8')),requests=[];
  const provider=createServer(async(req,res)=>{
    let text='';for await(const c of req)text+=c;requests.push(text);
    const value=text.includes('Return JSON only:')?{ok:true}:spec;
    res.writeHead(200,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{total_tokens:20}}));
  });await new Promise(r=>provider.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>provider.close(r)));
  const env={...process.env,CANGJIE_SDK:join(root,'.local-tools/cangjie'),CANGJIE_STDX:join(root,'.local-tools/stdx/windows_x86_64_cjnative'),T9_MODEL_URL:`http://127.0.0.1:${provider.address().port}`};delete env.NODE_PATH;
  const npm=join(process.execPath,'../node_modules/npm/bin/npm-cli.js');
  const install=await child(process.execPath,[npm,'ci','--cache',join(root,'.local-tools/npm-release-cache'),'--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:directory,env});
  await mkdir(join(directory,'acceptance'));await writeFile(join(directory,'acceptance/install.log'),install);
  await copyFile('tests/support/release-runner.mjs',join(directory,'acceptance/runner.mjs'));
  const run=async phase=>{const result=await child(process.execPath,['acceptance/runner.mjs',phase],{cwd:directory,env});await writeFile(join(directory,`acceptance/${phase}.log`),result);return result;};
  await run('probe');
  const {startWorkbench}=await import(pathToFileURL(join(directory,'apps/host/dist/api.js')).href);
  const {chromium}=await import('@playwright/test');
  const web=await startWorkbench({port:0});
  let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const width of [1280,768,390]){
      await page.setViewportSize({width,height:900});await page.goto(web.url+'/?page=report');
      await page.getByRole('heading',{name:'尚无验证结果'}).waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:join(directory,`acceptance/empty-${width}.png`),fullPage:true});
    }
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await web.close();}
  await installDeveloperResources(await buildDeveloperResources(),directory);
  await mkdir(join(directory,'.local-tools/k6-v2.3.0-windows-amd64'),{recursive:true});
  await copyFile('.local-tools/k6-v2.3.0-windows-amd64/k6.exe',join(directory,'.local-tools/k6-v2.3.0-windows-amd64/k6.exe'));
  await run('run');const replay=await run('replay');assert.match(replay,/"replayWithoutModel":true/);
  assert.ok(requests.length>=3);assert.ok(requests.every(v=>!v.includes('heldOut')&&!v.includes('c001')&&!v.includes('t9-isolated-owner-password')));
  const texts=[];
  async function scan(path){for(const entry of await readdir(path,{withFileTypes:true})){const p=join(path,entry.name);if(entry.isDirectory())await scan(p);else if(/\.(?:json|jsonl|md|log)$/.test(entry.name))texts.push(await readFile(p,'utf8'));}}
  await scan(join(directory,'.local-data'));await scan(join(directory,'acceptance'));
  for(const secret of ['t9-isolated-owner-password','t9-isolated-other-password','t9-isolated-model-key'])assert.ok(texts.every(v=>!v.includes(secret)),'no secrets in saved records or reports');
  await writeFile('docs/evidence/t9-latest.json',JSON.stringify({directory,packed,recordedAt:new Date().toISOString(),node:process.version,phases:['probe','run','replay'],realModel:false,formalHumanReview:false,otherComputerCompatibility:'unverified',dependencyInstall:'npm ci --omit=dev --ignore-scripts (project-local cache)',sdk:env.CANGJIE_SDK,stdx:env.CANGJIE_STDX,modelSendingBoundary:true,secretScan:true},null,2)+'\n');
});

test('T9 developer resources are separate, verified and install without overwriting conflicts', {timeout:120000},async()=>{
  const {buildPackage,buildDeveloperResources,installDeveloperResources,verifyPackage}=await import('../../scripts/package.mjs');
  const directory=await buildPackage(),resources=await buildDeveloperResources();
  const manifest=await verifyPackage(resources);
  assert.equal(manifest.kind,'developer-validation-resources');
  assert.ok(manifest.files.some(f=>f.path==='tests/reference/suite-manifest.json'));
  await assert.rejects(access(join(directory,'tests/reference/suite-manifest.json')));
  await installDeveloperResources(resources,directory);
  await installDeveloperResources(resources,directory);
  const file=join(directory,'tests/reference/suite-manifest.json');
  await writeFile(file,'keep existing change');
  await assert.rejects(installDeveloperResources(resources,directory),/INSTALL_CONFLICT/);
  assert.equal(await readFile(file,'utf8'),'keep existing change');
});
