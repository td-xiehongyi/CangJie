import express from 'express';
import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {replaceFile} from './artifacts/replace.js';
import {join} from 'node:path';
import type {Server} from 'node:http';
import type {RuleContract} from '@website-verification/contracts';
import {inspectProject,digest,type ProjectProfile} from './projects/inspect.js';
import {validateMapping,type HttpMapping} from './execution/mapping.js';
import {CredentialSession} from './execution/session.js';
import {ModelCredentials} from './model/credentials.js';
import {ModelProvider,type ModelConfig} from './model/provider.js';
import {ModelBudget,MODEL_PRESET,type BudgetUsage} from './model/budget.js';
import {disclose,confirmDisclosure,scrubSecrets,type DisclosureConsent,type ContextRequest} from './model/context.js';
import {propose} from './model/proposal.js';
import {CandidateTask} from './model/candidate.js';
import {TemplateRegistry,type RegistryDraft,type TemplateRef} from './templates/store.js';
import {ArtifactStore,validId} from './artifacts/store.js';
import {exportPackage,readPackage} from './manifest.js';
import {renderReport} from './report.js';
import {RunExecutor,confirmPlan,loadReplay,type RunRecord,type RunEnvironment} from './replay.js';
import {capabilities} from './validation/observations.js';
import {loadValidationSuite} from './validation/reference-runner.js';
import {projectRoot} from './validation/review.js';
import {startTargetLoad,LoadStore,renderLoadReport,LOAD_PRESET,type LoadHandle} from './load/runner.js';

interface Project {id:string;purpose:string;profile:ProjectProfile;mapping:HttpMapping;accounts:RunEnvironment['accounts'];data:RunEnvironment['data'];entries:ContextRequest['entries'];environmentHash:string;environmentConfirmed?:string;consent?:DisclosureConsent;analysis?:{status:string;code?:string;proposal?:unknown;budget?:BudgetUsage;environmentHash?:string};analysisHistory?:unknown[];candidateId?:string;candidateIds?:Record<string,string>;draft?:RegistryDraft}
const ruleIds=['save-rule','duplicate-rule','permission-rule','title-update-rule'];
export async function startWorkbench(options:{directory?:string;registryDirectory?:string;port?:number;uiDirectory?:string}={}){
  const directory=options.directory??join(projectRoot,'.local-data/workbench');await mkdir(directory,{recursive:true});
  const registry=new TemplateRegistry(options.registryDirectory),store=new ArtifactStore(join(directory,'runs')),credentials=new CredentialSession(),modelKeys=new ModelCredentials();
  const loads=new LoadStore(join(directory,'loads')),activeLoads=new Map<string,LoadHandle>();
  const loadBusy=(projectId:string)=>[...activeLoads.values()].some(h=>h.snapshot().projectId===projectId);
  const projects=new Map<string,Project>(),active=new Map<string,{executor:RunExecutor;record?:RunRecord;projectId:string;promise:Promise<unknown>}>(),candidateJobs=new Map<string,Promise<unknown>>();
  let config:ModelConfig={serviceUrl:'https://api.deepseek.com',model:''},connection={status:'not_checked',code:''};
  const configFile=join(directory,'state.json');
  try{const saved=JSON.parse(await readFile(configFile,'utf8'));config=saved.config;for(const p of saved.projects??[]){if(p.analysis?.status==='running'){p.analysis.status='paused';p.analysis.code='INTERRUPTED_MODEL_CALL';}projects.set(p.id,p);}}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  let saveQueue:Promise<void>=Promise.resolve();
  const save=()=>{saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    const tmp=join(directory,randomUUID()+'.tmp');
    await writeFile(tmp,JSON.stringify({config:{...config,credentialRef:config.credentialRef?.startsWith('windows:')?config.credentialRef:undefined},projects:[...projects.values()]},null,2));
    await replaceFile(tmp,configFile);
  });return saveQueue;};
  const project=(id:string)=>{const p=projects.get(id);if(!p)throw new Error('PROJECT_NOT_FOUND');return p;};
  const modelIdle=(id?:string)=>{if(id?(candidateJobs.has(id)||candidateJobs.has('analysis:'+id)):candidateJobs.size)throw new Error('MODEL_WORK_ACTIVE');};
  const freshEnvironment=async(p:Project)=>{if((await inspectProject(p.profile.root)).sourceHash!==p.profile.sourceHash)throw new Error('CONDITIONS_CHANGED_RECONNECT_REQUIRED');};
  const context=(p:Project):ContextRequest=>({projectId:p.id,root:p.profile.root,serviceUrl:config.serviceUrl,entries:p.entries});
  const env=(p:Project,reconfirmedChanges=false):RunEnvironment=>({source:p.profile.root,projectId:p.id,confirmed:p.environmentConfirmed===p.environmentHash,data:p.data,accounts:p.accounts,credentials,reconfirmedChanges});
  const publicCandidate=async(p:Project)=>{if(!p.candidateId)return undefined;const s=(await CandidateTask.open(p.candidateId,modelKeys)).snapshot();return {id:s.id,status:s.status,phase:s.phase,code:s.code,revisionIndex:s.revisionIndex,budget:s.budget,preset:MODEL_PRESET,validation:s.validation?{gateResults:s.validation.gateResults,recordRef:s.validation.recordRef,cases:s.validation.cases,issues:s.validation.issues}:undefined,trial:s.trial?{completed:s.trial.completed,verdicts:s.trial.verdicts}:undefined,spec:s.drafts.at(-1)?.value,draftHash:p.draft?.draftHash};};
  const rules:RuleContract[]=[];
  // Load only public rule contracts, never the private suite cases/answers.
  try{rules.push(...JSON.parse(await readFile(join(projectRoot,'resources/public-rules.json'),'utf8')));}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;const manifest=JSON.parse(await readFile(join(projectRoot,'tests/reference/suite-manifest.json'),'utf8'));for(const entry of manifest.suites)rules.push(structuredClone(entry.rule));}
  const rule=(id:string)=>{const r=rules.find(r=>r.id===id);if(!r)throw new Error('RULE_CAPABILITY_GAP');return structuredClone(r);};
  const app=express();app.disable('x-powered-by');let origin='';const token=randomBytes(32).toString('hex');
  app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");if(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return void res.status(403).json({error:'ORIGIN_REJECTED'});next();});
  app.use(express.json({limit:'18mb'}));
  app.get('/api/session',(_req,res)=>res.json({token}));
  app.use('/api',(req,res,next)=>{const given=req.headers.authorization?.replace(/^Bearer /,'')??'';if(given.length!==token.length||!timingSafeEqual(Buffer.from(given),Buffer.from(token)))return void res.status(401).json({error:'SESSION_REQUIRED'});next();});
  app.get('/api/state',async(_req,res)=>{
    const catalog=await registry.matchReport(capabilities,rules),runs=await store.list();
    for(const [id,r]of active){if(r.record){const index=runs.findIndex(v=>v.id===id);if(index<0)runs.push(r.record);else runs[index]=r.record;}}
    const {readdir}=await import('node:fs/promises');await mkdir(loads.directory,{recursive:true});const loadIds=new Set((await readdir(loads.directory)).filter(n=>/^[a-f0-9-]{36}(\.pending)?\.json$/.test(n)).map(n=>n.slice(0,36)));for(const id of activeLoads.keys())loadIds.add(id);
    const loadRecords=await Promise.all([...loadIds].map(async id=>{const r=activeLoads.get(id)?.snapshot()??await loads.getLoad(id);return {...r,ledger:undefined,evidence:undefined,environment:undefined};}));
    res.json({loadPreset:LOAD_PRESET,loads:loadRecords,projects:await Promise.all([...projects.values()].map(async p=>({id:p.id,purpose:p.purpose,directory:p.profile.root,name:p.profile.name,supported:p.profile.supported,gaps:p.profile.gaps,gapMarkdown:p.profile.gapMarkdown,sourceHash:p.profile.sourceHash,mapping:p.mapping,accounts:p.accounts.map(a=>({...a,hasPassword:credentials.has(p.id,a.actorRef)})),data:p.data,entries:p.entries,environmentHash:p.environmentHash,environmentConfirmed:p.environmentHash===p.environmentConfirmed,consent:p.consent,analysis:p.analysis,candidate:await publicCandidate(p)}))),rules:rules.map(r=>({...r,hash:digest(r)})),catalog,runs:runs.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)),settings:{serviceUrl:config.serviceUrl,model:config.model,remembered:config.credentialRef?.startsWith('windows:')??false,hasKey:!!config.credentialRef,connection},preset:MODEL_PRESET});
  });
  app.post('/api/settings',async(req,res)=>{
    modelIdle();const next={serviceUrl:String(req.body.serviceUrl??''),model:String(req.body.model??'')};new ModelProvider(next,modelKeys,new ModelBudget());
    const changed=next.serviceUrl!==config.serviceUrl||next.model!==config.model||!!req.body.key;
    let credentialRef=next.serviceUrl===config.serviceUrl?config.credentialRef:undefined;
    if(typeof req.body.key==='string'&&req.body.key)credentialRef=await modelKeys.set(next.serviceUrl,req.body.key,{remember:req.body.remember===true});
    if(credentialRef&&!req.body.key&&(req.body.remember===true)!==credentialRef.startsWith('windows:'))credentialRef=await modelKeys.set(next.serviceUrl,await modelKeys.get(credentialRef,next.serviceUrl),{remember:req.body.remember===true});
    if(config.credentialRef&&config.credentialRef!==credentialRef)await modelKeys.clear(config.credentialRef);
    if(next.serviceUrl!==config.serviceUrl)for(const p of projects.values())delete p.consent;
    config={...next,...(credentialRef?{credentialRef}:{})};if(changed)connection={status:'not_checked',code:''};await save();res.json({saved:true});
  });
  app.post('/api/settings/clear',async(_req,res)=>{modelIdle();if(config.credentialRef)await modelKeys.clear(config.credentialRef);delete config.credentialRef;connection={status:'not_checked',code:''};await save();res.json({cleared:true});});
  app.post('/api/settings/check',async(_req,res)=>{connection={status:'running',code:''};try{await new ModelProvider(config,modelKeys,new ModelBudget()).checkConnection();connection={status:'connected',code:''};res.json(connection);}catch(e){connection={status:'failed',code:(e as Error).message};throw e;}});
  app.post('/api/projects',async(req,res)=>{
    const old=req.body.id?project(String(req.body.id)):undefined;if(old)modelIdle(old.id);if(old&&(loadBusy(old.id)||[...active.values()].some(a=>a.projectId===old.id)))throw new Error('PROJECT_BUSY');
    const profile=await inspectProject(String(req.body.directory??'')),id=old?.id??randomUUID();
    const accounts=(req.body.accounts??old?.accounts??[]) as (RunEnvironment['accounts'][number]&{password?:string})[];
    if(accounts.length!==2||accounts.some(a=>!a.actorRef||!a.username||!a.userId||a.role!=='user'))throw new Error('TEST_ACCOUNT_CONFIG_GAP');
    const mapping=structuredClone(req.body.mapping??profile.mapping);validateMapping(mapping);
    const data={source:'synthetic' as const,count:Number(req.body.count??old?.data.count??2),seedVersion:profile.initialization?.version??''};
    if(!Number.isSafeInteger(data.count)||data.count<0||data.count>1000)throw new Error('INVALID_DATA_COUNT');
    const publicAccounts=accounts.map(({actorRef,username,userId,role})=>({actorRef,username,userId,role}));
    const environmentHash=digest({sourceHash:profile.sourceHash,mapping,accounts:publicAccounts,data});
    const p:Project={id,purpose:String(req.body.purpose??old?.purpose??''),profile,mapping,accounts:publicAccounts,data,entries:req.body.entries??old?.entries??[{path:'verification.json',contentType:'summary'}],environmentHash,...(old?.environmentHash===environmentHash?{environmentConfirmed:old.environmentConfirmed}:{}),...(old?{consent:old.consent,candidateId:old.candidateId,candidateIds:old.candidateIds,draft:old.draft,analysis:old.analysis,analysisHistory:old.analysisHistory}: {})};
    if(old&&digest(old.entries)!==digest(p.entries)||old&&old.profile.root!==profile.root)delete p.consent;
    for(const a of accounts)if(a.password)credentials.set(id,a.actorRef,a.password);projects.set(id,p);await save();res.json({projectId:id});
  });
  app.post('/api/projects/:id/scope',async(req,res)=>{const p=project(req.params.id);modelIdle(p.id);p.entries=structuredClone(req.body.entries);delete p.consent;await save();res.json(await disclose(context(p)));});
  app.get('/api/projects/:id/disclosure',async(req,res)=>res.json(await disclose(context(project(req.params.id)))));
  app.post('/api/projects/:id/confirm',async(req,res)=>{const p=project(req.params.id);if(req.body.environment===true){await freshEnvironment(p);if(req.body.environmentHash!==p.environmentHash)throw new Error('STALE_ENVIRONMENT_CONFIRMATION');p.environmentConfirmed=p.environmentHash;}if(req.body.send===true){const d=await disclose(context(p));if(req.body.scopeHash!==d.scopeHash)throw new Error('STALE_SCOPE_CONFIRMATION');p.consent=confirmDisclosure(d,true);}await save();res.json({confirmed:true});});
  app.post('/api/projects/:id/passwords',async(req,res)=>{const p=project(req.params.id);for(const a of p.accounts){const value=req.body[a.actorRef];if(typeof value==='string'&&value)credentials.set(p.id,a.actorRef,value);}res.json({savedInSession:true});});
  app.post('/api/projects/:id/analyze',async(req,res)=>{
    const p=project(req.params.id);await freshEnvironment(p);if(!env(p).confirmed)throw new Error('PROJECT_CONFIRMATION_REQUIRED');if(p.analysis?.status==='running')throw new Error('ANALYSIS_BUSY');
    const newConditions=p.analysis?.environmentHash&&p.analysis.environmentHash!==p.environmentHash;if(newConditions){(p.analysisHistory??=[]).push(p.analysis);p.analysis=undefined;}const environmentHash=p.environmentHash;const budget=new ModelBudget(MODEL_PRESET,p.analysis?.budget);p.analysis={status:'running',environmentHash,budget:budget.usage};await save();
    const provider=new ModelProvider(config,modelKeys,budget,async()=>{p.analysis!.budget=budget.usage;await save();});
    const job=propose(provider,{context:context(p),consent:p.consent},[]).then(async proposal=>{p.analysis={status:'completed',environmentHash,proposal,budget:budget.usage};await save();}).catch(async e=>{p.analysis={status:'paused',environmentHash,code:e.message,budget:budget.usage};await save();});
    candidateJobs.set('analysis:'+p.id,job);void job.finally(()=>{if(candidateJobs.get('analysis:'+p.id)===job)candidateJobs.delete('analysis:'+p.id);}).catch(()=>{});res.status(202).json({status:'running'});
  });
  app.post('/api/projects/:id/candidate',async(req,res)=>{
    const p=project(req.params.id);if(candidateJobs.has(p.id))throw new Error('CANDIDATE_BUSY');if(!env(p).confirmed)throw new Error('PROJECT_CONFIRMATION_REQUIRED');if(req.body.confirmRule!==true)throw new Error('RULE_CONFIRMATION_REQUIRED');
    await freshEnvironment(p);const selected=rule(String(req.body.ruleId));let task:CandidateTask;p.candidateIds??={};if(p.candidateId){const existing=await CandidateTask.open(p.candidateId,modelKeys);p.candidateIds[existing.snapshot().input.rule.id]=p.candidateId;}const previousId=p.candidateId;p.candidateId=p.candidateIds[selected.id];if(previousId!==p.candidateId)delete p.draft;
    if(p.candidateId){task=await CandidateTask.open(p.candidateId,modelKeys);if(digest(task.snapshot().input.rule)!==digest(selected))throw new Error('RULE_VERSION_MISMATCH');await task.reconfigure({context:context(p),consent:p.consent,config});}
    else{task=await CandidateTask.create({rule:selected,capabilities,context:context(p),consent:p.consent,config},modelKeys);p.candidateId=task.id;p.candidateIds[selected.id]=task.id;delete p.draft;await save();}
    await save();const job=task.run({...env(p),mapping:p.mapping,sourceHash:p.profile.sourceHash}).finally(()=>{candidateJobs.delete(p.id);});candidateJobs.set(p.id,job);void job.catch(()=>{});res.status(202).json({candidateId:task.id});
  });
  app.post('/api/projects/:id/review',async(req,res)=>{const p=project(req.params.id);if(!p.candidateId)throw new Error('NO_CANDIDATE');p.draft=await registry.stageCandidate(p.candidateId,req.body.metadata);await save();res.json({draftHash:p.draft.draftHash,validationRef:p.draft.validation.recordRef});});
  app.post('/api/projects/:id/publish',async(req,res)=>{const p=project(req.params.id);if(!p.draft||req.body.scope!==p.draft.draftHash||req.body.businessConfirmed!==true||req.body.technicalReviewed!==true)throw new Error('REVIEW_REQUIRED');const published=await registry.publishCandidate(p.draft.candidateHash,p.draft.validation,{scope:p.draft.draftHash,validationRef:p.draft.validation.recordRef!,decision:'approve',businessConfirmation:req.body.businessConfirmation,technicalReviewer:req.body.technicalReviewer,time:new Date().toISOString()});res.json({ref:published.ref});});
  app.post('/api/templates/disable',async(req,res)=>{await registry.disableVersion(req.body.ref,req.body.reason);res.json({disabled:true});});
  const launch=(p:Project,plan:ReturnType<typeof confirmPlan>,parentRunId?:string,sourceRun?:RunRecord)=>{
    if(loadBusy(p.id)||[...active.values()].some(a=>a.projectId===p.id))throw new Error('PROJECT_BUSY');const id=randomUUID(),executor=new RunExecutor(registry,store);
    const entry={executor,projectId:p.id,record:undefined as RunRecord|undefined,promise:Promise.resolve() as Promise<unknown>};active.set(id,entry);
    entry.promise=executor.run(plan,{...env(p),sourceRun},parentRunId,r=>{entry.record=r;},id).catch(async error=>{const failed:RunRecord={schemaVersion:1,id,projectId:p.id,flow:plan.flow,kind:'verification',status:'blocked',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),plan,checks:[],events:[],evidence:{},uncovered:[error.message]};await store.finish(failed);}).finally(()=>active.delete(id));void entry.promise.catch(()=>{});return id;
  };
  app.post('/api/projects/:id/run',async(req,res)=>{const p=project(req.params.id);const checks=req.body.checks?.map((c:{ruleId:string;confirmed:boolean;templateRef:TemplateRef})=>({rule:{...rule(c.ruleId),confirmation:c.confirmed?'confirmed' as const:'pending' as const},templateRef:c.templateRef,mode:c.confirmed?'verify' as const:'observe' as const}));const plan=confirmPlan({projectId:p.id,flow:req.body.flow,flows:req.body.flows,checks,mapping:p.mapping,sourceHash:p.profile.sourceHash});if(!env(p).confirmed)throw new Error('PROJECT_CONFIRMATION_REQUIRED');if(req.body.parentRunId)throw new Error('USE_REPLAY_FOR_HISTORY_LINK');await freshEnvironment(p);res.status(202).json({runId:launch(p,plan)});});
  app.post('/api/projects/:id/replay',async(req,res)=>{const p=project(req.params.id),pkg=req.body.package??await exportPackage(store,String(req.body.runId));await freshEnvironment(p);const {run:previous}=readPackage(pkg);const changed=previous.plan.sourceHash!==p.profile.sourceHash||digest(previous.plan.mapping)!==digest(p.mapping);if(changed&&req.body.reconfirmedChanges!==true)throw new Error('CONDITIONS_CHANGED_CONFIRMATION_REQUIRED');const replay=await loadReplay(pkg,env(p,changed&&req.body.reconfirmedChanges===true),registry);if(changed)replay.plan=confirmPlan({...replay.plan,mapping:p.mapping});res.status(202).json({runId:launch(p,replay.plan,replay.parentRunId,previous)});});
  app.post('/api/package/inspect',async(req,res)=>{const {run,manifest}=readPackage(req.body);res.json({projectId:run.projectId,runId:run.id,flow:run.flow,kind:manifest.kind,checks:run.plan.checks,sourceHash:run.plan.sourceHash,mapping:run.plan.mapping});});
  app.get('/api/runs/:id',async(req,res)=>res.json(active.get(req.params.id)?.record??await store.get(req.params.id)));
  app.post('/api/runs/:id/stop',async(req,res)=>{const a=active.get(req.params.id);if(!a)throw new Error('RUN_NOT_ACTIVE');await a.executor.stop();res.json({stopping:true});});
  app.get('/api/runs/:id/package',async(req,res)=>res.json(await exportPackage(store,req.params.id)));
  app.get('/api/runs/:id/report',async(req,res)=>{res.type('text/markdown').send(renderReport(await store.get(req.params.id)));});
  app.post('/api/projects/:id/load',async(req,res)=>{
    const p=project(req.params.id);if(loadBusy(p.id)||[...active.values()].some(a=>a.projectId===p.id))throw new Error('PROJECT_BUSY');await freshEnvironment(p);
    const sourceRun=await store.get(String(req.body.sourceRunId));if(sourceRun.projectId!==p.id)throw new Error('PROJECT_MISMATCH');
    // Only target settings are accepted from the browser; source evidence and
    // registry/environment always come from trusted local state.
    const settings={...(req.body.target??{}),...LOAD_PRESET};
    // Recheck synchronously after reads: two concurrent requests must not both
    // pass the earlier busy guard and register independent generators.
    if(loadBusy(p.id)||[...active.values()].some(a=>a.projectId===p.id))throw new Error('PROJECT_BUSY');
    const h=startTargetLoad({...settings,sourceRun,environment:env(p),registry,directory:loads.directory},p.mapping);activeLoads.set(h.id,h);
    void h.result.finally(()=>activeLoads.delete(h.id)).catch(()=>{});res.status(202).json({loadId:h.id});
  });
  app.get('/api/loads/:id',async(req,res)=>{validId(req.params.id);res.json(activeLoads.get(req.params.id)?.snapshot()??await loads.getLoad(req.params.id));});
  app.get('/api/loads/:id/report',async(req,res)=>res.type('text/markdown').send(renderLoadReport(await loads.getLoad(req.params.id))));
  app.post('/api/loads/:id/stop',async(req,res)=>{const h=activeLoads.get(req.params.id);if(!h)throw new Error('LOAD_NOT_ACTIVE');res.json(await h.stop('manual_cancel'));});
  const closeSecrets=async()=>{await Promise.all([...activeLoads.values()].map(h=>h.stop('session_closed')));await Promise.all([...active.values()].map(a=>a.executor.stop()));await Promise.all([...active.values()].map(a=>a.promise));credentials.close();modelKeys.close();};
  app.post('/api/session/close',async(_req,res)=>{if(candidateJobs.size)throw new Error('MODEL_WORK_ACTIVE');await closeSecrets();res.json({closed:true});});
  app.use('/api',(_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
  app.use(express.static(options.uiDirectory??join(projectRoot,'apps/ui/dist')));
  app.use((error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(400).json({error:scrubSecrets(error.message)});});
  const server:Server=await new Promise(resolve=>{const s=app.listen(options.port??4317,'127.0.0.1',()=>resolve(s));});origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  return {url:origin,token,registry,store,close:async()=>{try{await closeSecrets();await saveQueue;}finally{await new Promise<void>((r,j)=>{server.close(e=>e?j(e):r());server.closeAllConnections();});}}};
}
