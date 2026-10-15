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
