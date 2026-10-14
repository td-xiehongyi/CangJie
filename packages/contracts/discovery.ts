/** Local source facts only. No business expectation or execution verdict is implied. */
export interface SourceSymbol {name:string;kind:string;line:number;exported:boolean}
export interface SourceImport {specifier:string;line:number;dynamic:boolean;resolvedPath?:string}
export interface SourceRoute {receiver:string;method:string;line:number;resolved:boolean;path?:string}
export interface SourceFile {
  path:string;hash:string;bytes:number;language:string;lineCount:number;
  symbols:SourceSymbol[];imports:SourceImport[];routes:SourceRoute[];
}
export interface SourceIssue {path:string;code:string;detail:string;line?:number}
export interface SourceSnapshot {id:string;projectId:string;root:string;sourceHash:string;files:SourceFile[];indexIssues:SourceIssue[]}
export interface SourceRef {snapshotId:string;path:string;fileHash:string;startLine:number;endLine:number;excerptHash:string}
export interface SourceExcerpt {text:string;bytes:number;ref:SourceRef}
export interface SourceMatch {path:string;fileHash:string;line:number;column:number}
export interface AnalysisScope {
  projectId:string;snapshotId:string;allowedPaths:string[];excludedPaths:string[];
  includeProjectTests:boolean;serviceUrl:string;scopeHash:string;confirmedAt?:string;
}
export interface DiscoveryStatement {text:string;sourceRefs:SourceRef[]}
export interface DiscoveryExpectation extends DiscoveryStatement {source:'documentation'|'project_test'|'ai_hypothesis';confirmation:'pending'}
export interface BusinessSuggestion {
  id:string;status:'suggestion';flow:string;facts:DiscoveryStatement[];expectations:DiscoveryExpectation[];risks:DiscoveryStatement[];
  openQuestions:string[];sourceRefs:SourceRef[];priorityReason:string;operationNeeds:string[];observationNeeds:string[];
}
export interface BusinessOverview {
  summary:string;objects:string[];roles:string[];
  flows:{name:string;roles:string[];steps:string[];data:string[];sourceRefs:SourceRef[]}[];
  sourceRefs:SourceRef[];suggestions:BusinessSuggestion[];limitations:string[];unresolved:string[];
}
export interface DiscoverySession {
  id:string;projectId:string;revision:number;snapshotId:string;scopeHash:string;
  status:'draft'|'running'|'partial'|'completed'|'paused'|'stale'|'failed';
  budget:{calls:number;tokens:number;startedAt:number;inputBytes:number;sourceBytes:number};
  reads:SourceExcerpt[];audit:Record<string,unknown>[];rounds:{actions:unknown[];results:unknown[]}[];
  pendingResponse?:unknown;result?:BusinessOverview;unresolved:string[];selectedSuggestionId?:string;
  referencesValid:boolean;ownerPid?:number;
}
export const sourceLimits={excerptBytes:8192,fileBytes:2*1024*1024,searchResults:20,indexFiles:10000,indexBytes:64*1024*1024} as const;
export class SourceAccessError extends Error {
  constructor(public code:string,detail:string){super(`${code}: ${detail}`);this.name='SourceAccessError';}
}
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const string=(x:unknown):x is string=>typeof x==='string'&&x.length>0;
const integer=(x:unknown,min=0)=>Number.isSafeInteger(x)&&Number(x)>=min;
const hash=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const path=(x:unknown)=>typeof x==='string'&&x.length>0&&!x.includes('\\')&&!x.includes(':')&&!x.includes('\0')&&!x.startsWith('/')&&x.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[. ]$/.test(p));
const list=(x:unknown,check:(v:any)=>boolean):boolean=>Array.isArray(x)&&x.every(check);
const strings=(x:unknown)=>list(x,v=>typeof v==='string'&&v.length<=8000);
const ref=(v:any)=>object(v)&&string(v.snapshotId)&&path(v.path)&&hash(v.fileHash)&&integer(v.startLine,1)&&integer(v.endLine,Number(v.startLine))&&hash(v.excerptHash);
const file=(v:any)=>object(v)&&path(v.path)&&hash(v.hash)&&integer(v.bytes)&&string(v.language)&&integer(v.lineCount,1)
  &&list(v.symbols,s=>object(s)&&string(s.name)&&string(s.kind)&&integer(s.line,1)&&typeof s.exported==='boolean')
  &&list(v.imports,s=>object(s)&&string(s.specifier)&&integer(s.line,1)&&typeof s.dynamic==='boolean'&&(s.resolvedPath===undefined||path(s.resolvedPath)))
  &&list(v.routes,s=>object(s)&&string(s.receiver)&&string(s.method)&&integer(s.line,1)&&typeof s.resolved==='boolean'&&(s.resolved?typeof s.path==='string':s.path===undefined));
export function validBusinessOverview(v:unknown):v is BusinessOverview {
  const refs=(x:unknown)=>Array.isArray(x)&&x.length>0&&x.length<=64&&x.every(ref);
  const statement=(x:any)=>object(x)&&string(x.text)&&x.text.length<=8000&&refs(x.sourceRefs);
  return object(v)&&string(v.summary)&&strings(v.objects)&&strings(v.roles)&&refs(v.sourceRefs)
    &&list(v.flows,f=>object(f)&&string(f.name)&&strings(f.roles)&&strings(f.steps)&&strings(f.data)&&refs(f.sourceRefs))&&(v.flows as unknown[]).length>0
    &&list(v.suggestions,s=>object(s)&&string(s.id)&&string(s.flow)&&s.status==='suggestion'&&list(s.facts,statement)&&(s.facts as unknown[]).length>0
      &&list(s.expectations,e=>statement(e)&&['documentation','project_test','ai_hypothesis'].includes(e.source)&&e.confirmation==='pending')
      &&list(s.risks,statement)&&strings(s.openQuestions)&&refs(s.sourceRefs)&&string(s.priorityReason)&&strings(s.operationNeeds)&&strings(s.observationNeeds))
    &&new Set((v.suggestions as BusinessSuggestion[]).map(s=>s.id)).size===(v.suggestions as unknown[]).length&&strings(v.limitations)&&strings(v.unresolved);
}
export function validateDiscoveryContract(name:'SourceSnapshot'|'SourceRef'|'SourceExcerpt'|'AnalysisScope',value:unknown):{valid:boolean;issues:{path:string;code:string}[]} {
  let valid=false;
  if(object(value)){
    if(name==='SourceRef')valid=ref(value);
    if(name==='SourceExcerpt')valid=typeof value.text==='string'&&integer(value.bytes)&&Number(value.bytes)<=sourceLimits.excerptBytes&&ref(value.ref);
    if(name==='SourceSnapshot')valid=string(value.id)&&string(value.projectId)&&string(value.root)&&hash(value.sourceHash)&&list(value.files,file)
      &&new Set((value.files as SourceFile[]).map(f=>f.path.toLowerCase())).size===(value.files as SourceFile[]).length
      &&list(value.indexIssues,s=>object(s)&&typeof s.path==='string'&&string(s.code)&&string(s.detail)&&(s.line===undefined||integer(s.line,1)));
    if(name==='AnalysisScope')valid=string(value.projectId)&&string(value.snapshotId)&&list(value.allowedPaths,p=>p==='.'||path(p))&&(value.allowedPaths as unknown[]).length>0
      &&list(value.excludedPaths,p=>p==='.'||path(p))&&typeof value.includeProjectTests==='boolean'&&string(value.serviceUrl)&&hash(value.scopeHash)
      &&(value.confirmedAt===undefined||typeof value.confirmedAt==='string'&&Number.isFinite(Date.parse(value.confirmedAt)));
  }
  return {valid,issues:valid?[]:[{path:'',code:'INVALID_'+name.replace(/([a-z])([A-Z])/g,'$1_$2').toUpperCase()}]};
}
