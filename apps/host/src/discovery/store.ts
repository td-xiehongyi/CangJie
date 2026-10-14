import {mkdir,readFile,writeFile,open,unlink,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {AnalysisScope,SourceSnapshot,DiscoverySession} from '@website-verification/contracts/discovery';
import {validateDiscoveryContract} from '@website-verification/contracts/discovery';
import type {ModelConfig} from '../model/provider.js';
import type {ModelPreset as BudgetPreset} from '../model/budget.js';
import {acquireTask} from '../model/task-lock.js';
import {replaceFile} from '../artifacts/replace.js';
import {digest} from '../projects/inspect.js';
import {createAnalysisScope,scopedSourceFiles} from './access.js';
import {buildSourceSnapshot} from './index.js';
export interface DiscoveryRecord {session:DiscoverySession;snapshot:SourceSnapshot;scope:AnalysisScope;preset:BudgetPreset;sourceByteLimit:number;config:Pick<ModelConfig,'serviceUrl'|'model'>}
/** Conservative selected-business reuse. Re-index locally; never rewrite the saved report.
 * All additions, removals and changes inside the selected scope count, including
 * runtime metadata. A narrower explicit business scope is never broadened. */
export function reconcileDiscovery(record:DiscoveryRecord,current:SourceSnapshot):{session:DiscoverySession;changedPaths:string[];reanalysisRequired:boolean} {
  const session=structuredClone(record.session);
  if(current.projectId!==record.snapshot.projectId||resolve(current.root).toLowerCase()!==resolve(record.snapshot.root).toLowerCase())throw new Error('STALE_SOURCE');
  const scope=createAnalysisScope(current,record.scope),before=new Map(scopedSourceFiles(record.snapshot,record.scope).map(f=>[f.path,f.hash])),after=new Map(scopedSourceFiles(current,scope).map(f=>[f.path,f.hash]));
  const changedPaths=[...new Set([...before.keys(),...after.keys()])].filter(path=>before.get(path)!==after.get(path)).sort();
  // New read/path/index failures also invalidate reuse, even if the old cited
  // text still exists. Stable historical gaps are kept as explicit limitations.
  const inScope=(path:string)=>record.scope.allowedPaths.some(p=>p==='.'||path.toLowerCase()===p||path.toLowerCase().startsWith(p+'/'))&&!record.scope.excludedPaths.some(p=>p==='.'||path.toLowerCase()===p||path.toLowerCase().startsWith(p+'/'));
  const relevantIssues=(snapshot:SourceSnapshot)=>snapshot.indexIssues.filter(i=>inScope(i.path)&&!['SENSITIVE_FILE','PROJECT_TEST_EXCLUDED'].includes(i.code));
  const issueChange=digest(relevantIssues(current))!==digest(relevantIssues(record.snapshot));
  const reanalysisRequired=changedPaths.length>0||issueChange;
  if(reanalysisRequired){session.status='stale';session.referencesValid=false;delete session.selectedSuggestionId;session.unresolved=[...new Set([...session.unresolved,'SELECTED_BUSINESS_SOURCE_CHANGED'])];}
  return {session,changedPaths,reanalysisRequired};
}
export async function currentDiscovery(record:DiscoveryRecord){
  let snapshot:SourceSnapshot;
  try{snapshot=await buildSourceSnapshot(record.snapshot.root,record.snapshot.projectId,{includeProjectTests:record.scope.includeProjectTests});}
  catch{const session=structuredClone(record.session);session.status='stale';session.referencesValid=false;delete session.selectedSuggestionId;session.unresolved=[...new Set([...session.unresolved,'SOURCE_RECHECK_UNAVAILABLE'])];return {session,changedPaths:[],reanalysisRequired:true};}
  return reconcileDiscovery(record,snapshot);
}
export interface SourceProject {id:string;revision:number;name:string;directory:string;snapshot:SourceSnapshot;scope?:AnalysisScope;discoveryId?:string;lastRequestId?:string}
const idCheck=(id:string)=>{if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw new Error('INVALID_ID')};
export class DiscoveryStore {
  readonly directory:string;
  constructor(directory:string){this.directory=resolve(directory)}
  path(id:string){idCheck(id);return join(this.directory,id+'.json')}
  async exclusive<T>(id:string,work:()=>Promise<T>):Promise<T>{let release;try{release=await acquireTask(id)}catch(e){throw new Error((e as Error).message==='CANDIDATE_BUSY'?'ANALYSIS_CONFLICT':(e as Error).message)}try{return await work()}finally{await release()}}
  private async read<T>(path:string):Promise<T>{const saved=JSON.parse(await readFile(path,'utf8'));if(saved.hash!==digest(saved.record))throw new Error('CORRUPT_DISCOVERY_RECORD');return saved.record}
  private async write(path:string,record:unknown){await mkdir(this.directory,{recursive:true});const tmp=join(this.directory,randomUUID()+'.tmp'),handle=await open(tmp,'wx');try{await handle.writeFile(JSON.stringify({record,hash:digest(record)}));await handle.sync()}finally{await handle.close()}await replaceFile(tmp,path)}
  async create(record:DiscoveryRecord){await this.exclusive(record.session.id,async()=>{try{await readFile(this.path(record.session.id));throw new Error('ANALYSIS_CONFLICT')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}await this.write(this.path(record.session.id),record)})}
  async get(id:string):Promise<DiscoveryRecord>{
    const r=await this.read<DiscoveryRecord>(this.path(id));
    if(r.session.id!==id||!Number.isSafeInteger(r.session.revision)||r.session.revision<0||!validateDiscoveryContract('SourceSnapshot',r.snapshot).valid||!validateDiscoveryContract('AnalysisScope',r.scope).valid||r.session.snapshotId!==r.snapshot.id||!Array.isArray(r.session.reads)||!Array.isArray(r.session.audit)||!Array.isArray(r.session.rounds))throw new Error('CORRUPT_DISCOVERY_RECORD');return r;
  }
  /** Caller holds exclusive for the analysis or one explicit draft mutation. */
  async save(record:DiscoveryRecord,expectedRevision:number){const current=await this.get(record.session.id);if(current.session.revision!==expectedRevision)throw new Error('ANALYSIS_CONFLICT');record.session.revision=expectedRevision+1;await this.write(this.path(record.session.id),record)}
  async requestPause(id:string){idCheck(id);await mkdir(this.directory,{recursive:true});await writeFile(join(this.directory,id+'.pause'),'pause')}
  async paused(id:string){try{await readFile(join(this.directory,id+'.pause'));return true}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e}}
  async clearPause(id:string){try{await unlink(join(this.directory,id+'.pause'))}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}}
  private projectPath(id:string){idCheck(id);return join(this.directory,'source-'+id+'.json')}
  async getProject(id:string):Promise<SourceProject>{return this.read(this.projectPath(id))}
  async saveProject(project:SourceProject,expectedRevision?:number){return this.exclusive(project.id,async()=>{if(expectedRevision!==undefined){const current=await this.getProject(project.id);if(current.revision!==expectedRevision)throw new Error('ANALYSIS_CONFLICT');project.revision=expectedRevision+1}else{try{await this.getProject(project.id);throw new Error('ANALYSIS_CONFLICT')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}}await this.write(this.projectPath(project.id),project)})}
  async startProject(id:string,revision:number,requestId:string,create:(p:SourceProject)=>Promise<DiscoverySession>){
    idCheck(requestId);return this.exclusive(id,async()=>{
      const p=await this.getProject(id);if(p.lastRequestId===requestId&&p.discoveryId)return {session:(await this.get(p.discoveryId)).session,created:false};
      if(p.revision!==revision)throw new Error('ANALYSIS_CONFLICT');
      const session=await create(p);p.discoveryId=session.id;p.lastRequestId=requestId;p.revision++;await this.write(this.projectPath(id),p);return {session,created:true};
    });
  }
  async projects():Promise<SourceProject[]>{await mkdir(this.directory,{recursive:true});const names=await readdir(this.directory);return Promise.all(names.filter(n=>/^source-[a-f0-9-]{36}\.json$/.test(n)).map(n=>this.getProject(n.slice(7,-5))))}
}
