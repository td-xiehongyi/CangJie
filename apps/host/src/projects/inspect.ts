import {readFile,readdir,realpath,lstat,open} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname,basename,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {validateMapping,type HttpMapping} from '../execution/mapping.js';
import {databaseTargetsUseTestEnvironment} from './database-target.js';
import ts from 'typescript';

export interface Gap {code:string;detail:string;affectedChecks:string[]}
export interface ProjectManifest {
  schemaVersion:1;name:string;start:{argv:string[]};
  initialization?:{argv:string[];version:string;source:'synthetic';databaseEnv:'TEST_DATABASE';localOnly:true;externalServices:string[]};
  healthPath:string;actors:{actorRef:string;role:string}[];mapping:HttpMapping;
}
export interface ProjectProfile {
  root:string;name:string;sourceHash:string;files:{path:string;hash:string}[];
  supported:boolean;gaps:Gap[];gapMarkdown:string;initialization:ProjectManifest['initialization'];
  manifest:ProjectManifest;mapping:HttpMapping;
}
export function digest(value:unknown):string{return createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');}
export function within(root:string,path:string):string{const full=resolve(root,path),rel=relative(resolve(root),full);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('PATH_ESCAPE');return full;}
/** Shared bounded, link-rejecting read. Does not relax the legacy run/copy file policy. */
export async function noSourceLinks(path:string):Promise<void>{
  const ancestors:string[]=[];for(let current=resolve(path);;current=dirname(current)){ancestors.unshift(current);if(dirname(current)===current)break;}
  for(const current of ancestors)if((await lstat(current)).isSymbolicLink())throw new Error('PATH_ESCAPE: symbolic links are not supported');
}
export async function readSourceFile(root:string,path:string,maxBytes=2*1024*1024):Promise<Buffer>{
  const full=within(root,path);await noSourceLinks(full);
  within(await realpath(root),await realpath(full));
  const before=await lstat(full);if(!before.isFile())throw new Error('PATH_ESCAPE');if(before.size>maxBytes)throw new Error('SOURCE_FILE_TOO_LARGE');
  const handle=await open(full,'r');
  try{
    const opened=await handle.stat();if(opened.dev!==before.dev||opened.ino!==before.ino)throw new Error('STALE_SOURCE');
    const data=Buffer.alloc(Math.min(opened.size+1,maxBytes+1));let length=0;
    while(length<data.length){const next=await handle.read(data,length,data.length-length,length);if(!next.bytesRead)break;length+=next.bytesRead;}
    const after=await handle.stat();await noSourceLinks(full);const final=await lstat(full);within(await realpath(root),await realpath(full));
    if(length>maxBytes)throw new Error('SOURCE_FILE_TOO_LARGE');
    if(after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs||final.dev!==opened.dev||final.ino!==opened.ino)throw new Error('STALE_SOURCE');
    return data.subarray(0,length);
  }finally{await handle.close();}
}
const ignoredDirs=new Set(['node_modules','.git','.local-data','.local-tools','dist','target']);
const forbidden=/(^\.env($|\.)|\.(?:sqlite|sqlite3|db|db3)(?:[-.].*)?$|\.(?:bak|backup|zip|7z|tar|gz|pem|key|pfx|p12)$|credential|secret|^\.npmrc$)/i;
export async function sourceFiles(root:string):Promise<{path:string;hash:string}[]> {
  const files:{path:string;hash:string}[]=[];
  async function visit(dir:string):Promise<void>{for(const ent of await readdir(dir,{withFileTypes:true})){
    const full=within(root,resolve(dir,ent.name));
    if(ent.isSymbolicLink())throw new Error('PATH_ESCAPE: symbolic links are not supported');
    if(ent.isDirectory()){if(!ignoredDirs.has(ent.name))await visit(full);continue;}
    if(!ent.isFile()||forbidden.test(ent.name)||!['.ts','.js','.mjs','.cjs','.json','.md','.txt'].includes(extname(ent.name)))continue;
    const info=await lstat(full);if(info.size>2*1024*1024)throw new Error('SOURCE_FILE_TOO_LARGE');
    const data=await readSourceFile(root,full);if(data.subarray(0,16).toString()==='SQLite format 3\0')continue;
    files.push({path:relative(root,full),hash:createHash('sha256').update(data).digest('hex')});
  }}
  await visit(root);return files.sort((a,b)=>a.path.localeCompare(b.path));
}
function argvSafe(root:string,argv:unknown,files:{path:string}[]):boolean{
  if(!Array.isArray(argv)||argv.length!==1||typeof argv[0]!=='string'||isAbsolute(argv[0])||!['.ts','.js','.mjs','.cjs'].includes(extname(argv[0])))return false;
  const full=within(root,argv[0]);return files.some(f=>resolve(root,f.path)===full);
}
export async function inspectProject(input:string):Promise<ProjectProfile> {
  const root=await realpath(input);const stat=await lstat(input);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('PATH_ESCAPE');
  const files=await sourceFiles(root),gaps:Gap[]=[];
  let manifest:ProjectManifest;
  try{manifest=JSON.parse(await readFile(resolve(root,'verification.json'),'utf8')) as ProjectManifest;if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw new Error();}catch{manifest={schemaVersion:1,name:basename(root),start:{argv:[]},healthPath:'/health',actors:[],mapping:{} as HttpMapping};}
  const gap=(code:string,detail:string)=>gaps.push({code,detail,affectedChecks:['data-dependent checks']});
  try{validateMapping(manifest.mapping);if(!manifest.healthPath.startsWith('/')||manifest.healthPath.startsWith('//'))throw new Error();}catch{gap('HTTP_MAPPING_GAP','需要可核对的本机 HTTP 路径、账号身份字段、结果绑定和查询完整性字段。');}
  if(manifest.schemaVersion!==1||!Array.isArray(manifest.actors)||!manifest.actors.length)gap('PROJECT_CONFIG_GAP','需要已确认的 Node 启动入口、普通测试账号角色和 HTTP 映射。');
  try{if(!argvSafe(root,manifest.start?.argv,files))gap('STARTUP_GAP','需要不含 shell/动态代码的显式 Node argv。');}catch{gap('PATH_ESCAPE','启动/初始化入口必须位于项目源码目录。');}
  const init=manifest.initialization;
  if(!init)gap('INITIALIZATION_GAP','缺少已有专用测试初始化入口；不生成脚本或修改被测源码。');
  else{
    try{if(!argvSafe(root,init.argv,files))gap('INITIALIZATION_GAP','已有初始化入口不可运行或不在副本内。');}catch{gap('PATH_ESCAPE','初始化路径越出测试副本。');}
    if(init.source!=='synthetic'||init.databaseEnv!=='TEST_DATABASE'||init.localOnly!==true||!Array.isArray(init.externalServices)||init.externalServices.length||!init.version)gap('UNSAFE_INITIALIZATION_TARGET','初始化须明确使用独立测试库、合成数据和无外部服务的已核对配置。');
  }
  // Check the declared runtime dependency closure; standalone developer launchers never run in a test copy.
  const runtimeModules=new Set(['fs','fs/promises','path','url','crypto','sqlite']);
  const runtime=new Set<string>(),pending=[...(Array.isArray(manifest.start?.argv)?manifest.start.argv:[]),...(Array.isArray(init?.argv)?init.argv:[])].filter(v=>typeof v==='string').map(v=>resolve(root,v)),indexed=new Map(files.map(f=>[resolve(root,f.path),f]));
  while(pending.length){
    const file=pending.pop()!;if(runtime.has(file))continue;runtime.add(file);
    if(!indexed.has(file)){gap('UNSAFE_INITIALIZATION_TARGET','运行依赖不在已索引的项目源码内。');continue;}
    if(!['.ts','.js','.mjs','.cjs'].includes(extname(file)))continue;
    const source=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true),imports:string[]=[];
    const visit=(node:ts.Node):void=>{
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))imports.push(node.moduleSpecifier.text);
      if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){if(node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]!))imports.push(node.arguments[0]!.text);else gap('UNSAFE_INITIALIZATION_TARGET','运行入口含无法静态核对的动态依赖。');}
      ts.forEachChild(node,visit);
    };visit(source);
    for(const specifier of imports){
      if(!specifier.startsWith('.')){if(!runtimeModules.has(specifier.replace(/^node:/,''))&&specifier!=='express')gap('UNSAFE_INITIALIZATION_TARGET','运行依赖仅支持已核对的Node文件、路径、标识、测试数据库模块和Express。');continue;}
      const target=resolve(dirname(file),specifier),resolved=[target,...['.ts','.js','.mjs','.cjs'].map(extension=>target+extension)].find(path=>indexed.has(path));
      if(resolved)pending.push(resolved);else gap('UNSAFE_INITIALIZATION_TARGET','运行依赖无法在项目源码内解析。');
    }
  }
  // Conservative support check, not a malicious-code sandbox or a network isolation claim.
  for(const f of files.filter(f=>runtime.has(resolve(root,f.path))&&['.ts','.js','.mjs','.cjs'].includes(extname(f.path)))){
    const text=await readFile(resolve(root,f.path),'utf8');
    if(!databaseTargetsUseTestEnvironment(resolve(root,f.path))||/https?:\/\/|(?:node:)?child_process|\b(?:eval|require|createRequire|getBuiltinModule|mainModule)\b|process\.env\.(?:DATABASE_URL|DB_URL|DATABASE_PATH|DB_PATH)/i.test(text)||/\bFunction\b/.test(text))gap('UNSAFE_INITIALIZATION_TARGET',`源码 ${f.path} 的数据库目标无法确认来自专用测试配置，或存在外部地址/未支持的动态代码和后台进程依赖，需先调整并重新接入。`);
  }
  try{const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));if(!pkg.dependencies?.express||!/^([~^]?5\.)/.test(pkg.dependencies.express))gap('DEPENDENCY_GAP','首版要求 Express 5 和 Node 24。');const unsupported=Object.keys(pkg.dependencies??{}).filter(k=>k!=='express');if(unsupported.length)gap('DEPENDENCY_GAP',`需提供并核对额外依赖：${unsupported.join(', ')}。`);}catch{gap('DEPENDENCY_GAP','缺少可核对的 package.json。');}
  const gapMarkdown=gaps.length?`# 测试初始化补充说明\n\n状态：尚未验证（环境受阻），不是业务通过或失败。\n\n${gaps.map(g=>`- ${g.code}：${g.detail}`).join('\n')}\n\n需补齐：测试账号及角色、数据归属与规模、初始状态、独立测试目标、已有初始化和复位入口。\n受影响：依赖该数据的实验；独立且条件齐全的项目实验可单独准备。\n验收：重新读取源码与入口，核对目标、合成数据和版本，确认后初始化成功、HTTP 身份与基线检查通过。生成本说明或口头称已修复均不解除阻塞。\n`:'';
  return {root,name:manifest.name??basename(root),sourceHash:digest(files),files,supported:gaps.length===0,gaps,gapMarkdown,initialization:init,manifest,mapping:manifest.mapping};
}
