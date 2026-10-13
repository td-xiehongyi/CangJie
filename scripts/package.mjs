import {readFile,writeFile,mkdir,readdir,lstat,copyFile,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {constants} from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const resourceFiles=['tests/reference/server.ts','tests/reference/behaviors.ts','tests/reference/db.ts','tests/reference/seed.ts','tests/reference/mapping.json','tests/reference/suite-manifest.json','tests/fixtures/observations.json'];
async function noLinks(path){
  const ancestors=[];for(let current=resolve(path);;current=dirname(current)){ancestors.unshift(current);if(dirname(current)===current)break;}
  for(const current of ancestors){try{if((await lstat(current)).isSymbolicLink())throw new Error('SYMLINK_REJECTED:'+current);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
const files=[
  'package.json','package-lock.json','apps/host/package.json','apps/ui/package.json','packages/contracts/package.json',
  'apps/core/target/verification-core.exe','packages/contracts/schema.json',
  'scripts/toolchain.mjs','scripts/workbench.mjs','scripts/windows-credential.ps1','scripts/candidate-lock.ps1',
  'scripts/setup-cangjie.mjs','scripts/setup-tools.ps1','scripts/setup-k6.ps1','scripts/doctor.mjs',
  'templates/load-http.js','scripts/package.mjs',
  'apps/host/tsconfig.json','apps/ui/tsconfig.json','apps/ui/index.html','apps/core/cjpm.toml',
  'packages/contracts/types.ts','packages/contracts/validate.ts','packages/contracts/tsconfig.json',
  'scripts/build-core.mjs',
];
const trees=['apps/host/dist','apps/ui/dist','packages/contracts/dist','apps/host/src','apps/ui/src','apps/core/src'];
async function walk(base,path=''){
  if(!path)await noLinks(base);
  const result=[];
  for(const name of (await readdir(join(base,path))).sort()){
    const rel=path?path+'/'+name:name,stat=await lstat(join(base,rel));
    if(stat.isSymbolicLink())throw new Error('SYMLINK_REJECTED:'+rel);
    if(stat.isDirectory())result.push(...await walk(base,rel));
    else if(stat.isFile())result.push(rel);
    else throw new Error('UNSUPPORTED_FILE:'+rel);
  }
  return result;
}
export async function verifyPackage(directory){
  // Walk first so a symlinked ancestor cannot be read through a manifest entry.
  const actual=await walk(directory);
  const manifest=JSON.parse(await readFile(join(directory,'delivery-manifest.json'),'utf8'));
  if(manifest.schemaVersion!==1||!Array.isArray(manifest.files))throw new Error('MANIFEST_VERSION');
  const expected=new Set(['delivery-manifest.json']);
  for(const file of manifest.files){
    if(typeof file.path!=='string'||file.path.includes('\\')||file.path.startsWith('/')||file.path.split('/').some(p=>!p||p==='.'||p==='..')||file.path.includes(':')||expected.has(file.path))throw new Error('INVALID_MANIFEST_PATH');
    expected.add(file.path);
    const full=join(directory,file.path);
    if((await lstat(full)).isSymbolicLink())throw new Error('SYMLINK_REJECTED');
    const bytes=await readFile(full);
    if(hash(bytes)!==file.sha256||bytes.length!==file.bytes)throw new Error('HASH_MISMATCH:'+file.path);
  }
  for(const path of actual)if(!expected.has(path))throw new Error('UNEXPECTED_FILE:'+path);
  return manifest;
}
export async function buildPackage(){
  const parent=join(root,'output/delivery');await noLinks(parent);await mkdir(parent,{recursive:true});
  const directory=await mkdtemp(join(parent,'website-verification-'));
  const manifest={schemaVersion:1,product:'AI开发网站验证系统',version:'0.0.0-t9-preview',platform:'win32-x64',createdAt:new Date().toISOString(),
    formatVersions:{delivery:1,contracts:1,verificationPackage:1},
    dependencies:{node:'24.x (verified 24.19.0)',npm:'11.x (verified 11.17.0)',cangjie:'1.0.5',stdx:'1.0.5.1',k6:'2.3.0',npmLockSha256:hash(await readFile(join(root,'package-lock.json')))},
    limits:['其他电脑兼容性未验证','真实模型与实际人工双审核尚未验收','不包含用户配置、凭据、历史运行及业务数据库'],files:[]};
  const selected=[...files];
  for(const tree of trees)for(const file of await walk(join(root,tree))){
    const allowed=tree.endsWith('/src')?/\.(?:ts|tsx|css|cj)$/:/\.(?:js|ts|css|html|json|svg)$/;
    if(allowed.test(file)&&!file.startsWith('fixture-check.')&&!file.startsWith('fixtures/'))selected.push(tree+'/'+file);
  }
  for(const sample of ['ticket','registration']){
    for(const name of ['package.json','verification.json','tsconfig.json'])selected.push(`samples/${sample}/${name}`);
    for(const file of await walk(join(root,`samples/${sample}/src`)))if(file.endsWith('.ts'))selected.push(`samples/${sample}/src/${file}`);
  }
  for(const path of selected.sort()){
    await noLinks(join(root,path));
    const target=join(directory,path);await mkdir(resolve(target,'..'),{recursive:true});await copyFile(join(root,path),target);
  }
  for(const path of ['docs/delivery-guide.md','docs/demo-outline.md','docs/evidence/release-check.md','tests/reference/suite-manifest.json'])await noLinks(join(root,path));
  await writeFile(join(directory,'README.md'),await readFile(join(root,'docs/delivery-guide.md')));
  await mkdir(join(directory,'docs'));await copyFile(join(root,'docs/demo-outline.md'),join(directory,'docs/demo-outline.md'));
  await copyFile(join(root,'docs/evidence/release-check.md'),join(directory,'docs/release-check.md'));
  const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  pkg.scripts=Object.fromEntries(Object.entries(pkg.scripts).filter(([key])=>['doctor','start','build:core','build:host','build:ui','build:contracts','build:sample'].includes(key)));
  pkg.scripts.check='npm run build:contracts && npm run build:host && npm run build:sample && npm run build:core && npm run build:ui';
  await writeFile(join(directory,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  const config=JSON.parse(await readFile(join(root,'packages/contracts/tsconfig.json'),'utf8'));config.include=['types.ts','validate.ts'];
  await writeFile(join(directory,'packages/contracts/tsconfig.json'),JSON.stringify(config,null,2)+'\n');
  const rules=JSON.parse(await readFile(join(root,'tests/reference/suite-manifest.json'),'utf8')).suites.map(s=>s.rule);
  await mkdir(join(directory,'resources'));await writeFile(join(directory,'resources/public-rules.json'),JSON.stringify(rules,null,2)+'\n');
  for(const path of await walk(directory)){
    const bytes=await readFile(join(directory,path));
    if(/\.(?:js|ts|tsx|cj|css|html|json|md|mjs|ps1)$/.test(path)&&/(?:sk-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(bytes.toString('utf8')))throw new Error('SUSPECTED_SECRET:'+path);
    manifest.files.push({path,bytes:bytes.length,sha256:hash(bytes)});
  }
  await writeFile(join(directory,'delivery-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await verifyPackage(directory);
  return directory;
}
export async function buildDeveloperResources(){
  await noLinks(join(root,'tests/reference/suite-lock.json'));
  const lock=JSON.parse(await readFile(join(root,'tests/reference/suite-lock.json'),'utf8'));
  if(Object.keys(lock).length!==resourceFiles.length||Object.keys(lock).some(path=>!resourceFiles.includes(path))||Object.values(lock).some(value=>typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)))throw new Error('INVALID_RESOURCE_FILES');
  for(const path of resourceFiles)await noLinks(join(root,path));
  const parent=join(root,'output/delivery');await noLinks(parent);await mkdir(parent,{recursive:true});
  const directory=await mkdtemp(join(parent,'developer-resources-'));
  const manifest={schemaVersion:1,kind:'developer-validation-resources',version:'reference-v1',files:[]};
  for(const path of [...Object.keys(lock),'tests/reference/suite-lock.json'].sort()){
    const bytes=await readFile(join(root,path));
    if(lock[path]&&hash(bytes)!==lock[path])throw new Error('REFERENCE_CHANGED_REVIEW_REQUIRED');
    const target=join(directory,path);await mkdir(resolve(target,'..'),{recursive:true});await writeFile(target,bytes);
    manifest.files.push({path,bytes:bytes.length,sha256:hash(bytes)});
  }
  await writeFile(join(directory,'delivery-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await verifyPackage(directory);return directory;
}
export async function installDeveloperResources(resources,directory){
  const manifest=await verifyPackage(resources);
  if(manifest.kind!=='developer-validation-resources')throw new Error('WRONG_RESOURCE_KIND');
  const allowed=new Set([...resourceFiles,'tests/reference/suite-lock.json']);
  if(manifest.files.length!==allowed.size||manifest.files.some(f=>!allowed.has(f.path)))throw new Error('INVALID_RESOURCE_FILES');
  for(const file of manifest.files){
    await noLinks(join(directory,file.path));
    try{if((await lstat(join(directory,file.path))).isSymbolicLink()||hash(await readFile(join(directory,file.path)))!==file.sha256)throw new Error('INSTALL_CONFLICT:'+file.path);}
    catch(e){if(e.code!=='ENOENT')throw e;}
  }
  for(const file of manifest.files){
    const target=join(directory,file.path);await mkdir(resolve(target,'..'),{recursive:true});
    try{await copyFile(join(resources,file.path),target,constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST'||hash(await readFile(target))!==file.sha256)throw e;}
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='--verify')console.log(JSON.stringify(await verifyPackage(resolve(process.argv[3]))));
    else if(process.argv[2]==='--install-resources'){await installDeveloperResources(resolve(process.argv[3]),resolve(process.argv[4]??root));console.log('Developer validation resources installed');}
    else console.log(JSON.stringify({runtime:await buildPackage(),developerResources:await buildDeveloperResources()}));
  }
  catch(error){console.error(error.message);process.exitCode=1;}
}
