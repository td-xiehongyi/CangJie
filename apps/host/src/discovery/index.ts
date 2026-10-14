import {readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import ts from 'typescript';
import {noSourceLinks,readSourceFile} from '../projects/inspect.js';
import {SourceAccessError,sourceLimits,type SourceSnapshot,type SourceFile,type SourceIssue} from '@website-verification/contracts/discovery';

export const sourceHash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export const sourceLines=(text:string)=>text.split(/\r\n|\n|\r/);
export function sourcePath(input:string,allowRoot=false):string {
  if(typeof input!=='string'||!input||input.includes('\0')||/[:*?"<>|]/.test(input)||/^[\\/]/.test(input))throw new SourceAccessError('PATH_ESCAPE','必须使用项目内相对路径。');
  const parts=input.replaceAll('\\','/').split('/');
  if(parts.some(p=>p==='..'||p!=='.'&&(!p||/[. ]$/.test(p)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))))throw new SourceAccessError('PATH_ESCAPE','路径含越界或不支持的 Windows 名称。');
  const result=parts.filter(p=>p!=='.').join('/');
  if(!result&&!allowRoot)throw new SourceAccessError('PATH_ESCAPE','需要文件相对路径。');
  return result||'.';
}
const toolRoot=fileURLToPath(new URL('../../../../',import.meta.url));
const privateTrees=['tests','templates','.local-data','output/delivery'].map(p=>resolve(toolRoot,p).toLowerCase());
export function isToolPrivate(full:string):boolean {
  return privateTrees.some(tree=>{const rel=relative(tree,resolve(full).toLowerCase());return !rel||rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel)});
}
const deniedDirs=new Set(['node_modules','.git','.svn','.hg','.aws','.codex','.agents','.local-data','.local-tools','dist','build','out','target','coverage','.next','.nuxt','.cache','.turbo','private-answers','heldout','held-out','reference-sources','developer-validation-resources','validation-resources']);
const sensitive=/(^\.env(?:$|\.)|^\.npmrc$|^\.netrc$|credential|secret|password|passwd|api[-_]?key|private[-_]?answer|suite[-_](?:lock|manifest)|\.(?:sqlite|sqlite3|db|db3)(?:[-.].*)?$|\.(?:bak|backup|zip|7z|tar|gz|pem|key|pfx|p12)$)/i;
export function blockedSourcePath(path:string):boolean{return path.split('/').some(part=>deniedDirs.has(part.toLowerCase())||sensitive.test(part))}
export function isProjectTest(path:string):boolean{return /(^|\/)(?:tests?|__tests__|__mocks__|fixtures)(\/|$)|\.(?:test|spec)\.[^/]+$/i.test(path)}
export function containsSecret(text:string):boolean {
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}|\b(?:password|passwd|api[_-]?key|token|secret|authorization)\b["'`]?\s*[=:]\s*["'`][^"'`\r\n]+["'`]/i.test(text);
}
export async function readIndexedFile(snapshot:SourceSnapshot,file:SourceFile):Promise<string>{
  try{
    const full=resolve(snapshot.root,file.path);
    if(blockedSourcePath(file.path)||isToolPrivate(full))throw new SourceAccessError('SENSITIVE_FILE','文件被排除。');
    const bytes=await readSourceFile(snapshot.root,full,sourceLimits.fileBytes);
    if(sourceHash(bytes)!==file.hash||bytes.length!==file.bytes)throw new SourceAccessError('STALE_SOURCE','源码已变化，请建立新快照。');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(text.includes('\0')||containsSecret(text))throw new SourceAccessError('SENSITIVE_FILE','正文含二进制或可识别秘密。');
    return text;
  }catch(e){
    if(e instanceof SourceAccessError)throw e;
    if(e instanceof Error&&e.message.startsWith('PATH_ESCAPE'))throw new SourceAccessError('PATH_ESCAPE','路径或链接已变化。');
    throw new SourceAccessError('STALE_SOURCE','文件无法按快照读取，请重新建立索引。');
  }
}
const languages:Record<string,string>={'.ts':'ts','.tsx':'tsx','.js':'js','.jsx':'jsx','.mjs':'js','.cjs':'js','.mts':'ts','.cts':'ts','.json':'json','.md':'markdown','.txt':'text'};
function syntax(file:SourceFile,text:string,issues:SourceIssue[]):void {
  if(!['ts','tsx','js','jsx'].includes(file.language))return;
  const parsed=ts.createSourceFile(file.path,text,ts.ScriptTarget.Latest,true,file.language==='tsx'?ts.ScriptKind.TSX:file.language==='jsx'?ts.ScriptKind.JSX:file.language==='js'?ts.ScriptKind.JS:ts.ScriptKind.TS);
  const line=(n:ts.Node)=>parsed.getLineAndCharacterOfPosition(n.getStart(parsed)).line+1;
  for(const d of (parsed as ts.SourceFile&{parseDiagnostics:readonly ts.Diagnostic[]}).parseDiagnostics)issues.push({path:file.path,code:'PARSE_ERROR',line:parsed.getLineAndCharacterOfPosition(d.start??0).line+1,detail:'语法解析失败，保留文本检索；不证明可运行。'});
  const exported=(node:ts.Node):boolean=>ts.canHaveModifiers(node)&&!!ts.getModifiers(node)?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
  const addSymbol=(node:ts.Node,name:ts.Node|undefined,kind:string,isExported=exported(node))=>{if(name&&ts.isIdentifier(name))file.symbols.push({name:name.text,kind,line:line(node),exported:isExported})};
  function visit(node:ts.Node):void {
    if(ts.isFunctionDeclaration(node)||ts.isClassDeclaration(node)||ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node)||ts.isEnumDeclaration(node))addSymbol(node,node.name,ts.SyntaxKind[node.kind]);
    if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations)addSymbol(d,d.name,'variable',exported(node));
    if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteralLike(node.moduleSpecifier))file.imports.push({specifier:node.moduleSpecifier.text,line:line(node),dynamic:false});
    if(ts.isExportDeclaration(node)&&node.exportClause&&ts.isNamedExports(node.exportClause))for(const e of node.exportClause.elements)file.symbols.push({name:e.name.text,kind:'export',line:line(e),exported:true});
    if(ts.isCallExpression(node)){
      if(node.expression.kind===ts.SyntaxKind.ImportKeyword){const arg=node.arguments[0];if(arg&&ts.isStringLiteralLike(arg))file.imports.push({specifier:arg.text,line:line(node),dynamic:true});else issues.push({path:file.path,code:'UNRESOLVED_IMPORT',line:line(node),detail:'动态 import 目标无法静态解析。'})}
      if(ts.isPropertyAccessExpression(node.expression)){
        const method=node.expression.name.text.toLowerCase(),receiver=node.expression.expression.getText(parsed),arg=node.arguments[0];
        if(['get','post','put','patch','delete','head','options','all','use','route'].includes(method)&&/^(?:app|router|server)$/.test(receiver)&&!(method==='get'&&node.arguments.length===1)){
          const literal=arg&&ts.isStringLiteralLike(arg)?arg.text:undefined;
          file.routes.push({receiver,method,line:line(node),resolved:literal!==undefined,...literal!==undefined?{path:literal}:{}});
          if(literal===undefined)issues.push({path:file.path,code:'UNRESOLVED_ROUTE',line:line(node),detail:'路由路径或挂载关系需运行时值，未推断路径。'});
        }
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(parsed);
}
export async function buildSourceSnapshot(input:string,projectId:string,options:{includeProjectTests?:boolean}={}):Promise<SourceSnapshot>{
  if(!projectId?.trim())throw new SourceAccessError('INVALID_PROJECT','需要项目标识。');
  if(isToolPrivate(input)||blockedSourcePath(resolve(input).replaceAll('\\','/')))throw new SourceAccessError('SENSITIVE_FILE','秘密、排除目录或工具独立验证资源不能作为源码根目录。');
  await noSourceLinks(input).catch(()=>{throw new SourceAccessError('PATH_ESCAPE','根目录或祖先路径含链接，或目录不可访问。')});
  const root=await realpath(input);if(!(await lstat(root)).isDirectory())throw new SourceAccessError('PATH_ESCAPE','需要真实源码目录。');
  const files:SourceFile[]=[],indexIssues:SourceIssue[]=[];let total=0,limited=false;
  async function visit(dir:string):Promise<void>{
    if(limited)return;
    for(const ent of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const full=resolve(dir,ent.name),path=relative(root,full).split(sep).join('/');
      if(ent.isSymbolicLink()){indexIssues.push({path,code:'PATH_ESCAPE',detail:'符号链接或目录联接不读取。'});continue;}
      if(blockedSourcePath(path)||isToolPrivate(full)){indexIssues.push({path,code:'SENSITIVE_FILE',detail:'秘密、依赖、构建产物或工具私有资源已排除。'});continue;}
      if(!options.includeProjectTests&&isProjectTest(path)){indexIssues.push({path,code:'PROJECT_TEST_EXCLUDED',detail:'项目测试未选为分析输入。'});continue;}
      try{
        sourcePath(path);
        if(ent.isDirectory()){await noSourceLinks(full);await visit(full);continue;}
        const language=languages[extname(path).toLowerCase()];if(!ent.isFile()||!language)continue;
        if(files.length>=sourceLimits.indexFiles||total+(await lstat(full)).size>sourceLimits.indexBytes){indexIssues.push({path,code:'INDEX_BUDGET_EXHAUSTED',detail:'索引达到本地文件数或字节上限，覆盖不完整。'});limited=true;break;}
        const bytes=await readSourceFile(root,full,sourceLimits.fileBytes);const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
        if(text.includes('\0')){indexIssues.push({path,code:'BINARY_SOURCE',detail:'二进制正文不索引。'});continue;}
        if(containsSecret(text)){indexIssues.push({path,code:'SENSITIVE_FILE',detail:'正文含可识别秘密，文件不索引或返回。'});continue;}
        const file:SourceFile={path,hash:sourceHash(bytes),bytes:bytes.length,language,lineCount:sourceLines(text).length,symbols:[],imports:[],routes:[]};
        syntax(file,text,indexIssues);files.push(file);total+=bytes.length;
      }catch(e){indexIssues.push({path,code:e instanceof TypeError?'BINARY_SOURCE':e instanceof Error?e.message.split(':')[0]!:'INDEX_READ_FAILED',detail:'未读取该文件或子目录；覆盖不完整。'})}
    }
  }
  await visit(root);files.sort((a,b)=>a.path.localeCompare(b.path));
  const paths=new Map(files.map(f=>[f.path.toLowerCase(),f.path]));
  for(const f of files)for(const link of f.imports){
    if(!link.specifier.startsWith('.'))continue;
    const base=relative(root,resolve(root,f.path,'..',link.specifier)).split(sep).join('/');
    const substitutions=/\.mjs$/i.test(base)?[base.replace(/\.mjs$/i,'.mts')]:/\.cjs$/i.test(base)?[base.replace(/\.cjs$/i,'.cts')]:/\.(?:js|jsx)$/i.test(base)?['.ts','.tsx'].map(ext=>base.replace(/\.(?:js|jsx)$/i,ext)):[];
    const candidates=[...substitutions,base,...(extname(base)?[]:[...['.ts','.tsx','.js','.jsx','.mts','.cts','.mjs','.cjs'].map(ext=>base+ext),...['ts','tsx','js','jsx'].map(ext=>base+'/index.'+ext)])];
    link.resolvedPath=candidates.map(p=>paths.get(p.toLowerCase())).find(Boolean);
    if(!link.resolvedPath)indexIssues.push({path:f.path,code:'UNRESOLVED_IMPORT',line:link.line,detail:'相对导入未命中允许范围内文件。'});
  }
  return {id:randomUUID(),projectId,root,sourceHash:sourceHash(JSON.stringify(files.map(({path,hash,bytes})=>({path,hash,bytes})))),files,indexIssues};
}
