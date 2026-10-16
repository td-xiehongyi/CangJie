import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {setupDiscovery,action,read,overview} from '../support/discovery.mjs';
import {prepareFullFileInput} from '../../apps/host/dist/discovery/full-input.js';
import {validBusinessOverview} from '@website-verification/contracts/discovery';

test('AI answer suggestions are optional and bounded to the original questions',()=>{
 const ref={snapshotId:'snapshot',path:'README.md',fileHash:'a'.repeat(64),startLine:1,endLine:2,excerptHash:'b'.repeat(64)};
 const value=overview([{path:'README.md',sourceRef:ref}]).result,s=value.suggestions[0],q=s.openQuestions[0];
 assert.equal(validBusinessOverview(value),true);
 s.suggestedAnswers={[q]:'建议仅所有者可取消，库存至多恢复一次，待人工核对。'};
 value.translations={[q]:'请核对取消权限与库存规则。'};
 assert.equal(validBusinessOverview(value),true);
 for(const bad of [[],null,{unrelated:'无关回答'},{[q]:4},{[q]:'x'.repeat(8001)}]){s.suggestedAnswers=bad;assert.equal(validBusinessOverview(value),false);}
 s.suggestedAnswers={};value.translations={[q]:{text:'invalid'}};assert.equal(validBusinessOverview(value),false);
});

test('full-file analysis restores compact citation IDs before validating and saving its business draft',async t=>{
  const x=await setupDiscovery(t,p=>{
    const response=overview(p.files);
    response.result.suggestions[0].suggestedAnswers={[response.result.suggestions[0].openQuestions[0]]:'建议仅所有者可取消，库存至多释放一次；待你核对。'};
    Object.assign(response.result.suggestions[0],{preconditions:[],exceptions:[],stateChanges:[]});
    return JSON.parse(JSON.stringify(response),(key,value)=>key==='sourceRefs'?value.map(ref=>p.input.knownSourceRefs.findIndex(known=>known.path===ref.path)):value);
  });
  const preview=await prepareFullFileInput(x.snapshot,x.scope,x.config,{mode:'automatic',prompt:''});
  const initial=await x.service.createDiscovery(x.snapshot,x.scope,{mode:'automatic',prompt:'',manifestHash:preview.manifestHash});
  const done=await x.service.runDiscovery(initial.id,initial.revision);
  assert.equal(done.status,'completed');assert.equal(x.requests.length,1);
  assert.ok(x.requests[0].body.messages[0].content.includes('integer IDs'));
  assert.match(x.requests[0].body.messages[0].content,/suggestedAnswers/);
  assert.match(x.requests[0].body.messages[0].content,/Chinese/);
  const source=initial.reads.find(r=>r.ref.path.endsWith('orders.ts')).ref;
  assert.deepEqual(done.result.sourceRefs,[source]);
  assert.deepEqual(done.result.suggestions[0].facts[0].sourceRefs,[source]);
  assert.equal(done.result.suggestions[0].expectations[0].confirmation,'pending');
  assert.deepEqual(done.result.suggestions[0].suggestedAnswers,{[done.result.suggestions[0].openQuestions[0]]:'建议仅所有者可取消，库存至多释放一次；待你核对。'});
  assert.ok(done.audit[0].response.result.sourceRefs.every(Number.isInteger));
  const compactBytes=Buffer.byteLength(JSON.stringify(done.audit[0].response.result)),expandedBytes=Buffer.byteLength(JSON.stringify(done.result));
  assert.ok(compactBytes<expandedBytes/2,'citation encoding should leave the output budget for business content');
  t.diagnostic(`same business draft: compact ${compactBytes} bytes, full references ${expandedBytes} bytes`);
  assert.deepEqual((await x.service.getDiscovery(initial.id)).result,done.result);
});

test('compact citations cannot refer outside actual reads and missing results stay invalid',async t=>{
  for(const [ref,source,code] of [[999,'ai_hypothesis','INVALID_SOURCE_REF'],[-1,'ai_hypothesis','INVALID_SOURCE_REF'],[0.5,'ai_hypothesis','INVALID_SOURCE_REF'],[null,'ai_hypothesis','INVALID_DISCOVERY_OUTPUT']]){
    const x=await setupDiscovery(t,p=>{
      if(ref===null)return {kind:'result'};
      const response=overview(p.files);Object.assign(response.result.suggestions[0],{preconditions:[],exceptions:[],stateChanges:[]});
      const compact=JSON.parse(JSON.stringify(response),(key,value)=>key==='sourceRefs'?value.map(()=>ref):value);
      compact.result.suggestions[0].expectations[0].source=source;return compact;
    });
    const preview=await prepareFullFileInput(x.snapshot,x.scope,x.config,{mode:'automatic',prompt:''});
    const initial=await x.service.createDiscovery(x.snapshot,x.scope,{mode:'automatic',prompt:'',manifestHash:preview.manifestHash});
    const done=await x.service.runDiscovery(initial.id,initial.revision);
    assert.equal(done.status,'failed');assert.equal(done.result,undefined);assert.ok(done.unresolved.includes(code));
  }
});

test('full-file analysis accepts an unwrapped overview but still rejects invalid structure and citations',async t=>{
 for(const mode of ['valid','missing-summary','invalid-ref','actions','legacy']){
  const x=await setupDiscovery(t,p=>{
   const value=overview(p.files).result;
   if(mode==='missing-summary')delete value.summary;
   if(mode==='invalid-ref')value.sourceRefs=[999];
   if(mode==='actions')return {kind:'actions',actions:[read('README.md')]};
   return value;
  });
  const preview=await prepareFullFileInput(x.snapshot,x.scope,x.config,{mode:'automatic',prompt:''});
  const initial=mode==='legacy'?await x.create():await x.service.createDiscovery(x.snapshot,x.scope,{mode:'automatic',prompt:'',manifestHash:preview.manifestHash});
  const done=await x.service.runDiscovery(initial.id,initial.revision);
  assert.equal(done.status,mode==='valid'?'completed':'failed',mode);
  assert.equal(x.requests.length,1);
  if(mode==='valid')assert.equal(done.result.suggestions[0].expectations[0].confirmation,'pending');
  else {assert.equal(done.result,undefined);assert.ok(done.unresolved.includes(mode==='invalid-ref'?'INVALID_SOURCE_REF':'INVALID_DISCOVERY_OUTPUT'),mode);}
 }
});

test('full-file draft keeps absent boundaries unknown and moves a wrongly sourced expectation to clarification',async t=>{
  const x=await setupDiscovery(t,p=>{
    const response=overview(p.files),source=p.files.find(f=>f.path.endsWith('orders.ts')).sourceRef;
    response.result.suggestions[0].expectations.push({text:'配置中的映射应作为测试要求吗？',source:'project_test',confirmation:'pending',sourceRefs:[source]});
    return JSON.parse(JSON.stringify(response),(key,value)=>key==='sourceRefs'?value.map(ref=>p.input.knownSourceRefs.findIndex(known=>known.path===ref.path)):value);
  });
  const preview=await prepareFullFileInput(x.snapshot,x.scope,x.config,{mode:'automatic',prompt:''});
  const initial=await x.service.createDiscovery(x.snapshot,x.scope,{mode:'automatic',prompt:'',manifestHash:preview.manifestHash});
  const done=await x.service.runDiscovery(initial.id,initial.revision);
  assert.equal(done.status,'completed');assert.equal(x.requests.length,1);
  const suggestion=done.result.suggestions[0];
  for(const field of ['preconditions','exceptions','stateChanges'])assert.deepEqual(suggestion[field],[]);
  assert.equal(suggestion.expectations.length,1);assert.equal(suggestion.expectations[0].source,'documentation');
  assert.ok(suggestion.openQuestions.includes('配置中的映射应作为测试要求吗？'));
  assert.ok(done.result.limitations.some(v=>v.includes('未提供')));
  assert.ok(done.result.limitations.some(v=>v.includes('来源')));
  assert.equal(done.audit[0].response.result.suggestions[0].expectations[1].source,'project_test','original provider response must remain auditable');
  assert.equal(done.audit[0].response.result.suggestions[0].preconditions,undefined);
});

test('source clarification preserves maximum-length text and the normalized draft still satisfies its contract',async t=>{
  const text='x'.repeat(8000);
  const x=await setupDiscovery(t,p=>{
    const response=overview(p.files);response.result.suggestions[0].flow=text;
    response.result.suggestions[0].expectations=[{text,source:'project_test',confirmation:'pending',sourceRefs:[p.files[0].sourceRef]}];
    return response;
  });
  const preview=await prepareFullFileInput(x.snapshot,x.scope,x.config,{mode:'automatic',prompt:''});
  const initial=await x.service.createDiscovery(x.snapshot,x.scope,{mode:'automatic',prompt:'',manifestHash:preview.manifestHash});
  const done=await x.service.runDiscovery(initial.id,initial.revision);
  assert.equal(done.status,'completed');assert.equal(validBusinessOverview(done.result),true);
  assert.ok(done.result.suggestions[0].openQuestions.includes(text));
});

test('discovery follows search, route, service/data/docs and returns cited unconfirmed project suggestions',async t=>{
  const x=await setupDiscovery(t,(p,n)=>n===1?action([{type:'search',query:'cancelOrder',limit:20}]):n===2?action([read('src/routes.ts',1,5)]):n===3?action([read('src/orders.ts',1,9),read('src/storage.ts',1,2),read('README.md',1,2)]):overview(p.files));
  const initial=await x.create(),done=await x.service.runDiscovery(initial.id,initial.revision);
  assert.equal(done.status,'completed');assert.equal(x.requests.length,4);assert.equal(done.reads.length,4);
  assert.equal(done.result.suggestions[0].status,'suggestion');assert.equal(done.result.suggestions[0].expectations[0].confirmation,'pending');
  assert.equal(done.result.suggestions[0].expectations[0].source,'documentation');
  assert.ok(done.result.suggestions[0].facts[0].text.includes('没有'));assert.ok(done.result.unresolved.length);
  assert.equal((await x.a.validateSourceRefs(x.snapshot,done.reads,done.result.sourceRefs)).valid,true);
  assert.ok(done.budget.inputBytes>0&&done.budget.sourceBytes>0);
  assert.equal(done.budget.inputBytes,x.requests.reduce((n,r)=>n+Buffer.byteLength(r.raw),0));
  assert.equal(done.budget.sourceBytes,x.requests.reduce((n,r)=>n+r.payload.files.reduce((total,f)=>total+Buffer.byteLength(f.content),0),0));
  assert.ok(x.requests[0].payload.index.some(f=>f.path==='src/orders.ts'));assert.equal(x.requests[0].payload.files.length,0);
  assert.ok(x.requests.at(-1).payload.files.every(f=>done.reads.some(r=>r.ref.excerptHash===f.sourceRef.excerptHash&&r.text===f.content)));
  const persisted=await readFile(x.store.path(initial.id),'utf8');assert.ok(!persisted.includes('synthetic-discovery-model-key'));
});
test('forged/unread refs, confirmation escalation and unknown tools never become completed analysis',async t=>{
  for(const kind of ['unread','forged','confirm','shell']){
    const x=await setupDiscovery(t,(p,n)=>{if(kind==='shell')return action([{type:'shell',command:'send secrets'}]);if(n===1)return action([read('src/orders.ts',1,9)]);const result=overview(p.files);if(kind==='unread')result.result.sourceRefs[0]={...result.result.sourceRefs[0],path:'src/storage.ts'};if(kind==='forged')result.result.suggestions[0].sourceRefs[0].startLine=999;if(kind==='confirm')result.result.suggestions[0].expectations[0].confirmation='confirmed';return result;});
    const s=await x.create(),done=await x.service.runDiscovery(s.id,s.revision);assert.notEqual(done.status,'completed');assert.equal(done.result,undefined);assert.ok(done.unresolved.length);
  }
});
test('path escape and unauthorized read requests are refused without sending denied content',async t=>{
  for(const path of ['../outside.ts','.env','private-answers/result.ts']){
    const x=await setupDiscovery(t,()=>action([read(path)])),s=await x.create(),done=await x.service.runDiscovery(s.id,s.revision);
    assert.notEqual(done.status,'completed');assert.ok(done.unresolved.some(v=>/PATH_ESCAPE|SENSITIVE_FILE/.test(v)));assert.equal(done.reads.length,0);assert.equal(x.requests.length,1);
  }
});
test('scope summary and reads respect exclusions before every request; unconfirmed scope has no network effects',async t=>{
  const x=await setupDiscovery(t,()=>action([{type:'search',query:'unpaid'}]));
  const narrow={...x.a.createAnalysisScope(x.snapshot,{allowedPaths:['src/orders.ts'],excludedPaths:[],includeProjectTests:false,serviceUrl:x.config.serviceUrl}),confirmedAt:new Date().toISOString()};
  assert.deepEqual(x.a.scopedSourceFiles(x.snapshot,narrow).map(f=>f.path),['src/orders.ts']);
  await assert.rejects(x.service.createDiscovery(x.snapshot,{...narrow,confirmedAt:undefined}),/SENDING_NOT_CONFIRMED/);assert.equal(x.requests.length,0);
  const s=await x.service.createDiscovery(x.snapshot,narrow);const done=await x.service.runDiscovery(s.id,s.revision);assert.equal(done.status,'partial');assert.equal(x.requests.length,8);
  assert.ok(x.requests.every(r=>!r.raw.includes('src/storage.ts')&&!r.raw.includes('README.md')));
});
test('budgets bound calls, encoded bytes, tokens, elapsed time and cumulative outgoing excerpts',async t=>{
  const cases=[{preset:{maxCalls:2},want:2},{preset:{maxInputBytes:100},want:0},{preset:{maxTokens:100},want:0},{preset:{deadlineMs:1},want:0},{sourceByteLimit:30,want:1,reads:true}];
  for(const limits of cases){
    const {MODEL_PRESET}=await import('../../apps/host/dist/model/budget.js');
    const x=await setupDiscovery(t,()=>action(limits.reads?[read('src/orders.ts',1,9)]:[{type:'search',query:'order'}]),{...limits,preset:{...MODEL_PRESET,...limits.preset}});
    const s=await x.create(),done=await x.service.runDiscovery(s.id,s.revision);assert.equal(done.status,'partial');assert.equal(x.requests.length,limits.want);assert.ok(done.unresolved.includes('ANALYSIS_BUDGET_EXHAUSTED'));
    const before=done.budget.calls;await x.service.runDiscovery(done.id,done.revision);assert.equal(x.requests.length,limits.want);assert.equal((await x.service.getDiscovery(done.id)).budget.calls,before);
  }
});
test('pause aborts in-flight work, preserves uncertain usage and explicit resume does not reset budget',async t=>{
  let started;const began=new Promise(r=>started=r);
  const x=await setupDiscovery(t,async(p,n)=>{if(n===1){started();await new Promise(r=>setTimeout(r,600));return action([read('src/orders.ts',1,9)])}if(n===2)return action([read('src/orders.ts',1,9)]);return overview(p.files)});
  const s=await x.create(),running=x.service.runDiscovery(s.id,s.revision);await began;
  const paused=await x.service.pauseDiscovery(s.id);await running;assert.equal(paused.status,'paused');assert.equal(paused.budget.calls,1);assert.ok(paused.audit.some(a=>a.status==='failed'&&a.usageUnknown));
  const reopened=new x.a.DiscoveryService({store:new x.a.DiscoveryStore(x.store.directory),config:()=>x.config,credentials:x.service.credentials});
  t.after(()=>reopened.close());assert.equal((await reopened.getDiscovery(s.id)).status,'paused');assert.equal(x.requests.length,1);
  const resumed=await reopened.runDiscovery(s.id,paused.revision);assert.equal(resumed.status,'completed');assert.equal(resumed.budget.calls,3);assert.equal(resumed.budget.startedAt,paused.budget.startedAt);
});
test('duplicate starts cannot dispatch twice, stale revisions cannot overwrite analysis selection',async t=>{
  let started;const began=new Promise(r=>started=r);let finish;const gate=new Promise(r=>finish=r);
  const x=await setupDiscovery(t,async(p,n)=>{if(n===1){started();await gate;return action([read('src/orders.ts',1,9)])}return overview(p.files)});
  const s=await x.create(),one=x.service.runDiscovery(s.id,s.revision);await began;const two=x.service.runDiscovery(s.id,s.revision);finish();await Promise.all([one,two]);assert.equal(x.requests.length,2);
  const done=await x.service.getDiscovery(s.id);await assert.rejects(x.service.selectSuggestion(s.id,'cancel-order-once',0),/ANALYSIS_CONFLICT/);
  const selected=await x.service.selectSuggestion(s.id,'cancel-order-once',done.revision);assert.equal(selected.selectedSuggestionId,'cancel-order-once');assert.equal(selected.result.suggestions[0].status,'suggestion');
});
test('changed source invalidates pending analysis and displayed citations without mixing versions',async t=>{
  const x=await setupDiscovery(t,async(p,n)=>{if(n===1)return action([read('src/orders.ts',1,9)]);await writeFile(join(x.root,'src/orders.ts'),'export const changed=1;');return overview(p.files)});
  const s=await x.create(),done=await x.service.runDiscovery(s.id,s.revision);assert.equal(done.status,'stale');assert.ok(done.unresolved.some(v=>v.includes('STALE_SOURCE')));
  assert.notEqual((await x.service.getDiscovery(s.id)).referencesValid,true);
});
test('checkpoint failure blocks network dispatch and persisted reservation cannot be silently replayed',async t=>{
  const x=await setupDiscovery(t,()=>action([{type:'search',query:'order'}])),s=await x.create();
  const save=x.store.save.bind(x.store);let writes=0;x.store.save=async(...args)=>{if(++writes>=2)throw new Error('synthetic write failure');return save(...args)};
  await assert.rejects(x.service.runDiscovery(s.id,s.revision),/synthetic write failure|ANALYSIS_SAVE_FAILED/);assert.equal(x.requests.length,0);
});
test('orphaned drafts recover as paused without dispatch, including an initial save failure',async t=>{
  const x=await setupDiscovery(t,()=>({kind:'insufficient',unresolved:['待补充'],limitations:[]})),s=await x.create();
  const recovered=await x.service.getDiscovery(s.id);assert.equal(recovered.status,'paused');assert.ok(recovered.unresolved.includes('INTERRUPTED_ANALYSIS'));assert.equal(x.requests.length,0);
  const save=x.store.save.bind(x.store);x.store.save=async()=>{throw new Error('synthetic write failure')};
  await assert.rejects(x.service.runDiscovery(s.id,s.revision),/synthetic write failure|ANALYSIS_SAVE_FAILED/);
  assert.equal((await x.service.getDiscovery(s.id)).status,'paused');assert.equal(x.service.active(),false);assert.equal(x.requests.length,0);
  x.store.save=save;const done=await x.service.runDiscovery(s.id,s.revision);assert.equal(done.status,'partial');assert.equal(done.budget.calls,1);
});
test('insufficient information stays partial without invented flows or business expectations',async t=>{
  const x=await setupDiscovery(t,()=>({kind:'insufficient',unresolved:['缺少业务入口和权限资料'],limitations:['未读取正文']}));
  const s=await x.create(),done=await x.service.runDiscovery(s.id,s.revision);
  assert.equal(done.status,'partial');assert.ok(done.unresolved.includes('缺少业务入口和权限资料'));assert.equal(done.result,undefined);
});
test('at most four excerpt actions execute per response, partial suggestions survive budget exhaustion',async t=>{
  const {MODEL_PRESET}=await import('../../apps/host/dist/model/budget.js');
  const x=await setupDiscovery(t,(p,n)=>n===1?action([read('src/orders.ts',1,9)]):({...action([{type:'search',query:'order'}]),partial:overview(p.files).result}),{preset:{...MODEL_PRESET,maxCalls:2}});
  const s=await x.create(),done=await x.service.runDiscovery(s.id,s.revision);assert.equal(done.status,'partial');assert.equal(done.result.suggestions[0].status,'suggestion');
  const y=await setupDiscovery(t,()=>action(Array.from({length:5},()=>read('src/orders.ts',1,2))));const other=await y.create(),rejected=await y.service.runDiscovery(other.id,other.revision);assert.notEqual(rejected.status,'completed');assert.equal(rejected.reads.length,0);
});
test('typed token logic remains original cited source while an actual model key is withheld',async t=>{
  const x=await setupDiscovery(t,(p,n)=>n===1?action([read('src/auth.ts',1,1)]):overview(p.files,'身份检查'));
  await writeFile(join(x.root,'src/auth.ts'),'export function identify(token: string) { return token.length > 0; }');
  const snapshot=await x.a.buildSourceSnapshot(x.root,'source-orders'),scope={...x.a.createAnalysisScope(snapshot,{allowedPaths:['src'],excludedPaths:[],includeProjectTests:false,serviceUrl:x.config.serviceUrl}),confirmedAt:new Date().toISOString()};
  const s=await x.service.createDiscovery(snapshot,scope),done=await x.service.runDiscovery(s.id,s.revision);
  assert.equal(done.status,'completed');assert.ok(x.requests.at(-1).payload.files[0].content.includes('token: string'));
  const y=await setupDiscovery(t,()=>action([read('src/value.ts',1,1)]));await writeFile(join(y.root,'src/value.ts'),'export const value = "synthetic-discovery-model-key";');
  const snap=await y.a.buildSourceSnapshot(y.root,'source-orders'),allow={...y.a.createAnalysisScope(snap,{allowedPaths:['src'],excludedPaths:[],includeProjectTests:false,serviceUrl:y.config.serviceUrl}),confirmedAt:new Date().toISOString()};
  const initial=await y.service.createDiscovery(snap,allow),rejected=await y.service.runDiscovery(initial.id,initial.revision);assert.notEqual(rejected.status,'completed');assert.ok(y.requests.every(r=>!r.raw.includes('synthetic-discovery-model-key')));
  assert.ok(!(await readFile(y.store.path(initial.id),'utf8')).includes('synthetic-discovery-model-key'));
});
test('explicit retry of invalid model output preserves task budget and does not replay the bad response',async t=>{
  const x=await setupDiscovery(t,(p,n)=>n===1?{kind:'invalid'}:n===2?action([read('src/orders.ts',1,9)]):overview(p.files));
  const initial=await x.create(),failed=await x.service.runDiscovery(initial.id,initial.revision);assert.equal(failed.status,'failed');
  const done=await x.service.runDiscovery(initial.id,failed.revision);assert.equal(done.status,'completed');assert.equal(done.budget.calls,3);assert.equal(done.budget.startedAt,initial.budget.startedAt);
});
test('known model keys hidden in index metadata are refused before a session record is written',async t=>{
  const x=await setupDiscovery(t,()=>action([]));await writeFile(join(x.root,'src/routes.ts'),"router.post('/synthetic-discovery-model-key', handler);");
  const snapshot=await x.a.buildSourceSnapshot(x.root,'source-orders'),scope={...x.a.createAnalysisScope(snapshot,{allowedPaths:['src'],excludedPaths:[],includeProjectTests:false,serviceUrl:x.config.serviceUrl}),confirmedAt:new Date().toISOString()};
  await assert.rejects(x.service.createDiscovery(snapshot,scope),/SENSITIVE_FILE/);assert.equal(x.requests.length,0);
});
test('opted-in project tests are disclosed input expectations and cannot be mislabeled source facts',async t=>{
  const x=await setupDiscovery(t,(p,n)=>{if(n===1)return action([read('src/orders.ts',1,9),read('tests/orders.test.ts',1,1)]);const result=overview(p.files);result.result.suggestions[0].expectations[0]={text:'项目测试表达所有者预期，仍待人工核对。',source:'project_test',confirmation:'pending',sourceRefs:[p.files.find(f=>f.path==='tests/orders.test.ts').sourceRef]};return result});
  await mkdir(join(x.root,'tests'));await writeFile(join(x.root,'tests/orders.test.ts'),'export const expectation = "only owner cancels";');
  const snapshot=await x.a.buildSourceSnapshot(x.root,'source-orders',{includeProjectTests:true}),scope={...x.a.createAnalysisScope(snapshot,{allowedPaths:['.'],excludedPaths:[],includeProjectTests:true,serviceUrl:x.config.serviceUrl}),confirmedAt:new Date().toISOString()};
  const initial=await x.service.createDiscovery(snapshot,scope),done=await x.service.runDiscovery(initial.id,initial.revision);assert.equal(done.status,'completed');assert.equal(done.result.suggestions[0].expectations[0].source,'project_test');assert.equal(x.requests.at(-1).payload.files.find(f=>f.path==='tests/orders.test.ts').sourceKind,'project_test');
});
