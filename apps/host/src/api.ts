import express from 'express';
import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {replaceFile} from './artifacts/replace.js';
import {join} from 'node:path';
import type {Server} from 'node:http';
import {createServer as createPortServer} from 'node:net';
import {prepareCopy} from './projects/copy.js';
import {bindMapping,mappingHash} from './execution/mapping.js';
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
import {emptyWorkflow,writeWorkflow,reconcileWorkflow,type WorkflowDraft,type PreparationResult} from './projects/workflow.js';
import {pickProjectDirectory} from './projects/folder-picker.js';
import {DiscoveryStore} from './discovery/store.js';
import {DiscoveryService} from './discovery/service.js';
import {mountDiscoveryRoutes} from './discovery/routes.js';
import {ProjectRuleStore} from './rules/store.js';
import {mountProjectRuleRoutes} from './rules/routes.js';
import type {ProjectCapabilities} from './rules/readiness.js';
import {validateSourceRefs} from './discovery/access.js';

interface Project {workflow?:WorkflowDraft;preparation?:PreparationResult;accountMode?:'automatic'|'manual';id:string;purpose:string;profile:ProjectProfile;mapping:HttpMapping;accounts:RunEnvironment['accounts'];data:RunEnvironment['data'];entries:ContextRequest['entries'];environmentHash:string;environmentConfirmed?:string;consent?:DisclosureConsent;analysis?:{status:string;code?:string;proposal?:unknown;budget?:BudgetUsage;environmentHash?:string};analysisHistory?:unknown[];candidateId?:string;candidateIds?:Record<string,string>;draft?:RegistryDraft;reviewDrafts?:Record<string,RegistryDraft>}
const ruleIds=['save-rule','duplicate-rule','permission-rule','title-update-rule'];
export async function startWorkbench(options:{directory?:string;registryDirectory?:string;port?:number;uiDirectory?:string;pickDirectory?:(signal?:AbortSignal)=>Promise<string|null>}={}){
  const directory=options.directory??join(projectRoot,'.local-data/workbench');await mkdir(directory,{recursive:true});
  const registry=new TemplateRegistry(options.registryDirectory),store=new ArtifactStore(join(directory,'runs'));
  let credentials=new CredentialSession(),modelKeys=new ModelCredentials();
  const loads=new LoadStore(join(directory,'loads')),activeLoads=new Map<string,LoadHandle>();
  const loadBusy=(projectId:string)=>[...activeLoads.values()].some(h=>h.snapshot().projectId===projectId);
  const preparations=new Map<string,Promise<unknown>>(),preparedInSession=new Set<string>();let pickingFolder=false;let folderController:AbortController|undefined;
  const projects=new Map<string,Project>(),active=new Map<string,{executor:RunExecutor;record?:RunRecord;projectId:string;promise:Promise<unknown>}>(),candidateJobs=new Map<string,Promise<unknown>>();
  let config:ModelConfig={serviceUrl:'https://api.deepseek.com',model:''},connection={status:'not_checked',code:''};
  const discoveryStore=new DiscoveryStore(join(directory,'discovery'));
  const projectRuleStore=new ProjectRuleStore(join(directory,'project-rules'),{validateSources:async rule=>{
    // Called while holding the same project mutex used by source-project save and runtime import.
    const record=await discoveryStore.get(rule.suggestionRef.discoveryId),currentDirectory=projects.get(rule.projectId)?.profile.root??(await discoveryStore.getProject(rule.projectId)).directory;
    if(record.session.projectId!==rule.projectId||currentDirectory.toLowerCase()!==record.snapshot.root.toLowerCase())throw new Error('STALE_SOURCE');
    if(!(await validateSourceRefs(record.snapshot,record.session.reads,rule.sourceRefs)).valid)throw new Error('STALE_SOURCE');
  }});
  let discovery=new DiscoveryService({store:discoveryStore,config:()=>config,credentials:modelKeys});
  const configFile=join(directory,'state.json');
  try{const saved=JSON.parse(await readFile(configFile,'utf8'));config=saved.config;for(const p of saved.projects??[]){if(preparations.has(p.id))throw new Error('PROJECT_BUSY');if(p.analysis?.status==='running'){p.analysis.status='paused';p.analysis.code='INTERRUPTED_MODEL_CALL';}if(p.preparation?.status==='preparing'){p.preparation.status='interrupted';p.preparation.code='PREPARATION_INTERRUPTED';}projects.set(p.id,p);}}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  let saveQueue:Promise<void>=Promise.resolve();
  const save=()=>{saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    const tmp=join(directory,randomUUID()+'.tmp');
    await writeFile(tmp,JSON.stringify({config:{...config,credentialRef:config.credentialRef?.startsWith('windows:')?config.credentialRef:undefined},projects:[...projects.values()]},null,2));
    await replaceFile(tmp,configFile);
  });return saveQueue;};
  const project=(id:string)=>{const p=projects.get(id);if(!p)throw new Error('PROJECT_NOT_FOUND');return p;};
  const modelIdle=(id?:string)=>{if(discovery.active()||(id?(candidateJobs.has(id)||candidateJobs.has('analysis:'+id)):candidateJobs.size))throw new Error('MODEL_WORK_ACTIVE');};
  const freshEnvironment=async(p:Project)=>{if((await inspectProject(p.profile.root)).sourceHash!==p.profile.sourceHash)throw new Error('CONDITIONS_CHANGED_RECONNECT_REQUIRED');};
  const context=(p:Project):ContextRequest=>({projectId:p.id,root:p.profile.root,serviceUrl:config.serviceUrl,entries:p.entries});
  const automaticPasswords=(p:Project)=>{if(p.accountMode==='automatic')for(const a of p.accounts)if(!credentials.has(p.id,a.actorRef))credentials.set(p.id,a.actorRef,randomBytes(24).toString('base64url'));};
  const env=(p:Project,reconfirmedChanges=false):RunEnvironment=>{automaticPasswords(p);return ({source:p.profile.root,projectId:p.id,confirmed:p.environmentConfirmed===p.environmentHash,data:p.data,accounts:p.accounts,credentials,reconfirmedChanges});};
  const publicCandidate=async(p:Project)=>{
    if(!p.candidateId)return undefined;
    const s=(await CandidateTask.open(p.candidateId,modelKeys)).snapshot(),latest=s.drafts.at(-1);
    const saved=p.draft?.taskId===s.id?p.draft:p.reviewDrafts?.[s.id];
    const draft=saved?.candidateHash===s.candidateHash&&saved?.ruleHash===s.ruleHash?saved:undefined;
    return {id:s.id,ruleId:s.input.rule.id,candidateHash:s.candidateHash,status:s.status==='ready_for_review'&&candidateJobs.has(p.id)?'validating':s.status==='validating'&&s.phase==='awaiting_trial'&&!candidateJobs.has(p.id)?'paused':s.status,phase:s.status==='ready_for_review'&&candidateJobs.has(p.id)?'finalizing':s.phase,code:s.code,revisionIndex:s.revisionIndex,budget:s.budget,preset:MODEL_PRESET,validation:s.validation?{gateResults:s.validation.gateResults,recordRef:s.validation.recordRef,cases:s.validation.cases,issues:s.validation.issues}:undefined,trial:s.trial?{completed:s.trial.completed,verdicts:s.trial.verdicts}:undefined,spec:latest?.value,reference:latest?.hash===s.candidateHash?latest.reference:undefined,metadata:draft?.metadata,draftHash:draft?.draftHash};
  };
  const rules:RuleContract[]=[];
  // Load only public rule contracts, never the private suite cases/answers.
  try{rules.push(...JSON.parse(await readFile(join(projectRoot,'resources/public-rules.json'),'utf8')));}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;const manifest=JSON.parse(await readFile(join(projectRoot,'tests/reference/suite-manifest.json'),'utf8'));for(const entry of manifest.suites)rules.push(structuredClone(entry.rule));}
  const rule=(id:string)=>{const r=rules.find(r=>r.id===id);if(!r)throw new Error('RULE_CAPABILITY_GAP');return structuredClone(r);};
  const app=express();app.disable('x-powered-by');let origin='',token=randomBytes(32).toString('hex');
  app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");if(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return void res.status(403).json({error:'ORIGIN_REJECTED'});next();});
  app.use(express.json({limit:'18mb'}));
  app.get('/api/session',(_req,res)=>res.json({token}));
  app.use('/api',(req,res,next)=>{const given=req.headers.authorization?.replace(/^Bearer /,'')??'';if(given.length!==token.length||!timingSafeEqual(Buffer.from(given),Buffer.from(token)))return void res.status(401).json({error:'SESSION_REQUIRED'});next();});
  const discoveryRoutes=mountDiscoveryRoutes(app,{store:discoveryStore,service:()=>discovery,config:()=>config,runtimeProject:id=>{const p=projects.get(id);return p?{directory:p.profile.root,name:p.profile.name}:undefined},runtimeProjects:()=>[...projects.values()].map(p=>({id:p.id,directory:p.profile.root}))});
  const projectRuleCapabilities=(id:string):ProjectCapabilities=>{
    const p=projects.get(id),mapping=p?.mapping;
    // Executor grammar, not an arbitrary mapping declaration, defines supported inputs.
    const operationInputs:Record<string,string[]>={create:['title'],query:['id'],update:['id','title']};
    return {operations:Object.entries(operationInputs).map(([operationId,parameters])=>{
        const op=mapping?.operations.find(o=>o.operationId===operationId),bindings=new Set([...Object.values(op?.bodyBindings??{}),...Object.values(op?.queryBindings??{}),...(op?.path.match(/:[A-Za-z0-9_-]+/g)??[]).map(v=>v.slice(1))]);
        return {operationId,parameters,mapped:!!op&&parameters.every(p=>bindings.has(p))};
      }),
      actorRefs:p?.preparation?.status==='ready'&&preparedInSession.has(id)&&p.environmentHash===p.environmentConfirmed?p.accounts.filter(a=>credentials.has(id,a.actorRef)).map(a=>a.actorRef):[],
      observations:Object.entries(mapping?.resultBindings??{}).flatMap(([operationId,fields])=>Object.keys(fields).map(field=>({operationId,field,businessEvidence:false,complete:false}))),
      assertions:[...capabilities.expressions],dataConditions:[]};
  };
  const projectRuleRoutes=mountProjectRuleRoutes(app,{store:projectRuleStore,discoveryStore,discovery:()=>discovery,ensureProject:async id=>{if(projects.has(id))return {directory:project(id).profile.root};try{return await discoveryStore.getProject(id)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new Error('PROJECT_NOT_FOUND');throw e}},capabilities:projectRuleCapabilities});
  app.get('/api/state',async(_req,res)=>{
    const catalog=await registry.matchReport(capabilities,rules),runs=await store.list();
    const hashes=new Map(rules.map(r=>[r.id,digest(r)])),versions=new Set(catalog.matches.map(m=>`${rules.find(r=>digest(r)===m.ruleHash)?.id}:${m.ref.hash}`));let reconciled=false;
    for(const p of projects.values()){const previous=p.workflow??emptyWorkflow();const next=reconcileWorkflow(previous,hashes,p.environmentHash,versions);if(next!==previous){p.workflow=next;reconciled=true;}}if(reconciled)await save();
    for(const [id,r]of active){if(r.record){const index=runs.findIndex(v=>v.id===id);if(index<0)runs.push(r.record);else runs[index]=r.record;}}
    const {readdir}=await import('node:fs/promises');await mkdir(loads.directory,{recursive:true});const loadIds=new Set((await readdir(loads.directory)).filter(n=>/^[a-f0-9-]{36}(\.pending)?\.json$/.test(n)).map(n=>n.slice(0,36)));for(const id of activeLoads.keys())loadIds.add(id);
    const loadRecords=await Promise.all([...loadIds].map(async id=>{const r=activeLoads.get(id)?.snapshot()??await loads.getLoad(id);return {...r,ledger:undefined,evidence:undefined,environment:undefined};}));
    const sourceProjects=await discoveryRoutes.publicProjects();
    const projectRules=Object.fromEntries(await Promise.all([...new Set([...projects.keys(),...sourceProjects.map(p=>p.id)])].map(async id=>[id,await projectRuleRoutes.publicRules(id)])));
    const runtimeProjects=await Promise.all([...projects.values()].map(async p=>({...sourceProjects.find(v=>v.id===p.id),id:p.id,sourceOnly:false,accountMode:p.accountMode??'manual',purpose:p.purpose,directory:p.profile.root,name:p.profile.name,supported:p.profile.supported,gaps:p.profile.gaps,gapMarkdown:p.profile.gapMarkdown,sourceHash:p.profile.sourceHash,workflow:p.workflow??emptyWorkflow(),preparation:p.preparation?{...p.preparation,sessionCurrent:preparedInSession.has(p.id)&&p.preparation.environmentHash===p.environmentHash}:undefined,mapping:p.mapping,accounts:p.accounts.map(a=>({...a,hasPassword:credentials.has(p.id,a.actorRef)})),data:p.data,entries:p.entries,environmentHash:p.environmentHash,environmentConfirmed:p.environmentHash===p.environmentConfirmed,consent:p.consent,analysis:p.analysis,candidate:await publicCandidate(p)})));
    res.json({projectRules,loadPreset:LOAD_PRESET,loads:loadRecords,projects:[...runtimeProjects,...sourceProjects.filter(p=>!projects.has(p.id))],rules:rules.map(r=>({...r,hash:digest(r)})),catalog,runs:runs.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)),settings:{serviceUrl:config.serviceUrl,model:config.model,remembered:config.credentialRef?.startsWith('windows:')??false,hasKey:!!config.credentialRef,connection},preset:MODEL_PRESET});
  });
  app.post('/api/projects/pick-directory',async(_req,res)=>{if(pickingFolder)throw new Error('FOLDER_PICKER_BUSY');pickingFolder=true;const controller=new AbortController();folderController=controller;res.once('close',()=>{if(!res.writableEnded)controller.abort();});try{res.json({directory:await (options.pickDirectory??pickProjectDirectory)(controller.signal)});}finally{pickingFolder=false;if(folderController===controller)folderController=undefined;}});
  app.post('/api/projects/:id/workflow',async(req,res)=>{project(req.params.id);const catalog=await registry.matchReport(capabilities,rules),p=project(req.params.id),hashes=new Map(rules.map(r=>[r.id,digest(r)])),versions=new Set(catalog.matches.map(m=>`${rules.find(r=>digest(r)===m.ruleHash)?.id}:${m.ref.hash}`));p.workflow=writeWorkflow(p.workflow??emptyWorkflow(),req.body,hashes,p.environmentHash,versions);await save();res.json(p.workflow);});
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
    const old=req.body.id?projects.get(String(req.body.id)):undefined;const sourceOnly=req.body.id&&!old?await discoveryStore.getProject(String(req.body.id)):undefined;if(old||sourceOnly)modelIdle(old?.id??sourceOnly!.id);if(old&&(preparations.has(old.id)||loadBusy(old.id)||[...active.values()].some(a=>a.projectId===old.id)))throw new Error('PROJECT_BUSY');
    const profile=await inspectProject(String(req.body.directory??'')),id=old?.id??sourceOnly?.id??randomUUID();
    if(sourceOnly&&sourceOnly.directory.toLowerCase()!==profile.root.toLowerCase())throw new Error('PROJECT_MISMATCH');
    const accountMode=req.body.accountMode??(req.body.accounts?'manual':old?.accountMode??'manual');
    if(!['automatic','manual'].includes(accountMode))throw new Error('TEST_ACCOUNT_CONFIG_GAP');
    const generated=()=>['owner','other'].map(actorRef=>({actorRef,username:'test_'+randomBytes(6).toString('hex'),userId:randomUUID(),role:'user'}));
    const accounts=(accountMode==='automatic'?(old?.accountMode==='automatic'?old.accounts:generated()):(req.body.accounts??old?.accounts??[])) as (RunEnvironment['accounts'][number]&{password?:string})[];
    if(accounts.length!==2||new Set(accounts.map(a=>a.userId)).size!==2||new Set(accounts.map(a=>a.actorRef)).size!==2||accounts.some(a=>!a.actorRef||!a.username||!a.userId||a.role!=='user'))throw new Error('TEST_ACCOUNT_CONFIG_GAP');
    const mapping=structuredClone(req.body.mapping??profile.mapping);validateMapping(mapping);
    const data={source:'synthetic' as const,count:Number(req.body.count??old?.data.count??2),seedVersion:profile.initialization?.version??''};
    if(!Number.isSafeInteger(data.count)||data.count<0||data.count>1000)throw new Error('INVALID_DATA_COUNT');
    const publicAccounts=accounts.map(({actorRef,username,userId,role})=>({actorRef,username,userId,role}));
    const environmentHash=digest({sourceHash:profile.sourceHash,mapping,accounts:publicAccounts,data});
    const p:Project={id,accountMode,purpose:String(req.body.purpose??old?.purpose??''),profile,mapping,accounts:publicAccounts,data,entries:req.body.entries??old?.entries??[{path:'verification.json',contentType:'summary'}],environmentHash,...(old?.environmentHash===environmentHash?{environmentConfirmed:old.environmentConfirmed}:{}),...(old?{workflow:old.workflow,preparation:old.preparation,consent:old.consent,candidateId:old.candidateId,candidateIds:old.candidateIds,draft:old.draft,reviewDrafts:old.reviewDrafts,analysis:old.analysis,analysisHistory:old.analysisHistory}: {})};
    if(old&&digest(old.entries)!==digest(p.entries)||old&&old.profile.root!==profile.root)delete p.consent;
    const persist=async()=>{
      if(accountMode==='automatic'&&old?.accountMode!=='automatic')for(const a of accounts)credentials.set(id,a.actorRef,randomBytes(24).toString('base64url'));
      for(const a of accounts)if(a.password)credentials.set(id,a.actorRef,a.password);automaticPasswords(p);projects.set(id,p);await save();
    };
    // Existing project identity changes share the source/rule transaction boundary.
    if(old||sourceOnly)await discoveryStore.exclusive(id,persist);else await persist();res.json({projectId:id});
  });
  app.post('/api/projects/:id/prepare',async(req,res)=>{
    const p=project(req.params.id);modelIdle(p.id);
    if(preparations.has(p.id)||loadBusy(p.id)||[...active.values()].some(a=>a.projectId===p.id))throw new Error('PROJECT_BUSY');
    if(p.environmentConfirmed!==p.environmentHash)throw new Error('PROJECT_CONFIRMATION_REQUIRED');
    p.preparation={status:'preparing',environmentHash:p.environmentHash,startedAt:new Date().toISOString()};preparedInSession.delete(p.id);
    const job=(async()=>{
      await save();await freshEnvironment(p);if(!p.profile.supported)throw new Error('PROJECT_UNSUPPORTED');automaticPasswords(p);
      const socket=createPortServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));const port=(socket.address() as {port:number}).port;await new Promise<void>((r,j)=>socket.close(e=>e?j(e):r()));
      const copy=await prepareCopy(p.profile,{projectId:p.id,port,confirmed:true,data:p.data,accounts:p.accounts,credentials});
      try{const mapping=bindMapping(p.mapping,copy.id);await copy.prepareExperiment({checkId:'environment-check',ruleHash:digest('environment-check'),mapping,mappingHash:mappingHash(mapping),confirmed:true,budget:{maxOperations:8,deadlineMs:30000}});await copy.completeAttempt();return {status:'ready',verifiedAccounts:p.accounts.length,copyId:copy.id};}
      finally{await copy.close();}
    })();preparations.set(p.id,job);
    try{const result=await job as {status:'ready';verifiedAccounts:number;copyId:string};p.preparation={...p.preparation!,status:'ready',completedAt:new Date().toISOString(),verifiedAccounts:result.verifiedAccounts};preparedInSession.add(p.id);await save();res.json(result);}
    catch(error){p.preparation={...p.preparation!,status:'failed',completedAt:new Date().toISOString(),code:scrubSecrets((error as Error).message)};await save();throw error;}finally{preparations.delete(p.id);}
  });
  app.post('/api/projects/:id/scope',async(req,res)=>{const p=project(req.params.id);modelIdle(p.id);p.entries=structuredClone(req.body.entries);delete p.consent;await save();res.json(await disclose(context(p)));});
  app.get('/api/projects/:id/disclosure',async(req,res)=>res.json(await disclose(context(project(req.params.id)))));
  app.post('/api/projects/:id/confirm',async(req,res)=>{const p=project(req.params.id);if(req.body.environment===true){await freshEnvironment(p);if(req.body.environmentHash!==p.environmentHash)throw new Error('STALE_ENVIRONMENT_CONFIRMATION');p.environmentConfirmed=p.environmentHash;}if(req.body.send===true){const d=await disclose(context(p));if(req.body.scopeHash!==d.scopeHash)throw new Error('STALE_SCOPE_CONFIRMATION');p.consent=confirmDisclosure(d,true);}await save();res.json({confirmed:true});});
  app.post('/api/projects/:id/passwords',async(req,res)=>{const p=project(req.params.id);for(const a of p.accounts){const value=req.body[a.actorRef];if(typeof value==='string'&&value)credentials.set(p.id,a.actorRef,value);}res.json({savedInSession:true});});
  app.post('/api/projects/:id/analyze',async(req,res)=>{
    const p=project(req.params.id);await freshEnvironment(p);if(!env(p).confirmed)throw new Error('PROJECT_CONFIRMATION_REQUIRED');if(preparations.has(p.id))throw new Error('PROJECT_BUSY');if(p.analysis?.status==='running')throw new Error('ANALYSIS_BUSY');
    const newConditions=p.analysis?.environmentHash&&p.analysis.environmentHash!==p.environmentHash;if(newConditions){(p.analysisHistory??=[]).push(p.analysis);p.analysis=undefined;}const environmentHash=p.environmentHash;const budget=new ModelBudget(MODEL_PRESET,p.analysis?.budget);p.analysis={status:'running',environmentHash,budget:budget.usage};await save();
    const provider=new ModelProvider(config,modelKeys,budget,async()=>{p.analysis!.budget=budget.usage;await save();});
    const job=propose(provider,{context:context(p),consent:p.consent},[]).then(async proposal=>{p.analysis={status:'completed',environmentHash,proposal,budget:budget.usage};await save();}).catch(async e=>{p.analysis={status:'paused',environmentHash,code:e.message,budget:budget.usage};await save();});
    candidateJobs.set('analysis:'+p.id,job);void job.finally(()=>{if(candidateJobs.get('analysis:'+p.id)===job)candidateJobs.delete('analysis:'+p.id);}).catch(()=>{});res.status(202).json({status:'running'});
  });
  app.post('/api/projects/:id/candidate',async(req,res)=>{
    const p=project(req.params.id);if(preparations.has(p.id))throw new Error('PROJECT_BUSY');if(candidateJobs.has(p.id))throw new Error('CANDIDATE_BUSY');if(!env(p).confirmed)throw new Error('PROJECT_CONFIRMATION_REQUIRED');if(req.body.confirmRule!==true)throw new Error('RULE_CONFIRMATION_REQUIRED');
    await freshEnvironment(p);const selected=rule(String(req.body.ruleId));let task:CandidateTask;p.candidateIds??={};if(p.candidateId){const existing=await CandidateTask.open(p.candidateId,modelKeys);p.candidateIds[existing.snapshot().input.rule.id]=p.candidateId;}if(p.draft)(p.reviewDrafts??={})[p.draft.taskId]=p.draft;const previousId=p.candidateId;p.candidateId=p.candidateIds[selected.id];if(previousId!==p.candidateId)p.draft=p.candidateId?p.reviewDrafts?.[p.candidateId]:undefined;
    if(p.candidateId){task=await CandidateTask.open(p.candidateId,modelKeys);if(digest(task.snapshot().input.rule)!==digest(selected))throw new Error('RULE_VERSION_MISMATCH');await task.reconfigure({context:context(p),consent:p.consent,config});}
    else{task=await CandidateTask.create({rule:selected,capabilities,context:context(p),consent:p.consent,config},modelKeys);p.candidateId=task.id;p.candidateIds[selected.id]=task.id;delete p.draft;await save();}
    await save();const job=task.run({...env(p),mapping:p.mapping,sourceHash:p.profile.sourceHash}).finally(()=>{candidateJobs.delete(p.id);});candidateJobs.set(p.id,job);void job.catch(()=>{});res.status(202).json({candidateId:task.id});
  });
  app.post('/api/projects/:id/review',async(req,res)=>{
    const initial=project(req.params.id);modelIdle(initial.id);if(!initial.candidateId)throw new Error('NO_CANDIDATE');
    const candidateId=String(req.body.candidateId??initial.candidateId);
    const owned=(p:Project)=>candidateId===p.candidateId||Object.values(p.candidateIds??{}).includes(candidateId);
    if(!owned(initial))throw new Error('STALE_CANDIDATE');
    const draft=await registry.stageCandidate(candidateId,req.body.metadata),p=project(req.params.id);
    if(!owned(p)||req.body.candidateHash!==undefined&&req.body.candidateHash!==draft.candidateHash)throw new Error('STALE_CANDIDATE');
    if(p.candidateId===candidateId)p.draft=draft;(p.reviewDrafts??={})[candidateId]=draft;
    await save();res.json({draftHash:draft.draftHash,validationRef:draft.validation.recordRef});
  });
  app.post('/api/projects/:id/publish',async(req,res)=>{const p=project(req.params.id);modelIdle(p.id);const draft=p.draft;if(!draft||draft.taskId!==p.candidateId||req.body.scope!==draft.draftHash||req.body.businessConfirmed!==true||req.body.technicalReviewed!==true)throw new Error('REVIEW_REQUIRED');const published=await registry.publishCandidate(draft.candidateHash,draft.validation,{scope:draft.draftHash,validationRef:draft.validation.recordRef!,decision:'approve',businessConfirmation:req.body.businessConfirmation,technicalReviewer:req.body.technicalReviewer,time:new Date().toISOString()});res.json({ref:published.ref});});
  app.post('/api/templates/disable',async(req,res)=>{await registry.disableVersion(req.body.ref,req.body.reason);res.json({disabled:true});});
  const launch=(p:Project,plan:ReturnType<typeof confirmPlan>,parentRunId?:string,sourceRun?:RunRecord)=>{
    if(preparations.has(p.id)||loadBusy(p.id)||[...active.values()].some(a=>a.projectId===p.id))throw new Error('PROJECT_BUSY');const id=randomUUID(),executor=new RunExecutor(registry,store);
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
    const p=project(req.params.id);if(preparations.has(p.id)||loadBusy(p.id)||[...active.values()].some(a=>a.projectId===p.id))throw new Error('PROJECT_BUSY');await freshEnvironment(p);
    const sourceRun=await store.get(String(req.body.sourceRunId));if(sourceRun.projectId!==p.id)throw new Error('PROJECT_MISMATCH');
    // Only target settings are accepted from the browser; source evidence and
    // registry/environment always come from trusted local state.
    const settings={...(req.body.target??{}),...LOAD_PRESET};
    // Recheck synchronously after reads: two concurrent requests must not both
    // pass the earlier busy guard and register independent generators.
    if(preparations.has(p.id)||loadBusy(p.id)||[...active.values()].some(a=>a.projectId===p.id))throw new Error('PROJECT_BUSY');
    const h=startTargetLoad({...settings,sourceRun,environment:env(p),registry,directory:loads.directory},p.mapping);activeLoads.set(h.id,h);
    void h.result.finally(()=>activeLoads.delete(h.id)).catch(()=>{});res.status(202).json({loadId:h.id});
  });
  app.get('/api/loads/:id',async(req,res)=>{validId(req.params.id);res.json(activeLoads.get(req.params.id)?.snapshot()??await loads.getLoad(req.params.id));});
  app.get('/api/loads/:id/report',async(req,res)=>res.type('text/markdown').send(renderLoadReport(await loads.getLoad(req.params.id))));
  app.post('/api/loads/:id/stop',async(req,res)=>{const h=activeLoads.get(req.params.id);if(!h)throw new Error('LOAD_NOT_ACTIVE');res.json(await h.stop('manual_cancel'));});
  const closeSecrets=async()=>{folderController?.abort();await discovery.close();await Promise.allSettled([...preparations.values()]);await Promise.all([...activeLoads.values()].map(h=>h.stop('session_closed')));await Promise.all([...active.values()].map(a=>a.executor.stop()));await Promise.all([...active.values()].map(a=>a.promise));credentials.close();modelKeys.close();};
  app.post('/api/session/close',async(_req,res)=>{
    if(candidateJobs.size||preparations.size)throw new Error('MODEL_WORK_ACTIVE');
    await closeSecrets();
    credentials=new CredentialSession();modelKeys=new ModelCredentials();
    discovery=new DiscoveryService({store:discoveryStore,config:()=>config,credentials:modelKeys});
    preparedInSession.clear();
    if(config.credentialRef?.startsWith('session:'))delete config.credentialRef;
    connection={status:'not_checked',code:''};token=randomBytes(32).toString('hex');
    await save();res.json({closed:true});
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
  app.use(express.static(options.uiDirectory??join(projectRoot,'apps/ui/dist')));
  app.use((error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(400).json({error:scrubSecrets(error.message)});});
  const server:Server=await new Promise(resolve=>{const s=app.listen(options.port??4317,'127.0.0.1',()=>resolve(s));});origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  return {url:origin,token,registry,store,close:async()=>{try{await closeSecrets();await saveQueue;}finally{await new Promise<void>((r,j)=>{server.close(e=>e?j(e):r());server.closeAllConnections();});}}};
}
