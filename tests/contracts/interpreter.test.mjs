import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { CoreClient } from '../../apps/host/dist/core/client.js';
import { coreCommand } from '../../scripts/toolchain.mjs';
import {validateContract} from '../../packages/contracts/dist/validate.js';

const seed = JSON.parse(readFileSync(new URL('../../packages/contracts/fixtures/save-result.json', import.meta.url)));
const clone = x => structuredClone(x);
const caps = { operations: ['create','query','update','login'], actorRefs:['owner','other'], expressions:['field','const','exists','eq','neq','count','contains','all','any','not'] };
const field = (v, ...path) => ({op:'field',var:v,path});
const constant = value => ({op:'const',value});
const eq = (a,b) => ({op:'eq',args:[a,b]});
const rule = {id:'save-rule',version:1,confirmation:'confirmed',source:'user-confirmed fixture',preconditions:[],expectedChanges:['save title'],invariants:[],completionDeadline:10000};
function client(t) { const c = new CoreClient({...coreCommand(),timeoutMs:3000}); t.after(()=>c.close()); return c; }
async function request(c, runId, payload, kind='start', messageId=crypto.randomUUID()) {
  const events = await c.send({schemaVersion:1,messageId,runId,kind,payload});
  const e=events.at(-1); assert.notEqual(e.payload.status,'error',JSON.stringify(e));
  if(e.payload.data?.state){const v=validateContract('Transition',e.payload.data);assert.equal(v.valid,true,JSON.stringify(v));}
  return e.payload.data;
}
const validate = (c,spec=clone(seed),capabilities=caps) => request(c,'validate',{operation:'validateTemplate',spec,capabilities});
const start = (c,spec=clone(seed),runId='run') => request(c,runId,{operation:'runTemplate',spec,capabilities:caps,rule,scope:{kind:'observation_validation',confirmed:true,validationRef:'t1-static'}});
const observation = (action,result,extra={}) => ({actionId:action.actionId,attemptId:action.attemptId,intentId:action.intentId,transportStatus:'ok',identityVerified:true,acceptance:'accepted',result,queryComplete:true,evidenceRefs:['fixture:observed'],...extra});
const advance = (c,state,result,extra={}) => request(c,state.runId,{observation:observation(state.actions[0],result,extra)},'observation');
async function evaluate(t,expr,result={},extra={}) {const c=client(t),s=clone(seed);s.steps=[s.steps[0]];s.steps[0].bindings={};s.assertions[0].expr=expr;const st=await start(c,s);return advance(c,st,result,extra);}

test('valid template is accepted by actual Cangjie core', async t => {assert.equal((await validate(client(t))).valid,true);});
for (const [name,mutate,code] of [
  ['reject_unknown_operation',s=>s.steps[0].operationId='shell','UNKNOWN_OPERATION'],
  ['reject_unbounded_repeat',s=>s.steps[0].repeat={until:true},'UNSUPPORTED_FIELD'],
  ['reject_answer_access',s=>s.assertions[0].expr=field('saved','evaluationLabel'),'ANSWER_ACCESS'],
  ['reject_answer_file',s=>s.steps[0].bindings={file:constant('answers/expected.json')},'ANSWER_ACCESS'],
  ['reject_undefined_variable',s=>s.assertions[0].expr=field('unknown','title'),'UNDEFINED_VARIABLE'],
  ['reject_constant_assertion',s=>s.assertions[0].expr=eq(constant(1),constant(2)),'CONSTANT_ASSERTION'],
  ['reject_obvious_tautology',s=>s.assertions[0].expr=eq(field('saved','id'),field('saved','id')),'TAUTOLOGY'],
  ['reject_dynamic_code',s=>s.steps[0].code='process.exit()','UNSUPPORTED_FIELD'],
  ['reject_budget_overrun',s=>s.limits.maxActions=1,'BUDGET_EXCEEDED'],
  ['reject_unknown_actor',s=>s.steps[0].actorRef='admin','UNKNOWN_ACTOR'],
  ['reject_duplicate_step',s=>s.steps[1].stepId='create','DUPLICATE_ID'],
  ['reject_unsafe_path',s=>s.assertions[0].expr=field('saved','__proto__'),'UNSAFE_PATH'],
  ['reject_exists_expression',s=>s.assertions[0].expr={op:'exists',arg:eq(field('saved','a'),constant(1))},'INVALID_EXISTS_ARGUMENT'],
  ['reject_constant_true_branch',s=>s.assertions[0].expr={op:'any',args:[eq(field('saved','a'),constant(1)),constant(true)]},'TAUTOLOGY'],
  ['reject_nested_constant_branch',s=>s.assertions[0].expr={op:'any',args:[eq(field('saved','a'),constant(1)),{op:'not',arg:constant(false)}]},'TAUTOLOGY'],
]) test(name,async t=>{const s=clone(seed);mutate(s);const r=await validate(client(t),s);assert.equal(r.valid,false);assert.ok(r.issues.some(x=>x.code===code),JSON.stringify(r));});

for(const [name,expr,result,want,code] of [
  ['missing_is_not_equal',eq(field('created','a'),field('created','b')),{},'inconclusive','MISSING_VALUE'],
  ['mismatched_type',eq(field('created','a'),constant(1)),{a:'1'},'inconclusive','TYPE_MISMATCH'],
  ['null_is_present',eq(field('created','a'),constant(null)),{a:null},'pass','ASSERTION_TRUE'],
  ['business_failure',eq(field('created','a'),constant(1)),{a:2},'fail','ASSERTION_FALSE'],
  ['exists_missing', {op:'exists',arg:field('created','a')},{},'fail','ASSERTION_FALSE'],
  ['exists_null', {op:'exists',arg:field('created','a')},{a:null},'pass','ASSERTION_TRUE'],
  ['count_and_contains',{op:'all',args:[eq({op:'count',arg:field('created','items')},constant(2)),{op:'contains',args:[field('created','items'),constant('x')]}]},{items:['x','y']},'pass','ASSERTION_TRUE'],
  ['not_unknown',{op:'not',arg:eq(field('created','a'),constant(1))},{},'inconclusive','MISSING_VALUE'],
  ['known_violation_preserves_unknown',{op:'all',args:[eq(field('created','a'),constant(1)),eq(field('created','b'),constant(1))]},{a:2},'fail','ASSERTION_FALSE'],
  ['any_does_not_hide_missing',{op:'any',args:[eq(field('created','a'),constant(1)),eq(field('created','b'),constant(1))]},{a:1},'inconclusive','MISSING_VALUE'],
]) test(name,async t=>{const r=await evaluate(t,expr,result);assert.equal(r.state,'completed');assert.equal(r.verdicts[0].status,want);assert.equal(r.verdicts[0].reasonCode,code);});

for(const [name,extra] of [['identity_unknown',{identityVerified:false}],['incomplete_query',{queryComplete:false}],['acceptance_unknown',{acceptance:'unknown'}],['transport_timeout',{transportStatus:'timeout'}],['missing_evidence',{evidenceRefs:[]}]]) test(name,async t=>{const r=await evaluate(t,eq(field('created','a'),constant(1)),{a:1},extra);assert.equal(r.verdicts[0].status,'inconclusive');});

test('save-result passes and records evidence, action identity and bindings',async t=>{const c=client(t);let st=await start(c);assert.equal(st.actions[0].bindings.title,'测试工单');st=await advance(c,st,{id:'ticket-1'});assert.equal(st.actions[0].bindings.id,'ticket-1');st=await advance(c,st,{title:'测试工单'});assert.equal(st.verdicts[0].status,'pass');assert.deepEqual(st.verdicts[0].ruleRef,seed.ruleRef);assert.ok(st.verdicts[0].evidenceRefs.length);assert.equal(st.verdicts[0].scope,'observation_validation');writeFileSync(new URL('../../docs/evidence/t1-roundtrip.json',import.meta.url),JSON.stringify(st,null,2)+'\n');});
test('independent_check_continues and check variables are isolated',async t=>{const c=client(t),s=clone(seed);s.checks.push('independent');s.steps.push({stepId:'other-query',checkId:'independent',operationId:'query',actorRef:'owner',bindings:{},output:'saved'});s.assertions.push({id:'other-title',checkId:'independent',expr:eq(field('saved','title'),constant('独立'))});let st=await start(c,s);const key=st.actions[0].isolationKey;st=await advance(c,st,{}, {queryComplete:false});assert.equal(st.actions[0].checkId,'independent');assert.notEqual(st.actions[0].isolationKey,key);assert.equal(st.actions[0].requiresBaseline,true);st=await advance(c,st,{title:'独立'});assert.deepEqual(st.verdicts.map(x=>x.status),['inconclusive','pass']);});
test('unknown_action_rejected and duplicate observation does not advance twice',async t=>{const c=client(t);let st=await start(c);const obs=observation(st.actions[0],{id:'x'});const bad=await c.send({schemaVersion:1,messageId:'bad',runId:'run',kind:'observation',payload:{observation:{...obs,actionId:'forged'}}});assert.equal(bad[0].payload.code,'UNKNOWN_ACTION');st=await request(c,'run',{observation:obs},'observation','obs1');const retry=await request(c,'run',{observation:obs},'observation','obs1');assert.deepEqual(retry,st);const dup=await request(c,'run',{observation:obs},'observation','obs2');assert.equal(dup.actions.length,0);assert.equal(dup.code,'DUPLICATE_OBSERVATION');});
test('cancel_stops_dispatch and late observations are ignored',async t=>{const c=client(t);const st=await start(c);const r=await request(c,'run',{},'cancel');assert.equal(r.state,'cancelled');assert.deepEqual(r.actions,[]);const late=await advance(c,st,{id:'x'});assert.equal(late.state,'cancelled');assert.deepEqual(late.actions,[]);});
test('cancelled run cannot replay cached ACTION_READY',async t=>{const c=client(t);const payload={operation:'runTemplate',spec:clone(seed),capabilities:caps,rule,scope:{kind:'observation_validation',confirmed:true,validationRef:'t1'}};await request(c,'run',payload,'start','start1');await request(c,'run',{},'cancel');const replay=await request(c,'run',payload,'start','start1');assert.equal(replay.state,'cancelled');assert.deepEqual(replay.actions,[]);});
test('old run identity cannot be reused after another run',async t=>{const c=client(t);await start(c,clone(seed),'a');await request(c,'a',{},'cancel');await start(c,clone(seed),'b');await request(c,'b',{},'cancel');const r=await c.send({schemaVersion:1,messageId:'reuse',runId:'a',kind:'start',payload:{operation:'runTemplate',spec:clone(seed),capabilities:caps,rule,scope:{kind:'observation_validation',confirmed:true,validationRef:'t1'}}});assert.equal(r[0].payload.status,'error');assert.equal(r[0].payload.code,'RUN_ID_REUSED');});
test('no observation still times out and advances independent checks',async t=>{const {CoreExperiment}=await import('../../apps/host/dist/core/experiment.js');const c=client(t),s=clone(seed);s.limits.actionTimeoutMs=20;s.checks.push('independent');s.steps.push({stepId:'second',checkId:'independent',operationId:'query',actorRef:'owner',bindings:{},output:'saved'});s.assertions.push({id:'second-check',checkId:'independent',expr:eq(field('saved','title'),constant('ok'))});const seen=[];const runtime=new CoreExperiment(c,'auto',transition=>seen.push(transition));await runtime.start({operation:'runTemplate',spec:s,capabilities:caps,rule,scope:{kind:'observation_validation',confirmed:true,validationRef:'t1'}});const result=await runtime.waitForTerminal();assert.equal(result.state,'completed');assert.deepEqual(result.verdicts.map(x=>x.status),['inconclusive','inconclusive']);assert.ok(seen.some(x=>x.actions[0]?.checkId==='independent'));});
test('nested incompatible types and contains cannot pass through negation',async t=>{for(const expr of [{op:'not',arg:{op:'contains',args:[field('created','items'),constant('1')]}},{op:'neq',args:[field('created','nested'),constant({value:1})]}]){const r=await evaluate(t,expr,{items:[1],nested:{value:'1'}});assert.equal(r.verdicts[0].status,'inconclusive');assert.equal(r.verdicts[0].reasonCode,'TYPE_MISMATCH');}});
test('known violation retains unknown diagnostics',async t=>{const r=await evaluate(t,{op:'all',args:[eq(field('created','a'),constant(1)),eq(field('created','b'),constant(1))]},{a:2});assert.equal(r.verdicts[0].status,'fail');assert.ok(r.verdicts[0].unknownReasons.includes('MISSING_VALUE'));});
test('negation and comparison do not hide nested unknown diagnostics',async t=>{const partial={op:'all',args:[eq(field('created','a'),constant(1)),eq(field('created','b'),constant(1))]};for(const expr of [{op:'not',arg:partial},eq(partial,constant(false))]){const r=await evaluate(t,expr,{a:2});assert.equal(r.verdicts[0].status,'inconclusive');}});
test('replaying a consumed action never dispatches it again',async t=>{const c=client(t);const payload={operation:'runTemplate',spec:clone(seed),capabilities:caps,rule,scope:{kind:'observation_validation',confirmed:true,validationRef:'t1'}};let st=await request(c,'run',payload,'start','start1');st=await advance(c,st,{id:'x'});const replay=await request(c,'run',payload,'start','start1');assert.deepEqual(replay.actions,[]);assert.equal(replay.state,'running');assert.equal((await advance(c,st,{title:'测试工单'})).verdicts[0].status,'pass');});
test('rejected write is not accepted as a successful save',async t=>{const r=await evaluate(t,eq(field('created','a'),constant(1)),{a:1},{acceptance:'rejected'});assert.equal(r.verdicts[0].status,'inconclusive');});
test('duplicate observations cannot exhaust cancellation budget',async t=>{const c=client(t);const st=await start(c);const obs=observation(st.actions[0],{id:'x'});await request(c,'run',{observation:obs},'observation');for(let i=0;i<260;i++)await request(c,'run',{observation:obs},'observation');assert.equal((await request(c,'run',{},'cancel')).state,'cancelled');});
test('malformed observation never consumes the pending action',async t=>{const c=client(t);const st=await start(c);for(const extra of [{transportStatus:'garbage'},{transportStatus:'timeout',identityVerified:'bad',queryComplete:null}]){const r=await c.send({schemaVersion:1,messageId:crypto.randomUUID(),runId:'run',kind:'observation',payload:{observation:observation(st.actions[0],{id:'x'},extra)}});assert.equal(r[0].payload.status,'error');}const next=await advance(c,st,{id:'x'});assert.equal(next.actions[0].stepId,'query');});
test('type error under a proven false cannot become true under not',async t=>{const r=await evaluate(t,{op:'not',arg:{op:'all',args:[eq(field('created','a'),constant(1)),field('created','nonbool')]}},{a:2,nonbool:4});assert.equal(r.verdicts[0].status,'inconclusive');});
test('unconfirmed rule and formal run cannot bypass admission',async t=>{const c=client(t);for(const change of [{rule:{...rule,confirmation:'pending'}},{scope:{kind:'formal',confirmed:true,validationRef:'fake'}}]){const r=await c.send({schemaVersion:1,messageId:crypto.randomUUID(),runId:'bad',kind:'start',payload:{operation:'runTemplate',spec:clone(seed),capabilities:caps,rule,scope:{kind:'observation_validation',confirmed:true,validationRef:'t1-static'},...change}});assert.equal(r[0].payload.status,'error');}});
test('deadline cannot accept late passing evidence',async t=>{const c=client(t),s=clone(seed);s.limits.actionTimeoutMs=10;const st=await start(c,s);await new Promise(r=>setTimeout(r,30));const r=await advance(c,st,{id:'x'});assert.equal(r.verdicts[0].status,'inconclusive');assert.deepEqual(r.actions,[]);});

test('shared TS schema rejects malformed fixtures before core execution',async()=>{
  const {validateContract}=await import('../../packages/contracts/dist/validate.js');
  assert.equal(validateContract('TemplateSpec',seed).valid,true);
  for(const change of [s=>delete s.ruleRef,s=>s.steps[0].code='eval()',s=>s.revision='1',s=>s.assertions[0].expr={op:'eval',code:'true'},s=>s.limits.maxActions=0]){const s=clone(seed);change(s);assert.equal(validateContract('TemplateSpec',s).valid,false);}
});
for(const [name,normal,broken] of [['save-result',{title:'测试工单'},{title:'错误'}],['duplicate-submit',{items:[{id:'x'}]},{items:[{id:'x'},{id:'y'}]}],['permission-isolation',{items:[]},{items:[{id:'private'}]}]]) {
  for(const [suffix,result,want,extra] of [['normal',normal,'pass',{}],['business-defect',broken,'fail',{}],['insufficient',normal,'inconclusive',{queryComplete:false}]])test(`seed ${name} ${suffix}`,async t=>{
    const {validateContract}=await import('../../packages/contracts/dist/validate.js');
    const s=JSON.parse(readFileSync(new URL(`../../packages/contracts/fixtures/${name}.json`,import.meta.url)));assert.equal(validateContract('TemplateSpec',s).valid,true);
    const c=client(t);const currentRule={...rule,...s.ruleRef};let st=await request(c,'seed',{operation:'runTemplate',spec:s,capabilities:caps,rule:currentRule,scope:{kind:'observation_validation',confirmed:true,validationRef:'fixture'}});
    while(st.state==='running'){const last=st.actions[0].stepId===s.steps.at(-1).stepId;st=await advance(c,st,last?result:{id:'x'},last?extra:{});}
    assert.equal(st.verdicts[0].status,want);
  });
}
