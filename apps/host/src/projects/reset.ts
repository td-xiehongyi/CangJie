import {writeFile,appendFile,readFile,lstat,realpath,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {digest,within,sourceFiles,type ProjectProfile} from './inspect.js';
import {OwnedProcess,childEnvironment,checkPort} from './start.js';
import {CredentialSession,RunSessions} from '../execution/session.js';
import {safePath,bindMapping,validateMapping,mappingHash,type HttpMapping} from '../execution/mapping.js';
import {authenticate} from '../execution/auth.js';
import type {Observation,ToolAction} from '@website-verification/contracts';

export interface TestConfig {projectId:string;port:number;confirmed:boolean;data:{source:'synthetic';count:number;seedVersion:string};accounts:{actorRef:string;username:string;userId:string;role:'user'}[];credentials:CredentialSession}
export interface Preparation {checkId:string;ruleHash:string;mappingHash:string;mapping?:HttpMapping;budget:{maxOperations:number;deadlineMs:number};confirmed:boolean;runId?:string;resumeOf?:string;reconfirmedChanges?:boolean}
export interface Attempt {id:string;runId:string;checkId:string;status:'running'|'completed'|'incomplete'|'blocked';stepIndex:number;resumeOf?:string;sourceCopyId?:string;conditions:string;ruleHash:string;mappingHash:string;budget:Preparation['budget'];startedAt:string;operations:number}
export class TestEnvironment {
  state:'ready'|'running'|'blocked'|'closed'='ready';
  readonly databasePath:string;readonly eventsPath:string;readonly baseUrl:string;
  readonly sessions=new RunSessions();readonly attempts:Attempt[]=[];
  currentAttempt:Attempt|undefined;
  private process:OwnedProcess|undefined;
  private closed=false;
  private preparing=false;
  private eventQueue:Promise<void>=Promise.resolve();
  private active=new Map<string,{controller:AbortController;work:Promise<Observation>}>();
  private actions=new Map<string,{hash:string;work:Promise<Observation>}>();
  private baseline:unknown;
  constructor(readonly id:string,readonly profile:ProjectProfile,readonly config:TestConfig,readonly copyRoot:string,readonly dataRoot:string,readonly evidenceRoot:string){this.databasePath=resolve(dataRoot,'test.sqlite');this.eventsPath=resolve(evidenceRoot,'events.jsonl');this.baseUrl=`http://127.0.0.1:${config.port}`;if(!profile.supported)this.state='blocked';}
  private conditionHash(p:Preparation):string{return digest({code:this.profile.sourceHash,rule:p.ruleHash,mapping:p.mappingHash,data:this.config.data,accounts:this.config.accounts,port:this.config.port,budget:p.budget});}
  async record(event:unknown):Promise<void>{const safe=this.config.credentials.redact(this.sessions.redact(event));this.eventQueue=this.eventQueue.then(()=>appendFile(this.eventsPath,JSON.stringify({schemaVersion:1,time:new Date().toISOString(),data:safe})+'\n'));return this.eventQueue;}
  async prepareExperiment(p:Preparation):Promise<Attempt>{return this.prepare(p,false);}
  private async readEvents(repairTail=false):Promise<{data:Record<string,unknown>}[ ]>{
    const events:{data:Record<string,unknown>}[]=[];
    const buffer=await readFile(this.eventsPath);
    for(let offset=0;offset<buffer.length;){
      const newline=buffer.indexOf(10,offset),end=newline===-1?buffer.length:newline,line=buffer.subarray(offset,end);let event:{data:Record<string,unknown>};
      if(!line.length){offset=end+1;continue;}
      try{event=JSON.parse(line.toString('utf8'));}catch{
        const hash=digest(line.toString('base64')),receiptPath=resolve(this.evidenceRoot,`torn-tail-${offset}-${hash}.json`);
        if(newline===-1&&repairTail){
          await writeFile(receiptPath,JSON.stringify({schemaVersion:1,offset,hash,bytesBase64:line.toString('base64'),reason:'CRASH_TORN_FINAL_EVENT'}));
          // Preserve every original byte; delimit the torn frame before appending.
          await appendFile(this.eventsPath,'\n');
        }else{
          let receipt:{offset:number;hash:string;bytesBase64:string};try{receipt=JSON.parse(await readFile(receiptPath,'utf8'));}catch{throw new Error('CORRUPT_EVENT_LOG');}
          if(receipt.offset!==offset||receipt.hash!==hash||receipt.bytesBase64!==line.toString('base64'))throw new Error('CORRUPT_EVENT_LOG');
        }
        offset=end+1;continue;
      }
      if(newline===-1&&repairTail)await appendFile(this.eventsPath,'\n');
      offset=end+1;
      if(!event?.data||typeof event.data!=='object')throw new Error('CORRUPT_EVENT_LOG');
      events.push(event);
    }
    return events;
  }
  async restoreAttempts():Promise<void>{
    for(const {data}of await this.readEvents(true)){
      if(['preparation_started','linked_interrupted_attempt'].includes(String(data.kind))){const attempt=data.attempt as Attempt;if(!attempt?.id||this.attempts.some(a=>a.id===attempt.id))throw new Error('CORRUPT_ATTEMPT_RECORD');this.attempts.push(attempt);}
      const attempt=this.attempts.find(a=>a.id===data.attemptId);
      if(attempt&&data.kind==='attempt_completed')attempt.status='completed';
      if(attempt&&['attempt_interrupted','attempt_incomplete'].includes(String(data.kind)))attempt.status='incomplete';
      if(attempt&&data.kind==='environment_blocked')attempt.status='blocked';
      if(data.kind==='baseline_verified')this.baseline=data.baseline;
    }
    this.currentAttempt=this.attempts.at(-1);
    if(this.currentAttempt?.status==='running'){this.currentAttempt.status='incomplete';await this.record({kind:'attempt_incomplete',attemptId:this.currentAttempt.id,reason:'HOST_EXITED_WITHOUT_COMPLETION'});}
    this.state='blocked';
  }
  private async ensureOldProcessesStopped():Promise<void>{
    for(let i=0;i<200;i++){
      const owners=(await readdir(this.dataRoot)).filter(name=>/^owner-[a-f0-9-]+\.json$/.test(name));let allStopped=true;
      for(const name of owners){let record:{instanceId:string;state:string;pid?:number;runnerPid?:number};try{record=JSON.parse(await readFile(resolve(this.dataRoot,name),'utf8'));}catch{allStopped=false;continue;}if(record.instanceId!==this.id)throw new Error('PROCESS_OWNERSHIP_MISMATCH');if(record.state!=='stopped'){
        // Some Windows job hosts terminate the whole tree before a supervisor can
        // save its exit marker. Signal 0 only probes; it never kills a reused PID.
        const absent=(pid:number|undefined)=>{if(!Number.isSafeInteger(pid)||pid!<=0)return false;try{process.kill(pid!,0);return false;}catch(e){return (e as NodeJS.ErrnoException).code==='ESRCH';}};
        if(absent(record.pid)&&absent(record.runnerPid)){await writeFile(resolve(this.dataRoot,name),JSON.stringify({...record,state:'stopped',proof:'both_processes_absent'}));}else allStopped=false;
      }}
      if(allStopped)return;await new Promise(r=>setTimeout(r,30));
    }
    throw new Error('OLD_PROCESS_NOT_ISOLATED');
  }
  async linkInterruptedAttempt(previous:TestEnvironment):Promise<void>{
    await previous.ensureOldProcessesStopped();const old=previous.currentAttempt;
    if(this.attempts.length||!old||old.status!=='incomplete')throw new Error('NO_INTERRUPTED_ATTEMPT');
    const attempt={...structuredClone(old),sourceCopyId:previous.id};this.attempts.push(attempt);this.currentAttempt=attempt;this.state='blocked';
    await this.record({kind:'linked_interrupted_attempt',attempt,previousEvidence:{copyId:previous.id,path:'evidence/events.jsonl'}});
  }
  async verifyIsolated():Promise<void>{await this.ensureOldProcessesStopped();}
  private async prepare(p:Preparation,resuming:boolean):Promise<Attempt>{
    if(this.closed)throw new Error('ENVIRONMENT_CLOSED');if(this.preparing)throw new Error('PREPARATION_BUSY');
    if(this.currentAttempt?.status==='incomplete'&&!resuming)throw new Error('RESUME_REQUIRED');
    if(this.currentAttempt?.status==='running')throw new Error('EXPERIMENT_ACTIVE');
    if(!p.confirmed||!this.config.confirmed)throw new Error('CONFIRMATION_REQUIRED');
    if(!this.profile.supported){this.state='blocked';throw new Error('INITIALIZATION_GAP');}
    const mapping=p.mapping??bindMapping(this.profile.mapping,this.id);validateMapping(mapping);if(mapping.targetRef!==this.id||mappingHash(mapping)!==p.mappingHash)throw new Error('MAPPING_CHANGED');
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(p.checkId)||!p.ruleHash||!p.mappingHash||!Number.isSafeInteger(p.budget.maxOperations)||p.budget.maxOperations<1||p.budget.maxOperations>64||!Number.isSafeInteger(p.budget.deadlineMs)||p.budget.deadlineMs<1||p.budget.deadlineMs>300000)throw new Error('INVALID_PREPARATION');
    // Password collection can be repaired without consuming a resume attempt.
    for(const account of this.config.accounts)this.config.credentials.get(this.config.projectId,account.actorRef);
    this.preparing=true;const runId=p.runId??randomUUID(),attempt:Attempt={id:`${runId}:${p.checkId}:attempt-1`,runId,checkId:p.checkId,status:'running',stepIndex:0,...(p.resumeOf?{resumeOf:p.resumeOf}:{}),conditions:this.conditionHash(p),ruleHash:p.ruleHash,mappingHash:p.mappingHash,budget:structuredClone(p.budget),startedAt:new Date().toISOString(),operations:0};
    if(this.attempts.some(a=>a.id===attempt.id)){this.preparing=false;throw new Error('ATTEMPT_ID_REUSED');}
    this.currentAttempt=attempt;this.attempts.push(attempt);
    try{
      await this.record({kind:'preparation_started',attempt});
      await this.isolate();this.sessions.clear();this.actions.clear();
      await this.ensureOldProcessesStopped();
      if(digest(await sourceFiles(this.profile.root))!==this.profile.sourceHash)throw new Error('PROFILE_CHANGED');
      if(digest(await sourceFiles(this.copyRoot))!==this.profile.sourceHash)throw new Error('COPY_CHANGED');
      await checkPort(this.config.port);
      if((await lstat(this.dataRoot)).isSymbolicLink())throw new Error('PATH_ESCAPE');
      within(this.dataRoot,await realpath(this.dataRoot)+'/test.sqlite');
      try{if((await lstat(this.databasePath)).isSymbolicLink())throw new Error('PATH_ESCAPE');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      const init=this.profile.initialization!;
      if(this.config.data.source!=='synthetic'||this.config.data.seedVersion!==init.version||!Number.isSafeInteger(this.config.data.count)||this.config.data.count<0||this.config.data.count>1000||this.config.accounts.length!==2||new Set(this.config.accounts.map(a=>a.userId)).size!==2||new Set(this.config.accounts.map(a=>a.actorRef)).size!==2)throw new Error('TEST_DATA_CONFIG_GAP');
      const values={TEST_DATABASE:this.databasePath,TEST_DATA_ROOT:this.dataRoot,TEST_INSTANCE:this.id,PORT:String(this.config.port)};
      const accounts=this.config.accounts.map(a=>({...a,password:this.config.credentials.get(this.config.projectId,a.actorRef)}));
      const seed=new OwnedProcess(this.copyRoot,init.argv,childEnvironment(values),{databasePath:this.databasePath,instanceId:this.id,seedVersion:init.version,count:this.config.data.count,accounts});
      let seeded:unknown;try{seeded=await seed.finish();}finally{await seed.stop();}
      const info=await lstat(this.databasePath);if(!info.isFile()||info.isSymbolicLink())throw new Error('TEST_DATABASE_NOT_CREATED');within(this.dataRoot,await realpath(this.databasePath));
      const baseline=seeded as {users:number;records?:number;tickets?:number;hash:string;instanceId:string;seedVersion:string};
      // Generic record count for new projects; preserve the original ticket
      // initializer protocol. Conflicting aliases cannot mask a bad baseline.
      const count=(b:typeof baseline)=>b.records!==undefined?(b.tickets!==undefined&&b.tickets!==b.records?undefined:b.records):b.tickets;
      if(baseline.instanceId!==this.id||baseline.seedVersion!==init.version||baseline.users!==this.config.accounts.length||count(baseline)!==this.config.data.count||typeof baseline.hash!=='string')throw new Error('BASELINE_MISMATCH');
      this.process=new OwnedProcess(this.copyRoot,this.profile.manifest.start.argv,childEnvironment(values));
      safePath(this.profile.manifest.healthPath);let healthy=false;
      for(let i=0;i<60;i++){if(!this.process.running)break;try{const response=await fetch(this.baseUrl+this.profile.manifest.healthPath,{redirect:'manual',signal:AbortSignal.timeout(200)});if(response.status===200){const body=await response.json() as typeof baseline;if(body.instanceId===this.id&&body.hash===baseline.hash&&body.seedVersion===baseline.seedVersion&&body.users===baseline.users&&count(body)===count(baseline)){healthy=true;break;}}}catch{}await new Promise(r=>setTimeout(r,30));}
      if(!healthy)throw new Error('STARTUP_OR_BASELINE_FAILED');
      for(const account of this.config.accounts)await authenticate(this,mapping,account.actorRef,AbortSignal.timeout(2000));
      this.baseline={source:'existing_project_synthetic_init',version:init.version,sourceHash:this.profile.sourceHash,parameters:{count:this.config.data.count,accounts:this.config.accounts},summary:baseline};
      this.state='ready';await this.record({kind:'baseline_verified',attemptId:attempt.id,baseline:this.baseline});return attempt;
    }catch(e){attempt.status='blocked';this.state='blocked';await this.isolate();await this.record({kind:'environment_blocked',attemptId:attempt.id,reason:e instanceof Error?e.message:'PREPARATION_FAILED'});throw e;}finally{this.preparing=false;}
  }
  async resume(oldId:string,confirmation:Omit<Preparation,'checkId'>):Promise<Attempt>{
    const old=this.attempts.find(a=>a.id===oldId);if(!old||old.status!=='incomplete')throw new Error('NO_INTERRUPTED_ATTEMPT');
    const p={...confirmation,checkId:old.checkId,resumeOf:old.id};
    if(!p.confirmed)throw new Error('CONFIRMATION_REQUIRED');
    if(this.conditionHash(p)!==old.conditions&&!p.reconfirmedChanges)throw new Error('CONDITIONS_CHANGED');
    return this.prepare(p,true);
  }
  async operation(action:ToolAction,work:(signal:AbortSignal)=>Promise<Observation>):Promise<Observation>{
    const attempt=this.currentAttempt;if(this.closed||this.preparing||!attempt||attempt.status!=='running'||action.attemptId!==attempt.id||action.checkId!==attempt.checkId||action.isolationKey!==`${attempt.runId}:${attempt.checkId}`)throw new Error('WRONG_ATTEMPT');
    const old=this.actions.get(action.actionId),hash=digest(action);if(old){if(old.hash!==hash)throw new Error('ACTION_ID_CONFLICT');return old.work;}
    if(this.active.size)throw new Error('EXPERIMENT_OPERATION_ACTIVE');
    if(++attempt.operations>attempt.budget.maxOperations||Date.now()-Date.parse(attempt.startedAt)>=attempt.budget.deadlineMs){await this.uncertainWrite('EXECUTION_BUDGET_EXCEEDED');throw new Error('EXECUTION_BUDGET_EXCEEDED');}
    const controller=new AbortController();this.state='running';
    const task=work(controller.signal).finally(()=>this.active.delete(action.actionId));
    this.actions.set(action.actionId,{hash,work:task});this.active.set(action.actionId,{controller,work:task});return task;
  }
  async uncertainWrite(reason='WRITE_RESULT_UNKNOWN'):Promise<void>{try{if(this.currentAttempt?.status==='running'){this.currentAttempt.status='incomplete';await this.record({kind:'attempt_incomplete',attemptId:this.currentAttempt.id,reason});}}finally{this.state='blocked';try{if(this.process){await this.process.stop();this.process=undefined;}}finally{this.sessions.clear();}}}
  private async isolate():Promise<void>{for(const v of this.active.values())v.controller.abort();let stopError:unknown;try{if(this.process){await this.process.stop();this.process=undefined;}}catch(e){stopError=e;}await Promise.allSettled([...this.active.values()].map(v=>v.work));this.sessions.clear();await this.eventQueue.catch(()=>{});if(stopError)throw stopError;}
  async interrupt():Promise<void>{try{if(this.currentAttempt?.status==='running'){this.currentAttempt.status='incomplete';await this.record({kind:'attempt_interrupted',attemptId:this.currentAttempt.id});}}finally{this.state='blocked';await this.isolate();}}
  async completeAttempt():Promise<void>{if(!this.currentAttempt||this.currentAttempt.status!=='running'||this.active.size)throw new Error('ATTEMPT_NOT_SETTLED');this.currentAttempt.status='completed';this.sessions.clear();this.state='ready';await this.record({kind:'attempt_completed',attemptId:this.currentAttempt.id});}
  async saveObservation(action:ToolAction,observation:Observation,http?:unknown):Promise<string>{const name=digest(`${action.attemptId}/${action.actionId}`)+'.json',ref=`evidence:${name}`;const safe=this.config.credentials.redact(this.sessions.redact({action,observation:{...observation,evidenceRefs:[ref]},http}));await writeFile(resolve(this.evidenceRoot,name),JSON.stringify(safe,null,2));await this.record({kind:'observation',attemptId:action.attemptId,actionId:action.actionId,evidenceRef:ref,observation});return ref;}
  async exportRecord():Promise<unknown>{await this.eventQueue;let events:unknown[];try{events=await this.readEvents();}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')events=[];else throw e;}return this.config.credentials.redact(this.sessions.redact({projectId:this.config.projectId,copyId:this.id,accounts:this.config.accounts,data:this.config.data,baseline:this.baseline,attempts:this.attempts,events,gaps:this.profile.gaps}));}
  async close():Promise<void>{if(this.closed)return;try{await this.interrupt();}finally{this.sessions.clear();if(!this.process&&!this.active.size){this.closed=true;this.state='closed';}}}
}
