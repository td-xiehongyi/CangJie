import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRepairReport} from '../../apps/host/dist/report.js';
test('repair handoff retains version and scope without private source or validator artifacts',()=>{
 const run={id:'r',projectId:'p',parentRunId:'before',flow:{title:'测试'},status:'blocked',plan:{sourceHash:'abc',confirmedAt:'2026-10-15'},uncovered:['未检查付款'],checks:[],evidence:{privateAnswers:'DO_NOT_EXPORT'},source:'PRIVATE_SOURCE'};
 const report=renderRepairReport(run);
 assert.match(report,/来源运行：before/);assert.match(report,/源码摘要：abc/);
 assert.match(report,/未检查付款/);assert.match(report,/不需要平台模型API/);
 assert.doesNotMatch(report,/DO_NOT_EXPORT|PRIVATE_SOURCE/);
});

test('repair material distinguishes planned steps from actual evidence and incomplete reproduction',()=>{
 const run={id:'r',projectId:'p',flow:{title:'保存'},status:'completed',plan:{sourceHash:'s',confirmedAt:'t'},uncovered:[],checks:[{rule:{id:'save',confirmation:'confirmed',expectedChanges:['正确保存'],invariants:[]},mode:'verify',templateRef:{id:'t',version:'1',hash:'h'},template:{steps:[{stepId:'planned-only',operationId:'submit',actorRef:'owner'}]},actions:[],observations:[],verdicts:[]}]};
 const text=renderRepairReport(run);
 assert.match(text,/计划步骤.*不代表本次全部执行/);
 assert.match(text,/复现条件不完整/);assert.match(text,/实际执行动作/);
 assert.match(text,/不推断根因/);assert.doesNotMatch(text,/在04|在12|在11/);
});
