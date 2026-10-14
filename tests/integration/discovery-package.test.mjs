import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,rename,readFile,writeFile,access,symlink,rm,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import * as packaging from '../../scripts/package.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const hash=v=>createHash('sha256').update(v).digest('hex');
const run=promisify(execFile);
async function temp(t){const directory=await mkdtemp(join(tmpdir(),'cangjie-s5-package-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}
async function source(t){assert.equal(typeof packaging.buildSourcePackage,'function','explicit source-only development delivery is missing');const original=await packaging.buildSourcePackage();t.after(()=>rm(original,{recursive:true,force:true}));return original;}
async function relocate(t,directory){const base=await temp(t),before=join(base,'before'),after=join(base,'moved directory 中文');await cp(directory,before,{recursive:true});await rename(before,after);return after;}
async function rehash(directory,path){const manifest=JSON.parse(await readFile(join(directory,'delivery-manifest.json'),'utf8')),bytes=await readFile(join(directory,path));Object.assign(manifest.files.find(f=>f.path===path),{bytes:bytes.length,sha256:hash(bytes)});await writeFile(join(directory,'delivery-manifest.json'),JSON.stringify(manifest));}
async function npm(directory,args){
  // Use the installed npm CLI without relying on npm.cmd shell behavior on Windows.
  const candidates=[process.env.npm_execpath,join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),join(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].filter(Boolean);
  let cli;for(const candidate of candidates){try{cli=await realpath(candidate);break;}catch{}}
  assert.ok(cli,'installed npm CLI must be discoverable');
  const env={...process.env};delete env.NODE_PATH;delete env.npm_config_http_proxy;delete env.NPM_CONFIG_HTTP_PROXY;
  return run(process.execPath,[cli,...args,'--cache',process.env.CANGJIE_PACKAGE_NPM_CACHE??join(root,'.local-tools/npm-cache'),'--ignore-scripts','--no-audit','--no-fund','--offline'],{cwd:directory,env,timeout:150000,maxBuffer:8*1024*1024});
}

test('source-only delivery is explicit, contains public contracts and all sample build sources, excludes private answers',async t=>{
  const directory=await source(t),manifest=await packaging.verifyPackage(directory),paths=manifest.files.map(f=>f.path);
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.kind,'source-development-delivery');assert.equal(manifest.coreBuilt,false);
  assert.ok(!paths.includes('apps/core/target/verification-core.exe'));
  for(const path of ['packages/contracts/discovery.ts','packages/contracts/status-transition.ts','samples/status-ticket/src/server.ts','samples/status-ticket/README.md'])assert.ok(paths.includes(path),path);
  assert.ok(paths.every(path=>!/^tests\/|^\.local-data\/|^node_modules\/|^output\//.test(path)));
  assert.ok(paths.every(path=>!path.includes('/fixtures/')&&!path.includes('/history/')));
  for(const file of manifest.files){if(/\.(?:json|ts|js|mjs|md)$/.test(file.path))assert.doesNotMatch(await readFile(join(directory,file.path),'utf8'),/sk-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);}
});

test('moved delivery installs only production dependencies and actually indexes TSX with exact source references',{timeout:180000},async t=>{
  const directory=await relocate(t,await source(t));await npm(directory,['ci','--omit=dev']);
  await access(join(directory,'node_modules/typescript/lib/typescript.js'));
  await assert.rejects(access(join(directory,'node_modules/@playwright/test/package.json')));
  const result=await run(process.execPath,['--input-type=module','-e',`import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {buildSourceSnapshot} from './apps/host/dist/discovery/index.js';import {createAnalysisScope,readExcerpt,validateSourceRefs} from './apps/host/dist/discovery/access.js';import {statusTransitionBehavior} from '@website-verification/contracts/status-transition';await mkdir('project/src',{recursive:true});await writeFile('project/src/Page.tsx','export const Page = () => <div>hello</div>;');const snapshot=await buildSourceSnapshot('project','moved-project');const scope=createAnalysisScope(snapshot,{allowedPaths:['src'],excludedPaths:[],includeProjectTests:false,serviceUrl:'https://example.invalid'});const excerpt=await readExcerpt(snapshot,scope,'src/Page.tsx',1,1);assert.equal(snapshot.files[0].language,'tsx');assert.equal((await validateSourceRefs(snapshot,[excerpt],[excerpt.ref])).valid,true);assert.equal((await validateSourceRefs({...snapshot,id:'wrong'},[excerpt],[excerpt.ref])).valid,false);assert.equal(statusTransitionBehavior.length,3);console.log('moved-production-index-and-public-contract-ok');`],{cwd:directory,env:{...process.env,NODE_PATH:''},timeout:30000});
  assert.match(result.stdout,/moved-production-index-and-public-contract-ok/);
});

test('developer package freezes both facilities, installs after relocation and builds private sources',{timeout:180000},async t=>{
  const runtime=await relocate(t,await source(t)),resources=await packaging.buildDeveloperResources();t.after(()=>rm(resources,{recursive:true,force:true}));const moved=await relocate(t,resources),manifest=await packaging.verifyPackage(moved);
  assert.equal(manifest.version,'reference-v2');
  for(const path of ['tests/reference/tsconfig.json','tests/reference/status-transition/suite-lock.json','tests/reference/status-transition/tsconfig.json','tests/fixtures/status-transition-observations.json'])assert.ok(manifest.files.some(f=>f.path===path),path);
  await packaging.installDeveloperResources(moved,runtime);await packaging.installDeveloperResources(moved,runtime);
  await npm(runtime,['ci']);
  for(const config of ['packages/contracts/tsconfig.json','apps/host/tsconfig.json','samples/ticket/tsconfig.json','samples/registration/tsconfig.json','samples/status-ticket/tsconfig.json','tests/reference/tsconfig.json','tests/reference/status-transition/tsconfig.json']){
    const result=await run(process.execPath,['node_modules/typescript/bin/tsc','-p',config],{cwd:runtime,timeout:30000});assert.equal(result.stderr,'',config);
  }
  const child=await run(process.execPath,['--input-type=module','-e',`import assert from 'node:assert/strict';import {loadValidationSuite} from './apps/host/dist/validation/reference-runner.js';const suite=await loadValidationSuite('status-transition-rule');assert.equal(suite.version,'status-transition-reference-v1.1.0');assert.equal(suite.cases.length,10);assert.equal(suite.facility,'status-transition');console.log('moved-private-facility-ok');`],{cwd:runtime,timeout:30000});assert.match(child.stdout,/moved-private-facility-ok/);
});

test('private resource lock rejects tampering even when delivery file hashes are recomputed',async t=>{
  const resources=await packaging.buildDeveloperResources();t.after(()=>rm(resources,{recursive:true,force:true}));const file='tests/reference/status-transition/server.ts';const manifest=await packaging.verifyPackage(resources);assert.ok(manifest.files.some(f=>f.path===file),'new frozen independent facility is missing');await writeFile(join(resources,file),'// altered independent implementation\n');await rehash(resources,file);const target=await temp(t);
  await assert.rejects(packaging.installDeveloperResources(resources,target),/REFERENCE_CHANGED_REVIEW_REQUIRED/);await assert.rejects(access(join(target,'tests')));
});

test('v1 developer resource packages remain installable without silent upgrading',async t=>{
  const resources=await packaging.buildDeveloperResources();t.after(()=>rm(resources,{recursive:true,force:true}));const current=JSON.parse(await readFile(join(resources,'delivery-manifest.json'),'utf8')),old=await temp(t),target=await temp(t);
  const paths=new Set(['tests/reference/server.ts','tests/reference/behaviors.ts','tests/reference/db.ts','tests/reference/seed.ts','tests/reference/mapping.json','tests/reference/suite-manifest.json','tests/fixtures/observations.json','tests/reference/suite-lock.json']);
  const manifest={schemaVersion:1,kind:'developer-validation-resources',version:'reference-v1',files:current.files.filter(f=>paths.has(f.path))};for(const f of manifest.files){await mkdir(dirname(join(old,f.path)),{recursive:true});await cp(join(resources,f.path),join(old,f.path));}await writeFile(join(old,'delivery-manifest.json'),JSON.stringify(manifest));
  await packaging.installDeveloperResources(old,target);await access(join(target,'tests/reference/server.ts'));await assert.rejects(access(join(target,'tests/reference/status-transition')));
});

test('unknown manifest and private facility versions fail before any installation',async t=>{
  const resources=await packaging.buildDeveloperResources();t.after(()=>rm(resources,{recursive:true,force:true}));const manifest=JSON.parse(await readFile(join(resources,'delivery-manifest.json'),'utf8')),target=await temp(t);
  await writeFile(join(resources,'delivery-manifest.json'),JSON.stringify({...manifest,schemaVersion:2}));await assert.rejects(packaging.verifyPackage(resources),/MANIFEST_VERSION/);
  await writeFile(join(resources,'delivery-manifest.json'),JSON.stringify({...manifest,version:'reference-v999'}));await assert.rejects(packaging.installDeveloperResources(resources,target),/RESOURCE_VERSION/);await assert.rejects(access(join(target,'tests')));
});

test('resource installation refuses linked source ancestors and destination ancestors',async t=>{
  const resources=await packaging.buildDeveloperResources();t.after(()=>rm(resources,{recursive:true,force:true}));const base=await temp(t);await mkdir(join(base,'actual'));await symlink(resources,join(base,'resources-link'),'junction');await symlink(join(base,'actual'),join(base,'destination-link'),'junction');
  await assert.rejects(packaging.installDeveloperResources(join(base,'resources-link'),join(base,'plain')),/SYMLINK_REJECTED/);await assert.rejects(packaging.installDeveloperResources(resources,join(base,'destination-link/child')),/SYMLINK_REJECTED/);await assert.rejects(access(join(base,'actual/child/tests')));
});

test('delivery manifest rejects unsafe Windows names and malformed digest records before reading them',async t=>{
  const directory=await temp(t),bytes=Buffer.from('safe');await writeFile(join(directory,'safe.txt'),bytes);
  const entry={path:'safe.txt',bytes:bytes.length,sha256:hash(bytes)};
  for(const path of ['safe.txt\0','safe.txt.','CON.txt','dir/nul.txt','safe?.txt']){
    await writeFile(join(directory,'delivery-manifest.json'),JSON.stringify({schemaVersion:1,files:[{...entry,path}]}));await assert.rejects(packaging.verifyPackage(directory),/INVALID_MANIFEST_PATH/);
  }
  for(const broken of [{bytes:-1},{bytes:1.5},{sha256:'not-a-digest'}]){
    await writeFile(join(directory,'delivery-manifest.json'),JSON.stringify({schemaVersion:1,files:[{...entry,...broken}]}));await assert.rejects(packaging.verifyPackage(directory),/INVALID_MANIFEST_FILE/);
  }
});

test('unknown declared delivery and contract formats are rejected while legacy v1 without declarations stays readable',async t=>{
  const directory=await temp(t),manifest={schemaVersion:1,files:[]};
  await writeFile(join(directory,'delivery-manifest.json'),JSON.stringify(manifest));assert.equal((await packaging.verifyPackage(directory)).schemaVersion,1);
  for(const key of ['delivery','contracts','verificationPackage']){
    await writeFile(join(directory,'delivery-manifest.json'),JSON.stringify({...manifest,formatVersions:{delivery:1,contracts:1,verificationPackage:1,[key]:2}}));await assert.rejects(packaging.verifyPackage(directory),/MANIFEST_VERSION/);
  }
});

test('resource bytes changed after source preflight cannot report successful installation',async t=>{
  const resources=await packaging.buildDeveloperResources();t.after(()=>rm(resources,{recursive:true,force:true}));const target=await temp(t),victim='tests/reference/status-transition/server.ts',originalCopy=fs.copyFile;let raced=false;
  // Deterministic native IO boundary: the real copy runs after the source has
  // changed between verification and copying. No installation result is mocked.
  const seam=mock.method(fs,'copyFile',async(from,to,...args)=>{
    if(from===join(resources,victim)&&!raced){raced=true;await writeFile(from,'// changed after source preflight\n');}
    return originalCopy(from,to,...args);
  });syncBuiltinESMExports();
  t.after(()=>{seam.mock.restore();syncBuiltinESMExports();});
  await assert.rejects(packaging.installDeveloperResources(resources,target),/HASH_MISMATCH|REFERENCE_CHANGED_REVIEW_REQUIRED/);assert.equal(raced,true);
});
