import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,cp,rm,readFile,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import '../support/project-rules.mjs';
import {StatusTransitionAdmissionModel} from '../support/status-transition-admission-model.mjs';

// Existing-behavior integration regression, not a manufactured production RED.
// Only the explicitly declared test core and optional OS mutex are substituted.
const native=process.env.CANGJIE_NATIVE_S4==='1';
if(!native)mock.module('../../apps/host/dist/core/client.js',{namedExports:{CoreClient:StatusTransitionAdmissionModel}});

test('D8 actual controlled discovery without runtime configuration reaches validation, HTTP run, immutable export and reopened replay',{timeout:180000},async t=>{
  // Legacy candidate disclosure normalizes root casing; a lowercase UUID path
  // keeps this Linux development fixture portable without altering production.
  const directory=join(tmpdir(),'cangjie-s5-delivery-chain-'+randomUUID());await mkdir(directory);t.after(()=>rm(directory,{recursive:true,force:true}));
  const source=join(directory,'source'),projectId=randomUUID();await cp('samples/status-ticket',source,{recursive:true});await rm(join(source,'verification.json'));
  const {inspectProject,digest}=await import('../../apps/host/dist/projects/inspect.js');
  assert.equal((await inspectProject(source)).supported,false);await assert.rejects(access(join(source,'verification.json')));
  const {DiscoveryStore,currentDiscovery}=await import('../../apps/host/dist/discovery/store.js');
  const {DiscoveryService}=await import('../../apps/host/dist/discovery/service.js');
  const {buildSourceSnapshot}=await import('../../apps/host/dist/discovery/index.js');
  const {createAnalysisScope,validateSourceRefs}=await import('../../apps/host/dist/discovery/access.js');
  const {ModelCredentials}=await import('../../apps/host/dist/model/credentials.js');
  const {statusTransitionBehavior,statusTransitionRequirements}=await import('../../packages/contracts/dist/status-transition.js');
  const keys=new ModelCredentials();t.after(()=>keys.close());
  const requests=[];let discoveryCalls=0,candidateSpec;
  const provider=createServer(async(req,res)=>{
    try{
      let raw='';for await(const chunk of req)raw+=chunk;
      const body=JSON.parse(raw),payload=JSON.parse(body.messages[1].content),isDiscovery=body.messages[0].content.startsWith("Analyze this project's business");requests.push({raw,body,payload,isDiscovery});
      let value;
      if(isDiscovery){
        discoveryCalls++;
        if(discoveryCalls===1)value={kind:'actions',actions:[{type:'search',query:'closed',limit:20}]};
        else if(discoveryCalls===2)value={kind:'actions',actions:[{type:'read',path:'src/server.ts',startLine:26,endLine:39},{type:'read',path:'README.md',startLine:1,endLine:15}]};
        else{
          const code=payload.files.find(f=>f.path==='src/server.ts').sourceRef,doc=payload.files.find(f=>f.path==='README.md').sourceRef,refs=[code,doc];
          value={kind:'result',result:{summary:'受控工单关闭及拒绝重开业务',objects:['工单'],roles:['所有者'],flows:[{name:'关闭工单后拒绝重开',roles:['所有者'],steps:['创建open工单','关闭','查询','尝试重开','再次查询'],data:['title','status','ownerId'],sourceRefs:refs}],sourceRefs:refs,suggestions:[{id:'controlled-close',status:'suggestion',flow:'关闭工单后拒绝重开',facts:[{text:'实现拒绝closed到open，查询返回完整性声明。',sourceRefs:[code]}],expectations:[{text:'关闭不可逆，标题和归属在每次转换后保持不变。',source:'documentation',confirmation:'pending',sourceRefs:[doc]}],risks:[{text:'应分别核对关闭中间状态与拒绝重开后的状态。',sourceRefs:refs}],openQuestions:['是否采用公开受控工单契约及其操作和观察条件？'],sourceRefs:refs,priorityReason:'核对状态拒绝和字段不变性',operationNeeds:['create','query','update'],observationNeeds:['id','title','status','ownerId及查询完整性']}],limitations:['只读取选定源码与公开需求；尚未配置运行环境。'],unresolved:[]}};
        }
      }else{assert.ok(candidateSpec,'candidate generation must follow confirmed rule compilation');value=candidateSpec;}
      res.writeHead(200,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{total_tokens:20}}));
    }catch(error){res.writeHead(500);res.end(String(error));}
  });
  await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
  const closeProvider=()=>new Promise(resolve=>{provider.closeAllConnections();provider.close(resolve)});t.after(()=>closeProvider());
  const serviceUrl=`http://127.0.0.1:${provider.address().port}`,credentialRef=await keys.set(serviceUrl,'synthetic-s5-model-key',{remember:false}),config={serviceUrl,model:'deterministic-s5-development-only',credentialRef};
  const discoveryStore=new DiscoveryStore(join(directory,'discovery')),service=new DiscoveryService({store:discoveryStore,config:()=>config,credentials:keys});t.after(()=>service.close());
  const snapshot=await buildSourceSnapshot(source,projectId),scope={...createAnalysisScope(snapshot,{allowedPaths:['src','README.md'],excludedPaths:[],includeProjectTests:false,serviceUrl}),confirmedAt:new Date().toISOString()};
  const initial=await service.createDiscovery(snapshot,scope),analysis=await service.runDiscovery(initial.id,initial.revision);
  assert.equal(analysis.status,'completed',JSON.stringify(analysis.unresolved));assert.equal(discoveryCalls,3);assert.equal(analysis.reads.length,2);assert.equal(analysis.result.suggestions[0].expectations[0].confirmation,'pending');assert.equal((await inspectProject(source)).supported,false);
  assert.ok(requests[2].payload.files.some(f=>f.path==='src/server.ts'&&f.content.includes('closed ticket cannot reopen')));assert.ok(requests[2].payload.files.some(f=>f.path==='README.md'&&f.content.includes('标题和归属保持不变')));
  assert.equal((await validateSourceRefs(snapshot,analysis.reads,analysis.result.sourceRefs)).valid,true);
  const {ProjectRuleStore}=await import('../../apps/host/dist/rules/store.js');
  const validateSources=async rule=>{const record=await discoveryStore.get(rule.suggestionRef.discoveryId);if((await currentDiscovery(record)).reanalysisRequired||record.session.projectId!==rule.projectId||!(await validateSourceRefs(record.snapshot,record.session.reads,rule.sourceRefs)).valid)throw new Error('STALE_SOURCE');};
  const rules=new ProjectRuleStore(join(directory,'project-rules'),{validateSources}),suggestion=analysis.result.suggestions[0];
  const rule=await rules.confirmProjectRule(projectId,{suggestionRef:{discoveryId:analysis.id,suggestionId:suggestion.id},suggestion,answers:{[suggestion.openQuestions[0]]:'明确采用公开受控契约及所列操作、字段、完整查询和合成数据条件'},expectedBehavior:statusTransitionBehavior,requirements:statusTransitionRequirements,confirmed:true},0);
  assert.equal(rule.confirmation.status,'confirmed');assert.ok(rule.sourceRefs.every(ref=>analysis.reads.some(read=>digest(read.ref)===digest(ref))));
  await cp('samples/status-ticket/verification.json',join(source,'verification.json'));
  assert.equal((await currentDiscovery(await discoveryStore.get(analysis.id))).reanalysisRequired,false,'explicit business scope excludes newly supplied runtime metadata');
  const profile=await inspectProject(source);assert.equal(profile.supported,true);
  const compiler=await import('../../apps/host/dist/rules/compiler.js'),capabilities={operations:['create','query','update'],actorRefs:['owner','other'],expressions:['field','const','eq']},ruleRef={projectId,id:rule.id,version:rule.version,contentHash:rule.contentHash};
  const compiled=await compiler.registerCompiledRule(rules,ruleRef,profile.mapping,capabilities,{root:profile.root,hash:profile.sourceHash});assert.equal(compiled.status,'compiled',JSON.stringify(compiled));
  candidateSpec=JSON.parse(await readFile('tests/fixtures/status-transition-template.json','utf8'));candidateSpec.id='s5-public-close-candidate';candidateSpec.ruleRef={id:rule.id,version:rule.version};
  const {CandidateTask}=await import('../../apps/host/dist/model/candidate.js'),{disclose,confirmDisclosure}=await import('../../apps/host/dist/model/context.js');
  // Candidate context uses its separately confirmed source file. Discovery has
  // already read/cited README.md; avoid the legacy Linux lowercase-context bug.
  const context={projectId,root:profile.root,serviceUrl,entries:[{path:'src/server.ts',contentType:'source'}]};
  const task=await CandidateTask.create({rule:compiled.rule,capabilities,context,consent:confirmDisclosure(await disclose(context),true),config},keys);
  const data={source:'synthetic',count:2,seedVersion:'status-ticket-seed-v1'},candidate=await task.run({source:profile.root,projectId,confirmed:true,mapping:profile.mapping,data});
  assert.equal(candidate.status,'ready_for_review',JSON.stringify({code:candidate.code,phase:candidate.phase,issues:candidate.validation?.issues}));assert.equal(candidate.validation.interpreterVersion,native?'1.0.0':'test-only-model');assert.equal(candidate.validation.cases.length,20);
  for(const phase of ['observation','http'])assert.equal(candidate.validation.cases.filter(c=>c.phase===phase&&c.matched).length,10);
  assert.ok(candidate.validation.cases.some(c=>c.verdicts.some(v=>v.status==='fail')));assert.ok(candidate.validation.cases.some(c=>c.verdicts.some(v=>v.status==='inconclusive')));assert.equal(requests.length,4);
  const privateMarkers=['st-held-','suite-manifest','suite-lock','owner-defect','reopen-defect','status-transition-test-probe','held-owner','synthetic-s5-model-key','synthetic-s5-owner-pass','synthetic-s5-other-pass'];
  const sent=JSON.stringify(requests);for(const marker of privateMarkers)assert.ok(!sent.includes(marker),`private input leaked to model: ${marker}`);
  const {TemplateRegistry}=await import('../../apps/host/dist/templates/store.js'),registry=new TemplateRegistry(join(directory,'test-only-registry'));
  const draft=await registry.stageCandidate(task.id,{version:'1.0.0',applicable:['Controlled synthetic status-ticket only'],excluded:['Unrelated projects and semantics'],instructions:'Development test-only review; no actual human signature.'});
  const published=await registry.publishCandidate(candidate.candidateHash,candidate.validation,{scope:draft.draftHash,validationRef:candidate.validation.recordRef,decision:'approve',businessConfirmation:'test-only-business',technicalReviewer:'test-only-tech',time:new Date().toISOString()});
  const {CredentialSession}=await import('../../apps/host/dist/execution/session.js'),credentials=new CredentialSession();t.after(()=>credentials.close());credentials.set(projectId,'owner','synthetic-s5-owner-pass');credentials.set(projectId,'other','synthetic-s5-other-pass');
  const environment={source:profile.root,projectId,confirmed:true,mapping:profile.mapping,data,accounts:[{actorRef:'owner',username:'alpha',userId:'user-a',role:'user'},{actorRef:'other',username:'beta',userId:'user-b',role:'user'}],credentials};
  const {ArtifactStore}=await import('../../apps/host/dist/artifacts/store.js'),store=new ArtifactStore(join(directory,'runs')),{confirmPlan,RunExecutor,loadReplay}=await import('../../apps/host/dist/replay.js'),{exportPackage,readPackage}=await import('../../apps/host/dist/manifest.js'),{renderReport}=await import('../../apps/host/dist/report.js');
  const plan=confirmPlan({projectId,flow:{id:'close-ticket',title:'关闭工单后拒绝重开'},checks:[{rule:compiled.rule,templateRef:published.ref,mode:'verify'}],mapping:profile.mapping,sourceHash:profile.sourceHash});
  const run=await new RunExecutor(registry,store).run(plan,environment);assert.equal(run.status,'completed');assert.equal(run.checks[0].observations.length,6);assert.ok(run.checks[0].verdicts.every(v=>v.status==='pass'));assert.ok(Object.keys(run.evidence).length>=6);
  const report=renderReport(run),runBytes=await readFile(join(store.directory,run.id+'.json'));await writeFile(join(directory,'original-report.md'),report,{flag:'wx'});
  const exported=await exportPackage(store,run.id);await writeFile(join(directory,'original-export.json'),JSON.stringify(exported),{flag:'wx'});const exportBytes=await readFile(join(directory,'original-export.json'));
  for(const marker of privateMarkers)assert.ok(!JSON.stringify(exported).includes(marker),`private/credential content leaked to export: ${marker}`);
  await service.close();await closeProvider();keys.close();const modelCalls=requests.length;
  const reopenedDiscovery=new DiscoveryService({store:new DiscoveryStore(discoveryStore.directory),config:()=>config,credentials:new ModelCredentials()});t.after(()=>{reopenedDiscovery.credentials.close();return reopenedDiscovery.close()});assert.equal((await reopenedDiscovery.getDiscovery(analysis.id)).status,'completed');assert.equal((await new ProjectRuleStore(rules.directory).assertCurrent(ruleRef)).contentHash,rule.contentHash);
  const reopenedStore=new ArtifactStore(store.directory),reopenedRegistry=new TemplateRegistry(registry.directory),pkg=JSON.parse(await readFile(join(directory,'original-export.json'),'utf8'));
  assert.deepEqual(readPackage(pkg).run,await reopenedStore.get(run.id));const replay=await loadReplay(pkg,environment,reopenedRegistry),again=await new RunExecutor(reopenedRegistry,reopenedStore).run(replay.plan,environment,replay.parentRunId);
  assert.equal(again.status,'completed');assert.equal(again.parentRunId,run.id);assert.notEqual(again.checks[0].copyId,run.checks[0].copyId);assert.equal(again.checks[0].observations.length,6);assert.ok(again.checks[0].verdicts.every(v=>v.status==='pass'));assert.equal(requests.length,modelCalls);
  const relocated=join(directory,'relocated package 中文');await mkdir(relocated);await cp(join(directory,'original-export.json'),join(relocated,'export.json'));const relocatedPackage=JSON.parse(await readFile(join(relocated,'export.json'),'utf8'));assert.equal(readPackage(relocatedPackage).run.id,run.id);
  const foreignSource=join(relocated,'source');await cp(source,foreignSource,{recursive:true});assert.equal((await inspectProject(foreignSource)).sourceHash,profile.sourceHash);
  await assert.rejects(async()=>{const movedEnvironment={...environment,source:foreignSource},moved=await loadReplay(relocatedPackage,movedEnvironment,reopenedRegistry);return new RunExecutor(reopenedRegistry,reopenedStore).run(moved.plan,movedEnvironment,moved.parentRunId);},/RULE_PROJECT_MISMATCH/);
  assert.deepEqual(await readFile(join(store.directory,run.id+'.json')),runBytes);assert.equal(await readFile(join(directory,'original-report.md'),'utf8'),report);assert.deepEqual(await readFile(join(directory,'original-export.json')),exportBytes);
  t.diagnostic(JSON.stringify({sourceOnlyAnalysis:true,actualDiscoveryHttpCalls:discoveryCalls,scope:scope.allowedPaths,independentValidationPhases:20,actualRunObservations:6,reopenedReplayObservations:6,privateModelInputLeak:false,immutableOriginals:true,relocatedPackageView:true,foreignRootExecution:'RULE_PROJECT_MISMATCH',core:native?'native':'test-only-model',formalHumanReview:false,realModel:false}));
});
