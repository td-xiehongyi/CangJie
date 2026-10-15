import {readFile,writeFile,mkdir,readdir,lstat,copyFile,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {constants} from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// This process can attest to its Node runtime, not an npm installation or
// Windows acceptance run. npm is not invoked by the packager; do not guess it.
const packagingEnvironment=()=>({node:process.versions.node,platform:process.platform,arch:process.arch,npm:{version:null,status:'not-probed'}});
const resourceFiles=['tests/reference/server.ts','tests/reference/behaviors.ts','tests/reference/db.ts','tests/reference/seed.ts','tests/reference/mapping.json','tests/reference/suite-manifest.json','tests/fixtures/observations.json'];
const statusResourceFiles=['tests/reference/status-transition/server.ts','tests/reference/status-transition/behaviors.ts','tests/reference/status-transition/db.ts','tests/reference/status-transition/seed.ts','tests/reference/status-transition/mapping.json','tests/reference/status-transition/suite-manifest.json','tests/reference/status-transition/tsconfig.json','tests/fixtures/status-transition-observations.json','tests/fixtures/status-transition-template.json'];
const legacyResourcePaths=[...resourceFiles,'tests/reference/suite-lock.json'];
const currentResourcePaths=[...legacyResourcePaths,'tests/reference/tsconfig.json',...statusResourceFiles,'tests/reference/status-transition/suite-lock.json'];
async function frozenResources(directory,lockPath,allowed){
  await noLinks(join(directory,lockPath));
  const lock=JSON.parse(await readFile(join(directory,lockPath),'utf8'));
  if(!lock||Array.isArray(lock)||Object.keys(lock).length!==allowed.length||Object.keys(lock).some(path=>!allowed.includes(path))||Object.values(lock).some(value=>typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)))throw new Error('INVALID_RESOURCE_FILES');
  for(const path of allowed){await noLinks(join(directory,path));if(hash(await readFile(join(directory,path)))!==lock[path])throw new Error('REFERENCE_CHANGED_REVIEW_REQUIRED');}
  return lock;
}
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
  'packages/contracts/types.ts','packages/contracts/validate.ts','packages/contracts/discovery.ts','packages/contracts/status-transition.ts','packages/contracts/tsconfig.json',
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
  if(!manifest||manifest.schemaVersion!==1||!Array.isArray(manifest.files)||manifest.formatVersions!==undefined&&(!manifest.formatVersions||['delivery','contracts','verificationPackage'].some(key=>manifest.formatVersions[key]!==1)))throw new Error('MANIFEST_VERSION');
  const expected=new Set(['delivery-manifest.json']);
  for(const file of manifest.files){
    if(typeof file?.path!=='string'||file.path.includes('\\')||file.path.startsWith('/')||file.path.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))||/[\x00-\x1f:*?"<>|]/.test(file.path)||expected.has(file.path))throw new Error('INVALID_MANIFEST_PATH');
    if(!Number.isSafeInteger(file.bytes)||file.bytes<0||typeof file.sha256!=='string'||!/^[a-f0-9]{64}$/.test(file.sha256))throw new Error('INVALID_MANIFEST_FILE');
    expected.add(file.path);
    const full=join(directory,file.path);
    if((await lstat(full)).isSymbolicLink())throw new Error('SYMLINK_REJECTED');
    const bytes=await readFile(full);
    if(hash(bytes)!==file.sha256||bytes.length!==file.bytes)throw new Error('HASH_MISMATCH:'+file.path);
  }
  for(const path of actual)if(!expected.has(path))throw new Error('UNEXPECTED_FILE:'+path);
  return manifest;
}
export async function buildPackage(){return buildDelivery(false);}
/** Explicit development artifact: never manufacture or claim a native core. */
export async function buildSourcePackage(){return buildDelivery(true);}
async function buildDelivery(sourceOnly){
  const parent=join(root,'output/delivery');await noLinks(parent);await mkdir(parent,{recursive:true});
  const directory=await mkdtemp(join(parent,'website-verification-'));
  const manifest={schemaVersion:1,product:'AI开发网站验证系统',version:'0.0.0-t9-preview',platform:'win32-x64',createdAt:new Date().toISOString(),
    formatVersions:{delivery:1,contracts:1,verificationPackage:1},
    packagingEnvironment:packagingEnvironment(),
    dependencies:{node:'24.x',npm:'11.x',cangjie:'1.0.5',stdx:'1.0.5.1',k6:'2.3.0',npmLockSha256:hash(await readFile(join(root,'package-lock.json')))},
    limits:['其他电脑兼容性未验证','真实模型与实际人工双审核尚未验收','不包含用户配置、凭据、历史运行及业务数据库'],files:[]};
  if(sourceOnly){manifest.kind='source-development-delivery';manifest.coreBuilt=false;manifest.limits.push('仅源码开发交付；未包含原生仓颉核心，正式执行前须构建并验收');}
  const selected=files.filter(path=>!sourceOnly||path!=='apps/core/target/verification-core.exe');
  for(const tree of trees)for(const file of await walk(join(root,tree))){
    const allowed=tree.endsWith('/src')?/\.(?:ts|tsx|css|cj)$/:/\.(?:js|ts|css|html|json|svg)$/;
    if(allowed.test(file)&&!file.startsWith('fixture-check.')&&!file.startsWith('fixtures/'))selected.push(tree+'/'+file);
  }
  for(const sample of ['ticket','registration','status-ticket']){
    for(const name of ['package.json','verification.json','tsconfig.json'])selected.push(`samples/${sample}/${name}`);
    if(sample==='status-ticket')selected.push(`samples/${sample}/README.md`);
    for(const file of await walk(join(root,`samples/${sample}/src`)))if(file.endsWith('.ts'))selected.push(`samples/${sample}/src/${file}`);
  }
  for(const path of selected.sort()){
    await noLinks(join(root,path));
    const target=join(directory,path);await mkdir(resolve(target,'..'),{recursive:true});await copyFile(join(root,path),target);
  }
  for(const path of ['docs/delivery-guide.md','docs/demo-outline.md','docs/evidence/release-check.md','tests/reference/suite-manifest.json'])await noLinks(join(root,path));
  const guide=await readFile(join(root,'docs/delivery-guide.md'),'utf8');
  await writeFile(join(directory,'README.md'),(sourceOnly?'# 源码开发交付：未构建原生核心\n\n本目录未包含 verification-core.exe。源码分析可使用已构建的宿主组件；正式执行、候选准入及复跑须先在原生 Windows 环境安装开发依赖并运行 npm run build:core，完成相应验收。此交付不代表正式发布或验收通过。\n\n':'')+guide);
  await mkdir(join(directory,'docs'));await copyFile(join(root,'docs/demo-outline.md'),join(directory,'docs/demo-outline.md'));
  await copyFile(join(root,'docs/evidence/release-check.md'),join(directory,'docs/release-check.md'));
  const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  pkg.scripts=Object.fromEntries(Object.entries(pkg.scripts).filter(([key])=>['doctor','start','build:core','build:host','build:ui','build:contracts','build:sample'].includes(key)));
  pkg.scripts.check='npm run build:contracts && npm run build:host && npm run build:sample && npm run build:core && npm run build:ui';
  await writeFile(join(directory,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  const config=JSON.parse(await readFile(join(root,'packages/contracts/tsconfig.json'),'utf8'));config.include=['types.ts','validate.ts','discovery.ts','status-transition.ts'];
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
  await frozenResources(root,'tests/reference/suite-lock.json',resourceFiles);
  await frozenResources(root,'tests/reference/status-transition/suite-lock.json',statusResourceFiles);
  const parent=join(root,'output/delivery');await noLinks(parent);await mkdir(parent,{recursive:true});
  const directory=await mkdtemp(join(parent,'developer-resources-'));
  const manifest={schemaVersion:1,kind:'developer-validation-resources',version:'reference-v2',packagingEnvironment:packagingEnvironment(),runtime:'Node.js 24 native TypeScript execution; no emitted JavaScript required',build:'npm ci --ignore-scripts && node node_modules/typescript/bin/tsc -p tests/reference/tsconfig.json && node node_modules/typescript/bin/tsc -p tests/reference/status-transition/tsconfig.json',files:[]};
  for(const path of currentResourcePaths.sort()){
    await noLinks(join(root,path));
    const bytes=await readFile(join(root,path));
    const target=join(directory,path);await mkdir(resolve(target,'..'),{recursive:true});await writeFile(target,bytes);
    manifest.files.push({path,bytes:bytes.length,sha256:hash(bytes)});
  }
  await writeFile(join(directory,'delivery-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await verifyPackage(directory);
  await frozenResources(directory,'tests/reference/suite-lock.json',resourceFiles);
  await frozenResources(directory,'tests/reference/status-transition/suite-lock.json',statusResourceFiles);
  return directory;
}
export async function installDeveloperResources(resources,directory){
  const manifest=await verifyPackage(resources);
  if(manifest.kind!=='developer-validation-resources')throw new Error('WRONG_RESOURCE_KIND');
  if(!['reference-v1','reference-v2'].includes(manifest.version))throw new Error('RESOURCE_VERSION');
  const allowed=new Set(manifest.version==='reference-v1'?legacyResourcePaths:currentResourcePaths);
  if(manifest.files.length!==allowed.size||manifest.files.some(f=>!allowed.has(f.path)))throw new Error('INVALID_RESOURCE_FILES');
  await frozenResources(resources,'tests/reference/suite-lock.json',resourceFiles);
  if(manifest.version==='reference-v2')await frozenResources(resources,'tests/reference/status-transition/suite-lock.json',statusResourceFiles);
  for(const file of manifest.files){
    await noLinks(join(directory,file.path));
    try{if((await lstat(join(directory,file.path))).isSymbolicLink()||hash(await readFile(join(directory,file.path)))!==file.sha256)throw new Error('INSTALL_CONFLICT:'+file.path);}
    catch(e){if(e.code!=='ENOENT')throw e;}
  }
  for(const file of manifest.files){
    const target=join(directory,file.path);await noLinks(target);await mkdir(resolve(target,'..'),{recursive:true});await noLinks(target);
    await noLinks(join(resources,file.path));
    try{await copyFile(join(resources,file.path),target,constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST'||hash(await readFile(target))!==file.sha256)throw e;}
    await noLinks(target);if(hash(await readFile(target))!==file.sha256)throw new Error('HASH_MISMATCH:'+file.path);
  }
  // A successful copy is not a successful installation: recheck the final
  // target set and its private frozen resources before reporting completion.
  for(const file of manifest.files){const target=join(directory,file.path);await noLinks(target);const bytes=await readFile(target);if(hash(bytes)!==file.sha256||bytes.length!==file.bytes)throw new Error('HASH_MISMATCH:'+file.path);}
  await frozenResources(directory,'tests/reference/suite-lock.json',resourceFiles);
  if(manifest.version==='reference-v2')await frozenResources(directory,'tests/reference/status-transition/suite-lock.json',statusResourceFiles);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='--verify')console.log(JSON.stringify(await verifyPackage(resolve(process.argv[3]))));
    else if(process.argv[2]==='--install-resources'){await installDeveloperResources(resolve(process.argv[3]),resolve(process.argv[4]??root));console.log('Developer validation resources installed');}
    else if(process.argv[2]==='--source-only')console.log(JSON.stringify({sourceDevelopment:await buildSourcePackage(),developerResources:await buildDeveloperResources()}));
    else if(process.argv[2])throw new Error('UNKNOWN_PACKAGE_OPTION');
    else console.log(JSON.stringify({runtime:await buildPackage(),developerResources:await buildDeveloperResources()}));
  }
  catch(error){console.error(error.message);process.exitCode=1;}
}
