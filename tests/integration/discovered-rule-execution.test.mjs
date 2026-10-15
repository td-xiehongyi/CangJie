import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import '../support/project-rules.mjs';
import {StatusTransitionAdmissionModel} from '../support/status-transition-admission-model.mjs';
// Explicit native opt-in never substitutes the core or its interpreter identity.
const nativeCore=process.env.CANGJIE_NATIVE_S4==='1';
if(!nativeCore)mock.module('../../apps/host/dist/core/client.js',{namedExports:{CoreClient:StatusTransitionAdmissionModel}});
const interpreterIdentity=nativeCore?'1.0.0':'test-only-model';
import {ProjectRuleStore,input,suggestion,ref} from '../support/project-rules.mjs';
const behavior=['工单允许 open→closed。','closed 后请求 open 必须被拒绝，状态仍为 closed。','标题和归属保持不变。'];
const requirements={operations:[{operationId:'create',actorRef:'owner',parameters:['title','status']},{operationId:'query',actorRef:'owner',parameters:['id']},{operationId:'update',actorRef:'owner',parameters:['id','status']}],observations:['id','title','status','ownerId'].map(field=>({operationId:'query',field,requiresComplete:true})),assertions:['eq'],dataConditions:['synthetic-status-ticket']};
async function api(){let available=true;try{await readFile('apps/host/dist/rules/compiler.js')}catch(e){if(e.code==='ENOENT')available=false;else throw e}assert.ok(available,'S4 project rule compiler is not implemented');return import('../../apps/host/dist/rules/compiler.js')}
async function setup(t){const directory=await mkdtemp(join(process.cwd(),'output/s4-compiler-'));t.after(()=>rm(directory,{recursive:true,force:true}));const store=new ProjectRuleStore(join(directory,'project-rules'));const rule=await store.confirmProjectRule(crypto.randomUUID(),{...input,suggestion:{...suggestion,id:'status-transition',flow:'工单关闭',sourceRefs:[ref]},suggestionRef:{discoveryId:'status-analysis',suggestionId:'status-transition'},expectedBehavior:behavior,requirements},0);return {directory,store,rule}}
const mapping={id:'status-map',version:1,targetRef:'source-status-ticket',authMode:'token',actorRefs:['owner','other'],auth:{loginPath:'/login',usernameField:'username',passwordField:'password',tokenPath:['token'],identityPath:'/me',idPath:['id']},operations:[{operationId:'create',method:'POST',path:'/tickets',bodyBindings:{title:'title',status:'status',intentId:'intent'}},{operationId:'query',method:'GET',path:'/tickets',queryBindings:{id:'id'}},{operationId:'update',method:'PATCH',path:'/tickets/:id',bodyBindings:{status:'status'}}],resultBindings:{create:{id:['id'],title:['title'],status:['status'],ownerId:['ownerId']},query:{id:['items','0','id'],title:['items','0','title'],status:['items','0','status'],ownerId:['items','0','ownerId'],items:['items']},update:{id:['id'],status:['status']}},queryCompleteness:{query:{itemsPath:['items'],totalPath:['total'],hasMorePath:['hasMore'],completePath:['complete']}}};
const capabilities={operations:['create','query','update'],actorRefs:['owner','other'],expressions:['field','const','eq']};
test('a confirmed new project rule compiles only its frozen semantic and explicitly mapped inputs',async t=>{const a=await api(),x=await setup(t),r=await a.compileRulePlan(x.rule,mapping,capabilities);assert.equal(r.status,'compiled',JSON.stringify(r));assert.equal(r.rule.id,x.rule.id);assert.equal(r.rule.version,x.rule.version);assert.match(r.rule.source,new RegExp(x.rule.projectId));assert.equal(r.ruleRef.contentHash,x.rule.contentHash);assert.equal(r.resourceId,'status-transition');assert.ok(!JSON.stringify(r).includes('heldOut'));assert.ok(!JSON.stringify(r).includes('cases'));assert.notEqual(r.rule.id,'title-update-rule');});
test('same operation names do not qualify changed semantics, missing status mapping, unknown fields or incomplete observation declarations',async t=>{const a=await api(),x=await setup(t);for(const [rule,m] of [[{...x.rule,expectedBehavior:['允许重新打开工单']},mapping],[x.rule,{...mapping,operations:mapping.operations.map(o=>o.operationId==='update'?{...o,bodyBindings:{title:'title'}}:o)}],[x.rule,{...mapping,operations:mapping.operations.map(o=>o.operationId==='update'?{...o,bodyBindings:{status:'status',script:'script'}}:o)}],[x.rule,{...mapping,resultBindings:{...mapping.resultBindings,query:{id:['items','0','id']}}}]]){const r=await a.compileRulePlan(rule,m,capabilities);assert.equal(r.status,'blocked');assert.ok(r.missing.length);}});
test('an unconfirmed version never compiles and missing private resources remain a gap',async t=>{const a=await api(),x=await setup(t);assert.equal((await a.compileRulePlan({...x.rule,confirmation:{status:'pending'}},mapping,capabilities)).status,'blocked');assert.equal(await a.loadCompiledValidationRule(x.rule.id,x.rule.version),undefined);});

test('new UUID rule traverses isolated deterministic candidate, admission, test-review, run and package replay', {timeout:120000},async t=>{
  const a=await api(),x=await setup(t),{inspectProject,digest}=await import('../../apps/host/dist/projects/inspect.js');
  const profile=await inspectProject('samples/status-ticket'),bound=await a.registerCompiledRule(x.store,{projectId:x.rule.projectId,id:x.rule.id,version:x.rule.version,contentHash:x.rule.contentHash},profile.mapping,capabilities,{root:profile.root,hash:profile.sourceHash});
  assert.equal(bound.status,'compiled');
  const loaded=await a.loadCompiledValidationRule(x.rule.id,1);assert.deepEqual(loaded.rule,bound.rule);
  const {resolveValidationSuite}=await import('../../apps/host/dist/validation/reference-runner.js');
  const suite=await resolveValidationSuite(bound.ruleRef);assert.equal(suite.rule.id,x.rule.id);assert.notEqual(suite.suiteHash,(await resolveValidationSuite(bound.ruleRef)).rule.source);
  await assert.rejects(resolveValidationSuite({...bound.ruleRef,projectId:crypto.randomUUID()}),/UNSUPPORTED_RULE/);
  const {createServer}=await import('node:http'),{writeFile}=await import('node:fs/promises');
  const spec=JSON.parse(await readFile('tests/fixtures/status-transition-template.json','utf8'));spec.ruleRef={id:bound.rule.id,version:bound.rule.version};spec.id='isolated-status-transition';
  const requests=[],server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;requests.push(JSON.parse(raw));res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(spec)}}],usage:{total_tokens:20}}))});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}));
  const contextRoot=await mkdtemp(join(x.directory,'public-context-'));t.after(()=>rm(contextRoot,{recursive:true,force:true}));await writeFile(join(contextRoot,'public.md'),'Synthetic local status-ticket project.');
  const {ModelCredentials}=await import('../../apps/host/dist/model/credentials.js'),{CandidateTask}=await import('../../apps/host/dist/model/candidate.js'),{disclose,confirmDisclosure}=await import('../../apps/host/dist/model/context.js');
  const keys=new ModelCredentials();t.after(()=>keys.close());const serviceUrl=`http://127.0.0.1:${server.address().port}`,credentialRef=await keys.set(serviceUrl,'synthetic-s4-key',{remember:false}),context={projectId:x.rule.projectId,root:contextRoot,serviceUrl,entries:[{path:'public.md',contentType:'summary'}]};
  await assert.rejects(CandidateTask.create({rule:bound.rule,capabilities,context:{...context,projectId:crypto.randomUUID()},consent:confirmDisclosure(await disclose(context),true),config:{serviceUrl,model:'deterministic-s4-only',credentialRef}},keys),/RULE_PROJECT_MISMATCH/);
  await assert.rejects(a.assertCompiledRuleProject(bound.rule,x.rule.projectId,profile.mapping,profile.sourceHash,'/tmp/foreign-source'),/RULE_PROJECT_MISMATCH/);
  const task=await CandidateTask.create({rule:bound.rule,capabilities,context,consent:confirmDisclosure(await disclose(context),true),config:{serviceUrl,model:'deterministic-s4-only',credentialRef}},keys);
  const result=await task.run({source:profile.root,projectId:x.rule.projectId,confirmed:true,mapping:profile.mapping,data:{source:'synthetic',count:2,seedVersion:'status-ticket-seed-v1'}});
  assert.equal(result.status,'ready_for_review',JSON.stringify({code:result.code,phase:result.phase,issues:result.validation?.issues}));assert.equal(result.validation.interpreterVersion,interpreterIdentity);assert.equal(result.trial.interpreterVersion,interpreterIdentity);assert.ok(result.validation.cases.some(c=>c.verdicts.some(v=>v.status==='fail')));assert.ok(result.validation.cases.some(c=>c.verdicts.some(v=>v.status==='inconclusive')));assert.equal(requests.length,1);
  const payload=JSON.parse(requests[0].messages[1].content);assert.deepEqual(payload.input.operationFormat.update.input,['id','status']);assert.ok(requests[0].messages[0].content.includes('closed-status'));
  const sent=JSON.stringify(requests);for(const privateText of ['st-held-','suite-manifest','owner-defect','reopen-defect','status-transition-test-probe','held-owner'])assert.ok(!sent.includes(privateText),privateText);
  const {TemplateRegistry}=await import('../../apps/host/dist/templates/store.js'),registry=new TemplateRegistry(join(x.directory,'test-only-registry'));
  const draft=await registry.stageCandidate(task.id,{version:'1.0.0',applicable:['Synthetic status-ticket only'],excluded:['All unrelated rules and projects'],instructions:'Test-only review, no human signature.'});
  await assert.rejects(registry.publishCandidate(result.candidateHash,result.validation,{scope:draft.draftHash,validationRef:result.validation.recordRef,decision:'approve',businessConfirmation:'',technicalReviewer:'test-only-tech',time:new Date().toISOString()}),/REVIEW_REQUIRED/);
  const published=await registry.publishCandidate(result.candidateHash,result.validation,{scope:draft.draftHash,validationRef:result.validation.recordRef,decision:'approve',businessConfirmation:'test-only-business',technicalReviewer:'test-only-tech',time:new Date().toISOString()});
  const {ArtifactStore}=await import('../../apps/host/dist/artifacts/store.js'),store=new ArtifactStore(join(x.directory,'runs')),{CredentialSession}=await import('../../apps/host/dist/execution/session.js'),credentials=new CredentialSession();t.after(()=>credentials.close());credentials.set(x.rule.projectId,'owner','synthetic-owner-pass');credentials.set(x.rule.projectId,'other','synthetic-other-pass');
  const {confirmPlan,RunExecutor,loadReplay}=await import('../../apps/host/dist/replay.js'),{exportPackage}=await import('../../apps/host/dist/manifest.js');
  const environment={source:profile.root,projectId:x.rule.projectId,confirmed:true,mapping:profile.mapping,data:{source:'synthetic',count:2,seedVersion:'status-ticket-seed-v1'},accounts:[{actorRef:'owner',username:'alpha',userId:'user-a',role:'user'},{actorRef:'other',username:'beta',userId:'user-b',role:'user'}],credentials};
  const plan=confirmPlan({projectId:x.rule.projectId,flow:{id:'close-ticket',title:'关闭工单后拒绝重开'},checks:[{rule:bound.rule,templateRef:published.ref,mode:'verify'}],mapping:profile.mapping,sourceHash:profile.sourceHash});
  const run=await new RunExecutor(registry,store).run(plan,environment);assert.equal(run.status,'completed');assert.deepEqual(run.checks[0].verdicts.map(v=>v.status),spec.assertions.map(()=> 'pass'));assert.equal(run.checks[0].observations.length,6);
  const pkg=await exportPackage(store,run.id);assert.ok(!JSON.stringify(pkg).includes('st-held-'));assert.ok(!JSON.stringify(pkg).includes('synthetic-owner-pass'));
  const reopened=await loadReplay(pkg,environment,registry),again=await new RunExecutor(registry,store).run(reopened.plan,environment,reopened.parentRunId);assert.equal(again.status,'completed');assert.notEqual(again.checks[0].copyId,run.checks[0].copyId);assert.deepEqual(again.checks[0].verdicts.map(v=>v.status),spec.assertions.map(()=> 'pass'));
  await assert.rejects(new RunExecutor(registry,store).run({...plan,projectId:crypto.randomUUID()},{...environment,projectId:crypto.randomUUID()}),/RULE_PROJECT_MISMATCH/);
  await assert.rejects(a.assertCompiledRuleProject(bound.rule,x.rule.projectId,{...profile.mapping,version:2},profile.sourceHash),/RULE_MAPPING_MISMATCH/);
  const current=await x.store.list(x.rule.projectId);await x.store.reviseProjectRule(bound.ruleRef,{expectedBehavior:['允许重开'],note:'测试修订'},current.revision);await assert.rejects(registry.assertQualified(published.ref),/STALE_PROJECT_RULE/);
});
test('compiled validation qualification refuses a changed runtime source before review',async t=>{
  const a=await api(),x=await setup(t),{cp,writeFile}=await import('node:fs/promises'),{inspectProject}=await import('../../apps/host/dist/projects/inspect.js');
  const source=join(x.directory,'source');await cp('samples/status-ticket',source,{recursive:true});const profile=await inspectProject(source);
  const plan=await a.registerCompiledRule(x.store,{projectId:x.rule.projectId,id:x.rule.id,version:1,contentHash:x.rule.contentHash},profile.mapping,capabilities,{root:profile.root,hash:profile.sourceHash});assert.equal(plan.status,'compiled');
  await writeFile(join(source,'README.md'),'changed source');await assert.rejects(a.loadCompiledValidationRule(x.rule.id,1),/STALE_PROJECT_RULE/);
});
test('controlled normalized field meanings cannot be relabelled as stable object IDs',async t=>{
  const a=await api(),x=await setup(t);
  for(const field of ['title','ownerId','status']){const m=structuredClone(mapping);m.resultBindings.query[field]=['items','0','id'];const r=await a.compileRulePlan(x.rule,m,capabilities);assert.equal(r.status,'blocked');assert.ok(r.missing.some(g=>g.code==='BUSINESS_EVIDENCE_GAP'))}
});
test('private status resources and bound rule journals never become model discovery inputs',async()=>{
  const {disclose}=await import('../../apps/host/dist/model/context.js');
  for(const [root,file] of [['tests/reference/status-transition','suite-manifest.json'],['tests/reference/status-transition/history/v1.0.0','suite-manifest.json']])await assert.rejects(disclose({projectId:'synthetic',root,serviceUrl:'http://127.0.0.1:9999',entries:[{path:file,contentType:'source'}]}),/SENSITIVE_FILE/);
});
test('status candidates reject schema-like parameters before any target action',async()=>{
  const {candidateShape}=await import('../../apps/host/dist/model/proposal.js'),{loadValidationSuite}=await import('../../apps/host/dist/validation/reference-runner.js'),suite=await loadValidationSuite('status-transition-rule'),spec=JSON.parse(await readFile('tests/fixtures/status-transition-template.json','utf8'));
  assert.equal(candidateShape(spec,suite.rule),true);
  for(const parameters of [{title:{type:'string'},intent:'synthetic'},{title:'',intent:'synthetic'},{title:'合成',intent:{type:'string'}},{title:'合成'}])assert.equal(candidateShape({...spec,parameters},suite.rule),false);
});
test('registration checks the current runtime snapshot inside the project transaction',async t=>{
  const a=await api(),x=await setup(t),{inspectProject}=await import('../../apps/host/dist/projects/inspect.js'),profile=await inspectProject('samples/status-ticket');
  await assert.rejects(a.registerCompiledRule(x.store,{projectId:x.rule.projectId,id:x.rule.id,version:1,contentHash:x.rule.contentHash},profile.mapping,capabilities,{root:profile.root,hash:profile.sourceHash,validateRuntime(){throw new Error('CONDITIONS_CHANGED_RECONNECT_REQUIRED')}}),/CONDITIONS_CHANGED_RECONNECT_REQUIRED/);
  assert.equal(await a.loadCompiledValidationRule(x.rule.id,1),undefined);
});
test('public model guidance sends only the current status obligations and executable parameters',async()=>{
  const {generateCandidate}=await import('../../apps/host/dist/model/proposal.js'),{loadValidationSuite}=await import('../../apps/host/dist/validation/reference-runner.js'),suite=await loadValidationSuite('status-transition-rule'),requests=[];
  await generateCandidate({async json(request){requests.push(request);return {value:{}}}},suite.rule,capabilities,{context:{}},0);
  const request=requests[0];for(const id of ['closed-status','remains-closed','unchanged-title','unchanged-owner','closed-unchanged-title','closed-unchanged-owner'])assert.ok(request.instructions.includes(id));assert.ok(!request.instructions.includes('newTitle'));assert.deepEqual(request.payload.operationFormat.update.input,['id','status']);assert.ok(!JSON.stringify(request).includes('st-held-'));
});
