import type {Observation,ToolAction,Verdict} from '@website-verification/contracts';
export interface LedgerEntry {id:string;ruleId:string;phase:'preflight'|'target';status:'running'|'pass'|'fail'|'unknown';startedAt:number;finishedAt?:number;durationMs?:number;actionTimings?:{actionId:string;operationId:string;elapsedMs:number}[];actions:ToolAction[];observations:Observation[];verdicts:Verdict[];error?:string}
export interface OperationLedger {entries:LedgerEntry[];pending:Set<Promise<unknown>>}
export interface Settlement {passed:number;failed:number;unknown:number;unfinished:string[]}
export async function settle(ledger:OperationLedger,deadline:number):Promise<Settlement>{
  if(ledger.pending.size&&deadline>Date.now()){
    let timer:NodeJS.Timeout|undefined;
    await Promise.race([Promise.allSettled([...ledger.pending]),new Promise(r=>{timer=setTimeout(r,deadline-Date.now());})]);
    if(timer)clearTimeout(timer);
  }
  const unfinished=ledger.entries.filter(e=>e.status==='running').map(e=>e.id);
  return {passed:ledger.entries.filter(e=>e.status==='pass').length,failed:ledger.entries.filter(e=>e.status==='fail').length,unknown:ledger.entries.filter(e=>e.status==='unknown'||e.status==='running').length,unfinished};
}
