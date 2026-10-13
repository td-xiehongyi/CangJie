import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {replaceFile} from './replace.js';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {digest} from '../projects/inspect.js';
import {projectRoot} from '../validation/review.js';
import type {ConfirmedPlan,RunRecord} from '../replay.js';
export function validId(id:string):void{if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw new Error('INVALID_ID');}
export class ArtifactStore {
  constructor(readonly directory=join(projectRoot,'.local-data/runs')){}
  async write(name:string,record:unknown,immutable=false){await mkdir(this.directory,{recursive:true});const content=JSON.stringify({record,hash:digest(record)},null,2)+'\n';if(immutable){try{await writeFile(join(this.directory,name),content,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw new Error('RECORD_EXISTS');throw e;}}else{const tmp=join(this.directory,randomUUID()+'.tmp');await writeFile(tmp,content);await replaceFile(tmp,join(this.directory,name));}}
  async read<T>(name:string):Promise<T>{const data=JSON.parse(await readFile(join(this.directory,name),'utf8'));if(data.hash!==digest(data.record))throw new Error('CORRUPT_RUN_RECORD');return data.record;}
  async checkpoint(run:RunRecord){validId(run.id);await this.write(run.id+'.pending.json',run);}
  async finish(run:RunRecord){validId(run.id);if(!['completed','cancelled','blocked','interrupted'].includes(run.status))throw new Error('NOT_TERMINAL');await this.write(run.id+'.json',run,true);}
  async get(id:string):Promise<RunRecord>{validId(id);try{return await this.read(id+'.json');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;const run=await this.read<RunRecord>(id+'.pending.json');return {...run,status:'interrupted',uncovered:[...run.uncovered,'HOST_EXITED_BEFORE_TERMINAL']};}}
  async list():Promise<RunRecord[]>{await mkdir(this.directory,{recursive:true});const names=await readdir(this.directory),ids=new Set(names.filter(n=>/^[a-f0-9-]{36}(\.pending)?\.json$/.test(n)).map(n=>n.slice(0,36)));return Promise.all([...ids].map(id=>this.get(id)));}
}
