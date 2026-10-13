import type {LedgerEntry} from './ledger.js';
export function metrics(entries:LedgerEntry[]){
  const target=entries.filter(e=>e.phase==='target'),done=target.filter(e=>e.status!=='running'),durations=done.map(e=>e.durationMs??0).sort((a,b)=>a-b);
  const actions=target.flatMap(e=>e.actions),observations=target.flatMap(e=>e.observations);
  return {started:target.length,completed:done.length,p95Ms:durations[Math.max(0,Math.ceil(durations.length*.95)-1)]??0,
    // Includes uncertainty and execution errors; expected permission rejection is not an error.
    errorRate:done.length?done.filter(e=>e.status!=='pass').length/done.length:0,
    businessRequests:actions.filter(a=>a.operationId!=='query').length,verificationRequests:actions.filter(a=>a.operationId==='query').length,
    businessExecutionMs:target.flatMap(e=>e.actionTimings??[]).filter(a=>a.operationId!=='query').reduce((sum,a)=>sum+a.elapsedMs,0),
    verificationMs:target.flatMap(e=>e.actionTimings??[]).filter(a=>a.operationId==='query').reduce((sum,a)=>sum+a.elapsedMs,0),
    unknownResponses:observations.filter(o=>o.acceptance==='unknown'||o.transportStatus!=='ok').length};
}
