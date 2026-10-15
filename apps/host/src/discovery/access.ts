import {resolve} from 'node:path';
import {noSourceLinks} from '../projects/inspect.js';
import {sourcePath,blockedSourcePath,isToolPrivate,isProjectTest,readIndexedFile,sourceHash,sourceLines} from './index.js';
import {SourceAccessError,sourceLimits,validateDiscoveryContract,type SourceSnapshot,type AnalysisScope,type SourceFile,type SourceExcerpt,type SourceRef,type SourceMatch} from '@website-verification/contracts/discovery';

type ScopeInput=Pick<AnalysisScope,'allowedPaths'|'excludedPaths'|'includeProjectTests'|'serviceUrl'>;
const scopeContent=(s:AnalysisScope|Omit<AnalysisScope,'scopeHash'>)=>({projectId:s.projectId,snapshotId:s.snapshotId,allowedPaths:s.allowedPaths,excludedPaths:s.excludedPaths,includeProjectTests:s.includeProjectTests,serviceUrl:s.serviceUrl});
/** Local read boundary; cloud sending consent is a separate S2 responsibility. */
export function createAnalysisScope(snapshot:SourceSnapshot,input:ScopeInput):AnalysisScope {
  const normalize=(paths:string[])=>[...new Set(paths.map(p=>sourcePath(p,true).toLowerCase()))].sort();
  if(!Array.isArray(input.allowedPaths)||!Array.isArray(input.excludedPaths)||typeof input.includeProjectTests!=='boolean')throw new SourceAccessError('INVALID_SCOPE','读取范围无效。');
  let serviceUrl:string;try{const url=new URL(input.serviceUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error();serviceUrl=url.href}catch{throw new SourceAccessError('INVALID_SCOPE','服务地址无效。')}
  const scope={projectId:snapshot.projectId,snapshotId:snapshot.id,allowedPaths:normalize(input.allowedPaths),excludedPaths:normalize(input.excludedPaths),includeProjectTests:input.includeProjectTests,serviceUrl};
  const result={...scope,scopeHash:sourceHash(JSON.stringify(scopeContent(scope)))};
  if(!validateDiscoveryContract('AnalysisScope',result).valid)throw new SourceAccessError('INVALID_SCOPE','至少需要一个允许目录或文件。');
  return result;
}
export function validateScope(snapshot:SourceSnapshot,scope:AnalysisScope):void {
  if(!validateDiscoveryContract('AnalysisScope',scope).valid||scope.snapshotId!==snapshot.id||scope.projectId!==snapshot.projectId||sourceHash(JSON.stringify(scopeContent(scope)))!==scope.scopeHash)throw new SourceAccessError('INVALID_SCOPE','范围内容或项目已变化，请重新核对。');
}
const matches=(path:string,entries:string[])=>entries.some(p=>p==='.'||path===p||path.startsWith(p+'/'));
function allowed(scope:AnalysisScope,path:string):boolean {
  const normalized=path.toLowerCase();return matches(normalized,scope.allowedPaths)&&!matches(normalized,scope.excludedPaths)&&(scope.includeProjectTests||!isProjectTest(normalized));
}
export function scopedSourceFiles(snapshot:SourceSnapshot,scope:AnalysisScope):SourceFile[]{
  validateScope(snapshot,scope);
  return snapshot.files.filter(file=>allowed(scope,file.path)&&!blockedSourcePath(file.path)&&!isToolPrivate(resolve(snapshot.root,file.path)))
    .map(file=>({...structuredClone(file),imports:file.imports.map(link=>({...link,...(link.resolvedPath&&!allowed(scope,link.resolvedPath)?{resolvedPath:undefined}:{})}))}));
}
async function fileFor(snapshot:SourceSnapshot,scope:AnalysisScope,input:string):Promise<SourceFile>{
  validateScope(snapshot,scope);const path=sourcePath(input),full=resolve(snapshot.root,path);
  if(blockedSourcePath(path)||isToolPrivate(full))throw new SourceAccessError('SENSITIVE_FILE','该文件被永久排除。');
  if(!allowed(scope,path))throw new SourceAccessError('SCOPE_NOT_ALLOWED','该路径未获读取授权。');
  // Inspect links even when the requested path has no snapshot entry.
  try{await noSourceLinks(full)}catch(e){if(e instanceof Error&&e.message.startsWith('PATH_ESCAPE'))throw new SourceAccessError('PATH_ESCAPE','路径含链接。')}
  const file=snapshot.files.find(f=>f.path.toLowerCase()===path.toLowerCase());
  if(!file){const issue=snapshot.indexIssues.find(i=>i.path.toLowerCase()===path.toLowerCase());throw new SourceAccessError(issue?.code==='SENSITIVE_FILE'?'SENSITIVE_FILE':'SOURCE_NOT_INDEXED','文件未进入可读快照，请核对排除原因。')}
  return file;
}
export async function readExcerpt(snapshot:SourceSnapshot,scope:AnalysisScope,path:string,startLine:number,endLine:number):Promise<SourceExcerpt>{
  const file=await fileFor(snapshot,scope,path),text=await readIndexedFile(snapshot,file),lines=sourceLines(text);
  if(!Number.isSafeInteger(startLine)||!Number.isSafeInteger(endLine)||startLine<1||endLine<startLine||endLine>lines.length)throw new SourceAccessError('INVALID_LINE_RANGE','行号超出文件；请使用有效且更小的行区间。');
  const excerpt=lines.slice(startLine-1,endLine).join('\n'),bytes=Buffer.byteLength(excerpt,'utf8');
  if(bytes>sourceLimits.excerptBytes)throw new SourceAccessError('EXCERPT_TOO_LARGE','片段超过8192字节；请缩小行区间。');
  return {text:excerpt,bytes,ref:{snapshotId:snapshot.id,path:file.path,fileHash:file.hash,startLine,endLine,excerptHash:sourceHash(excerpt)}};
}
export async function searchSource(snapshot:SourceSnapshot,scope:AnalysisScope,query:string,limit=20):Promise<SourceMatch[]>{
  validateScope(snapshot,scope);
  if(typeof query!=='string'||!query.trim()||query.length>256||query.includes('\n')||!Number.isSafeInteger(limit)||limit<1)throw new SourceAccessError('INVALID_QUERY','需要非空的单行字面查询和正整数限额。');
  const matches:SourceMatch[]=[],cap=Math.min(limit,sourceLimits.searchResults);
  for(const file of snapshot.files){
    if(!allowed(scope,file.path)||blockedSourcePath(file.path)||isToolPrivate(resolve(snapshot.root,file.path)))continue;
    const lines=sourceLines(await readIndexedFile(snapshot,file));
    for(let i=0;i<lines.length;i++){const column=lines[i]!.indexOf(query);if(column>=0){matches.push({path:file.path,fileHash:file.hash,line:i+1,column:column+1});if(matches.length===cap)return matches;}}
  }
  return matches;
}
/** reads must come from the host-owned reading log, never a model-supplied log. */
export async function validateSourceRefs(snapshot:SourceSnapshot,reads:SourceExcerpt[],refs:SourceRef[]):Promise<{valid:boolean;issues:{path:string;code:string;detail:string}[]}>{
  const issues:{path:string;code:string;detail:string}[]=[];
  for(const ref of refs){
    const invalid=()=>issues.push({path:ref?.path??'',code:'INVALID_SOURCE_REF',detail:'引用必须精确匹配宿主实际读取的片段、版本和行区间。'});
    if(!validateDiscoveryContract('SourceRef',ref).valid||ref.snapshotId!==snapshot.id){invalid();continue;}
    const read=reads.find(r=>['snapshotId','path','fileHash','startLine','endLine','excerptHash'].every(k=>r.ref[k as keyof SourceRef]===ref[k as keyof SourceRef]));
    const file=snapshot.files.find(f=>f.path===ref.path);
    if(!read||!file||file.hash!==ref.fileHash||sourceHash(read.text)!==ref.excerptHash||Buffer.byteLength(read.text)!==read.bytes||read.bytes>(read.kind==='full-file'?65536:sourceLimits.excerptBytes)){invalid();continue;}
    try{
      const text=await readIndexedFile(snapshot,file),lines=sourceLines(text);
      if(ref.endLine>lines.length||(read.kind==='full-file'?(ref.startLine!==1||ref.endLine!==lines.length||text!==read.text):lines.slice(ref.startLine-1,ref.endLine).join('\n')!==read.text))invalid();
    }catch(e){issues.push({path:ref.path,code:e instanceof SourceAccessError?e.code:'STALE_SOURCE',detail:'源码或路径已变化；建立新快照并重新读取。'})}
  }
  return {valid:issues.length===0,issues};
}
