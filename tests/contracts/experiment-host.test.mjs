import test from 'node:test';
import assert from 'node:assert/strict';
import {CoreClient} from '../../apps/host/dist/core/client.js';
import {CoreExperiment} from '../../apps/host/dist/core/experiment.js';

// Transport peer for the host timer only. It supplies no business judgments and
// is not evidence for Cangjie semantics; interpreter.test.mjs requires the real core.
const peer=`let buffer='';let cancelled=false;process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\\n'))>=0){const m=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);let state='running',code='ACTION_READY',actions=[{actionId:'a1',deadline:15}];if(m.payload.operation==='tick'){state='completed';code='TIMED_OUT';actions=[];}if(m.kind==='cancel'){cancelled=true;state='cancelled';actions=[];}let error=false;if(m.kind==='observation'){if(m.payload.observation.actionId==='bad')error=true;else {state='completed';actions=[];}}process.stdout.write(JSON.stringify({...m,kind:'event',payload:error?{status:'error',code:'UNKNOWN_ACTION'}:{status:'completed',data:{runId:m.runId,state,code,actions,verdicts:[],cancelled}}})+'\\n');}});`;
function runtime(t){const client=new CoreClient({executable:process.execPath,args:['-e',peer],timeoutMs:1000});t.after(()=>client.close());const seen=[];return {run:new CoreExperiment(client,'host-clock',x=>seen.push(x)),seen};}
test('host clock sends a tick without any observation',async t=>{const {run,seen}=runtime(t);await run.start({});const result=await run.waitForTerminal();assert.equal(result.code,'TIMED_OUT');assert.deepEqual(seen.map(x=>x.state),['running','completed']);});
test('host cancellation clears timer and returns terminal',async t=>{const {run,seen}=runtime(t);await run.start({});await run.cancel();assert.equal((await run.waitForTerminal()).state,'cancelled');await new Promise(r=>setTimeout(r,40));assert.equal(seen.length,2);});
test('rejected observation leaves timer and valid observation usable',async t=>{const {run}=runtime(t);await run.start({});await assert.rejects(run.observe({actionId:'bad'}),/UNKNOWN_ACTION/);await run.observe({actionId:'a1'});assert.equal((await run.waitForTerminal()).state,'completed');});
