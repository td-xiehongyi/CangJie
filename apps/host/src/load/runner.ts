import {randomUUID,randomBytes} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {MappingSpec,Transition,ToolAction,Observation} from '@website-verification/contracts';
import {CoreClient} from '../core/client.js';
import {command,capabilities} from '../validation/observations.js';
import {projectRoot} from '../validation/review.js';
import {qualifyPlan,type RunRecord,type RunEnvironment} from '../replay.js';
import {TemplateRegistry} from '../templates/store.js';
import {prepareCopy} from '../projects/copy.js';
import {inspectProject,digest} from '../projects/inspect.js';
import type {TestEnvironment,Attempt} from '../projects/reset.js';
import {bindMapping,mappingHash} from '../execution/mapping.js';
import {execute,type HttpEnvironment} from '../execution/http.js';
import {ArtifactStore,validId} from '../artifacts/store.js';
import {settle,type OperationLedger,type Settlement,type LedgerEntry} from './ledger.js';
import {metrics} from './metrics.js';

export interface TargetSettings {confirmed:boolean;rate:number;durationSeconds:number;maxVUs:number;maxIterations:number;maxHostMemoryMb:number;settlementMs:number;latencyMs?:number;errorRate?:number;sustainedSamples:number;ratios:Record<string,number>}
export const LOAD_PRESET=Object.freeze({maxVUs:4,maxIterations:10000,maxHostMemoryMb:2048,settlementMs:5000,sustainedSamples:3});
export interface TargetLoadPlan extends TargetSettings {sourceRun:RunRecord;environment:RunEnvironment;registry:TemplateRegistry;directory?:string}
export interface LoadRecord {id:string;projectId:string;sourceRunId:string;flow:RunRecord['flow'];status:'preflight'|'running'|'settling'|'completed'|'blocked'|'interrupted';verdict:'pass'|'fail'|'unknown';reason:string;startedAt:string;finishedAt?:string;target:TargetSettings;sourceHash:string;mappingHash:string;checks:RunRecord['plan']['checks'];data:RunEnvironment['data'];ledger:LedgerEntry[];metrics:ReturnType<typeof metrics>;settlement?:Settlement;copyId?:string;environment?:unknown;evidence:Record<string,unknown>;generator:{engine:string;dropped:number;iterations:number;exitCode?:number;limited:boolean};limitations:string[]}
export interface StopResult {reason:string;settlement?:Settlement}
export interface LoadHandle {id:string;result:Promise<LoadRecord>;snapshot():LoadRecord;stop(reason:string):Promise<StopResult>}
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
export function validateTarget(p:TargetSettings,ruleIds:string[]){
  if(p.confirmed!==true||!integer(p.rate,1,100)||!integer(p.durationSeconds,1,300)||!integer(p.maxVUs,1,16)||!integer(p.maxIterations,1,10000)||!integer(p.maxHostMemoryMb,32,8192)||!integer(p.settlementMs,100,60000)||!integer(p.sustainedSamples,1,100))throw new Error('LOAD_CONFIRMATION_OR_LIMITS_REQUIRED');
  if(p.latencyMs!==undefined&&(!Number.isFinite(p.latencyMs)||p.latencyMs<1||p.latencyMs>300000)||p.errorRate!==undefined&&(!Number.isFinite(p.errorRate)||p.errorRate<0||p.errorRate>1))throw new Error('INVALID_LOAD_THRESHOLDS');
  if(!p.ratios||Object.keys(p.ratios).length!==ruleIds.length||ruleIds.some(id=>!integer(p.ratios[id],1,100))||Object.values(p.ratios).reduce((a,b)=>a+b,0)!==100)throw new Error('LOAD_RATIO_MISMATCH');
}
export function assertLoadSource(run:RunRecord,mapping:MappingSpec){
  if(run.status!=='completed'||run.kind!=='verification'||!run.checks.length||run.checks.length!==run.plan.checks.length||digest(run.flow)!==digest(run.plan.flow)||digest(mapping)!==digest(run.plan.mapping)||run.checks.some((c,i)=>c.mode!=='verify'||c.rule.confirmation!=='confirmed'||c.status!=='completed'||!c.verdicts.length||c.verdicts.some(v=>v.status!=='pass')||digest(c.rule)!==digest(run.plan.checks[i]!.rule)||digest(c.templateRef)!==digest(run.plan.checks[i]!.templateRef)))throw new Error('LOAD_BUSINESS_GATE_BLOCKED');
}
export class LoadStore extends ArtifactStore {
  async getLoad(id:string):Promise<LoadRecord>{validId(id);try{return await this.read(id+'.json');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;const r=await this.read<LoadRecord>(id+'.pending.json');return {...r,status:'interrupted',verdict:'unknown',reason:'HOST_EXITED_BEFORE_SETTLEMENT'};}}
}
async function port(){const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const p=(s.address() as {port:number}).port;await new Promise<void>(r=>s.close(()=>r()));return p;}

// Each concurrent experiment owns its action/attempt budget, while all share the
// same initialized website and token sessions. No per-operation reset occurs.
class LoadEnvironment implements HttpEnvironment {
  currentAttempt:Attempt|undefined;
  readonly id;readonly config;readonly baseUrl;readonly sessions;
  constructor(readonly base:TestEnvironment,readonly mapping:MappingSpec,readonly signal:AbortSignal){this.id=base.id;this.config=base.config;this.baseUrl=base.baseUrl;this.sessions=base.sessions;}
  record(event:unknown){return this.base.record(event);}
  saveObservation(action:ToolAction,observation:Observation,http?:unknown){return this.base.saveObservation(action,observation,http);}
  async uncertainWrite(){await this.record({kind:'load_write_unsettled',attemptId:this.currentAttempt?.id});}
  async operation(action:ToolAction,work:(signal:AbortSignal)=>Promise<Observation>){
    const a=this.currentAttempt;if(!a||a.id!==action.attemptId||a.checkId!==action.checkId||action.isolationKey!==`${a.runId}:${a.checkId}`||this.signal.aborted||++a.operations>a.budget.maxOperations)throw new Error('LOAD_ATTEMPT_BUDGET');
    return work(this.signal);
  }
}

export function startTargetLoad(input:TargetLoadPlan,mapping:MappingSpec):LoadHandle{
  assertLoadSource(input.sourceRun,mapping);validateTarget(input,input.sourceRun.checks.map(c=>c.rule.id));
  const source=structuredClone(input.sourceRun),boundMapping=structuredClone(mapping),environment=input.environment;
  if(environment.projectId!==source.projectId||!environment.confirmed)throw new Error('PROJECT_CONFIRMATION_REQUIRED');
  const {confirmed,rate,durationSeconds,maxVUs,maxIterations,maxHostMemoryMb,settlementMs,latencyMs,errorRate,sustainedSamples,ratios}=input;
  const target=structuredClone({confirmed,rate,durationSeconds,maxVUs,maxIterations,maxHostMemoryMb,settlementMs,latencyMs,errorRate,sustainedSamples,ratios});
  const ledger:OperationLedger={entries:[],pending:new Set()},id=randomUUID(),store=new LoadStore(input.directory??join(projectRoot,'.local-data/loads'));
  const record:LoadRecord={id,projectId:source.projectId,sourceRunId:source.id,flow:source.flow,status:'preflight',verdict:'unknown',reason:'',startedAt:new Date().toISOString(),target,sourceHash:source.plan.sourceHash,mappingHash:digest(boundMapping),checks:source.plan.checks,data:structuredClone(environment.data),ledger:ledger.entries,metrics:metrics([]),evidence:{},generator:{engine:'k6 constant-arrival-rate / loopback declarative executor',dropped:0,iterations:0,limited:false},limitations:['仅本机合成测试数据与当前源码、映射、固定模板条件。不能外推线上。','未测试更高负载，不寻找最大容量，不降载观察恢复。','操作率单位为业务实验/秒；按确认比例分配已选规则。每次实验使用独立intent/attempt并核对全部模板断言；不表示每条规则覆盖全部写操作。','完成等待包含宿主、仓颉、业务HTTP和核对开销；核对动作及含取证耗时单独记录；实际请求以HTTP证据为准。执行端受限只能报未知。','硬上限：并发实验数、实验总数、目标时长、宿主RSS；不是整个系统CPU/内存隔离。']};
  let stopped=false,process:ChildProcess|undefined,env:TestEnvironment|undefined,queue=Promise.resolve(),slow=0,bad=0,watch:NodeJS.Timeout|undefined,killTimer:NodeJS.Timeout|undefined;
  const abort=new AbortController();
  const snapshot=()=>structuredClone({...record,metrics:metrics(ledger.entries)});
  const persist=()=>{queue=queue.then(()=>store.write(id+'.pending.json',snapshot()));return queue;};
  const requestStop=(reason:string)=>{if(stopped)return;stopped=true;record.reason=reason;record.status='settling';if(reason==='generator_limited'||reason==='host_memory_limit')record.generator.limited=true;killTimer=setTimeout(()=>{abort.abort();process?.kill();},settlementMs);};
  const result=(async()=>{
    let bridge:ReturnType<typeof createServer>|undefined;
    const {coreCommand}=await import(pathToFileURL(join(projectRoot,'scripts/toolchain.mjs')).href);
    const experiment=async(index:number,phase:'preflight'|'target')=>{
      const check=source.checks[index]!,entry:LedgerEntry={id:randomUUID(),ruleId:check.rule.id,phase,status:'running',startedAt:Date.now(),actions:[],observations:[],verdicts:[]};ledger.entries.push(entry);
      const core=new CoreClient({...coreCommand(),timeoutMs:5000});const mapped=bindMapping(boundMapping,env!.id),local=new LoadEnvironment(env!,mapped,abort.signal);
      try{
        const qualification=await input.registry.assertQualified(check.templateRef),spec=qualification.spec;
        let state:Transition=await command(core,entry.id,'start',{operation:'runTemplate',spec,rule:check.rule,capabilities,scope:{kind:'published_template',confirmed:true,qualification}});
        while(state.state==='running'){
          if(abort.signal.aborted)throw new Error('SETTLEMENT_DEADLINE');
          const action=state.actions[0];if(!action)throw new Error('NO_ACTION');
          if(local.currentAttempt?.id!==action.attemptId)local.currentAttempt={id:action.attemptId,runId:entry.id,checkId:action.checkId,status:'running',stepIndex:0,conditions:digest(target),ruleHash:digest(check.rule),mappingHash:mappingHash(mapped),budget:{maxOperations:spec.limits.maxActions,deadlineMs:spec.limits.runTimeoutMs},startedAt:new Date().toISOString(),operations:0};
          entry.actions.push(action);await persist();
          const actionStarted=performance.now();
          const observation=await execute(action,{environment:local,mapping:mapped});entry.observations.push(observation);
          (entry.actionTimings??=[]).push({actionId:action.actionId,operationId:action.operationId,elapsedMs:performance.now()-actionStarted});
          state=await command(core,entry.id,'observation',{observation});
        }
        entry.verdicts=state.verdicts;entry.status=state.verdicts.some(v=>v.status==='fail')?'fail':state.state==='completed'&&state.verdicts.length>0&&state.verdicts.every(v=>v.status==='pass')?'pass':'unknown';
      }catch(e){entry.status='unknown';entry.error=(e as Error).message;}
      finally{await core.close();entry.finishedAt=Date.now();entry.durationMs=entry.finishedAt-entry.startedAt;}
      if(entry.status==='fail')requestStop('business_error');
      if(phase==='target'){
        slow=latencyMs!==undefined&&entry.durationMs!>latencyMs?slow+1:0;
        bad=errorRate!==undefined&&metrics(ledger.entries).errorRate>errorRate?bad+1:0;
        if(slow>=sustainedSamples)requestStop('sustained_latency');if(bad>=sustainedSamples)requestStop('sustained_errors');
      }
      await persist();return entry;
    };
    try{
      await persist();const profile=await inspectProject(environment.source);
      if(profile.sourceHash!==source.plan.sourceHash)throw new Error('CONDITIONS_CHANGED_RECONNECT_REQUIRED');
      await qualifyPlan(source.plan,input.registry);
      if(stopped)return record;
      env=await prepareCopy(profile,{projectId:environment.projectId,port:await port(),confirmed:true,data:environment.data,accounts:environment.accounts,credentials:environment.credentials});record.copyId=env.id;
      const mapped=bindMapping(boundMapping,env.id);
      await env.prepareExperiment({runId:id,checkId:'load',ruleHash:digest(source.plan.checks),mapping:mapped,mappingHash:mappingHash(mapped),confirmed:true,budget:{maxOperations:64,deadlineMs:300000}});
      for(let i=0;i<source.checks.length&&!stopped;i++)if((await experiment(i,'preflight')).status!=='pass'){requestStop('preflight_not_passed');break;}
      if(stopped)return record;
      record.status='running';await persist();
      const secret=randomBytes(32).toString('hex'),seen=new Set<number>();let dispatched=0;
      // Smooth deterministic weighted scheduling, never change the target rate.
      const weights=source.checks.map(c=>target.ratios[c.rule.id]!),credits=weights.map(()=>0);
      const pick=()=>{weights.forEach((w,i)=>credits[i]=credits[i]!+w);const idx=credits.indexOf(Math.max(...credits));credits[idx]=credits[idx]!-100;return idx;};
      const targetStarted=Date.now();
      bridge=createServer(async(req,res)=>{
        res.setHeader('connection','close');
        if(req.method!=='POST'||req.url!=='/iteration'||req.headers.authorization!==`Bearer ${secret}`){res.writeHead(403);res.end();return;}
        try{
          let data='';for await(const chunk of req){data+=chunk;if(data.length>128)throw new Error('INVALID_ITERATION');}const n=JSON.parse(data).index;
          if(!Number.isSafeInteger(n)||n<0||seen.has(n))throw new Error('INVALID_ITERATION');seen.add(n);
          if(stopped){res.writeHead(409);res.end();return;}
          if(dispatched>=rate*durationSeconds){res.writeHead(409);res.end();return;}
          if(dispatched>=maxIterations){requestStop('operation_limit');res.writeHead(409);res.end();return;}
          if(ledger.pending.size>=maxVUs){requestStop('generator_limited');res.writeHead(503);res.end();return;}
          if(processMemory()>maxHostMemoryMb){requestStop('host_memory_limit');res.writeHead(503);res.end();return;}
          dispatched++;const work=experiment(pick(),'target');ledger.pending.add(work);
          try{await work;}finally{ledger.pending.delete(work);}res.end('settled');
        }catch{requestStop('execution_error');res.writeHead(400);res.end();}
      });
      await new Promise<void>(r=>bridge!.listen(0,'127.0.0.1',r));const address=`http://127.0.0.1:${(bridge.address() as {port:number}).port}`;
      let output='',summarySeen=false;
      process=spawn(join(projectRoot,'.local-tools/k6-v2.3.0-windows-amd64/k6.exe'),['run','--quiet','--no-color',join(projectRoot,'templates/load-http.js')],{cwd:projectRoot,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],env:{...globalThis.process.env,K6_NO_USAGE_REPORT:'true',TARGET_CONFIG:JSON.stringify(target),BRIDGE_URL:address,BRIDGE_SECRET:secret}});
      process.stdout!.on('data',chunk=>{output=(output+chunk).slice(-32768);});process.stderr!.on('data',()=>{});
      watch=setInterval(()=>{
        if(processMemory()>maxHostMemoryMb)requestStop('host_memory_limit');
        if(Date.now()-targetStarted>(durationSeconds*1000+settlementMs+10000)){requestStop('generator_timeout');process?.kill();}
      },100);
      const exit=await new Promise<number|null>((resolve,reject)=>{process!.once('error',reject);process!.once('close',resolve);});record.generator.exitCode=exit??-1;
      for(const line of output.split(/\r?\n/))if(line.startsWith('T8_SUMMARY ')){const s=JSON.parse(line.slice(11));record.generator.dropped=s.dropped;record.generator.iterations=s.iterations;summarySeen=true;}
      if(!summarySeen||exit!==0||record.generator.dropped>0){record.generator.limited=true;if(!stopped)requestStop('generator_limited');}
      record.status='settling';
    }catch(e){record.reason=(e as Error).message;record.status='blocked';}
    finally{
      if(watch)clearInterval(watch);
      record.settlement=await settle(ledger,Date.now()+settlementMs);abort.abort();
      // Aborted HTTP/Core work is bounded; persist only after no writer remains.
      await Promise.allSettled([...ledger.pending]);record.settlement=await settle(ledger,Date.now());
      if(killTimer)clearTimeout(killTimer);process?.kill();
      if(bridge)await new Promise<void>(r=>{bridge!.close(()=>r());bridge!.closeIdleConnections();});
      if(env){try{
        if(env.currentAttempt?.status==='running'){if(record.settlement.unknown===0)await env.completeAttempt();else await env.interrupt();}
        record.environment=await env.exportRecord();for(const e of ledger.entries)for(const o of e.observations)for(const ref of o.evidenceRefs){const name=ref.slice(9);if(/^[a-f0-9]{64}\.json$/.test(name)){const {readFile}=await import('node:fs/promises');record.evidence[`${env.id}/${name}`]=JSON.parse(await readFile(join(env.evidenceRoot,name),'utf8'));}}
      }finally{await env.close();}}
      record.metrics=metrics(ledger.entries);
      const decisionCore=new CoreClient({...coreCommand(),timeoutMs:5000});
      try{const expected=rate*durationSeconds;const decision=await command(decisionCore,id,'start',{operation:'loadDecision',failed:record.settlement.failed,unknown:record.settlement.unknown,completed:!stopped&&record.status!=='blocked',targetReached:record.metrics.started>=expected&&record.generator.iterations===record.metrics.completed&&source.checks.every(c=>ledger.entries.some(e=>e.phase==='target'&&e.ruleId===c.rule.id)),thresholdsConfirmed:latencyMs!==undefined&&errorRate!==undefined,generatorLimited:record.generator.limited,withinThresholds:record.metrics.p95Ms<=(latencyMs??0)&&record.metrics.errorRate<=(errorRate??0)});record.verdict=decision.status;}catch{record.verdict='unknown';record.reason='DECISION_UNAVAILABLE';}finally{await decisionCore.close();}
      if(record.status!=='blocked')record.status='completed';record.finishedAt=new Date().toISOString();if(!record.reason)record.reason=latencyMs===undefined||errorRate===undefined?'OBSERVATION_ONLY':'target_finished';
      await queue;await store.write(id+'.json',snapshot(),true);
    }
    return snapshot();
  })();
  return {id,result,snapshot,stop:async(reason)=>{requestStop(reason);const final=await result;return {reason:final.reason,settlement:final.settlement};}};
}
function processMemory(){return globalThis.process.memoryUsage().rss/1024/1024;}
export function renderLoadReport(r:LoadRecord){return [`# ${r.flow.title} 目标负载报告`,`运行：${r.id}；来源：${r.sourceRunId}`,`结果：${r.verdict}；状态：${r.status}；停止原因：${r.reason}`,`目标：${JSON.stringify(r.target)}`,`数据：${JSON.stringify(r.data)}`,`指标：${JSON.stringify(r.metrics)}`,`结算：${JSON.stringify(r.settlement)}`,`压测端：${JSON.stringify(r.generator)}`,`范围与限制：`,...r.limitations.map(s=>'- '+s)].join('\n\n');}
