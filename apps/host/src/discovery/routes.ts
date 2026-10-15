import {prepareFullFileInput,fullInputLimits} from './full-input.js';
import type {Express} from 'express';
import {basename,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {ModelConfig} from '../model/provider.js';
import {buildSourceSnapshot} from './index.js';
import {createAnalysisScope,scopedSourceFiles,validateSourceRefs} from './access.js';
import {DiscoveryStore,type SourceProject} from './store.js';
import {DiscoveryService} from './service.js';
import {MODEL_PRESET} from '../model/budget.js';

/** Mount after the existing local-session authentication middleware. */
export function mountDiscoveryRoutes(app:Express,options:{store:DiscoveryStore;service:()=>DiscoveryService;config:()=>ModelConfig;runtimeProject:(id:string)=>{directory:string;name:string}|undefined;runtimeProjects:()=>{id:string;directory:string}[]}){
  const {store}=options;
  async function sourceProject(id:string):Promise<SourceProject>{
    try{return await store.getProject(id)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
    const runtime=options.runtimeProject(id);if(!runtime)throw new Error('PROJECT_NOT_FOUND');
    const snapshot=await buildSourceSnapshot(runtime.directory,id),scope=createAnalysisScope(snapshot,{allowedPaths:['.'],excludedPaths:[],includeProjectTests:false,serviceUrl:options.config().serviceUrl});
    const project={id,revision:0,name:runtime.name,directory:snapshot.root,snapshot,scope};await store.saveProject(project);return project;
  }
  const disclose=(p:SourceProject)=>({...p,snapshot:{...p.snapshot,files:scopedSourceFiles(p.snapshot,p.scope!)},preset:{...MODEL_PRESET,maxSourceBytes:196608,maxExcerptBytes:8192,maxExcerptsPerRound:4},summarySending:true,fullInputLimits});
  app.post('/api/source-projects',async(req,res)=>{
    const input=String(req.body.directory??''),existing=(await store.projects()).find(p=>resolve(p.directory).toLowerCase()===resolve(input).toLowerCase()),runtime=options.runtimeProjects().find(p=>resolve(p.directory).toLowerCase()===resolve(input).toLowerCase());
    const id=req.body.id??existing?.id??runtime?.id??randomUUID();let previous:SourceProject|undefined;
    try{previous=await store.getProject(id)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
    if(previous&&req.body.expectedRevision!==previous.revision)throw new Error('ANALYSIS_CONFLICT');
    if(previous?.discoveryId&&(await options.service().getDiscovery(previous.discoveryId)).status==='running')throw new Error('ANALYSIS_CONFLICT');
    const snapshot=await buildSourceSnapshot(input,id,{includeProjectTests:req.body.includeProjectTests===true});
    if(options.service().credentials.containsKey(JSON.stringify(snapshot)))throw new Error('SENSITIVE_FILE');
    if(options.runtimeProject(id)&&resolve(options.runtimeProject(id)!.directory).toLowerCase()!==snapshot.root.toLowerCase())throw new Error('PROJECT_MISMATCH');
    const scope=createAnalysisScope(snapshot,{allowedPaths:req.body.allowedPaths??['.'],excludedPaths:req.body.excludedPaths??[],includeProjectTests:req.body.includeProjectTests===true,serviceUrl:options.config().serviceUrl});
    const project:SourceProject={id,revision:previous?.revision??0,name:basename(snapshot.root),directory:snapshot.root,snapshot,scope,...(previous?.discoveryId?{discoveryId:previous.discoveryId}:{})};
    await store.saveProject(project,previous?.revision);res.status(201).json(disclose(project));
  });
  app.get('/api/projects/:id/discovery-scope',async(req,res)=>res.json(disclose(await sourceProject(req.params.id))));
  app.post('/api/projects/:id/discovery-scope',async(req,res)=>{
    const p=await sourceProject(req.params.id);if(p.discoveryId&&(await options.service().getDiscovery(p.discoveryId)).status==='running')throw new Error('ANALYSIS_CONFLICT');
    if(req.body.includeProjectTests===true&&!p.scope?.includeProjectTests)throw new Error('SOURCE_REINDEX_REQUIRED');
    p.scope=createAnalysisScope(p.snapshot,{allowedPaths:req.body.allowedPaths,excludedPaths:req.body.excludedPaths,includeProjectTests:req.body.includeProjectTests===true,serviceUrl:options.config().serviceUrl});
    await store.saveProject(p,req.body.expectedRevision);res.json(disclose(p));
  });
  app.post('/api/projects/:id/discovery-input',async(req,res)=>{
    const p=await sourceProject(req.params.id);
    if(!p.scope||req.body.expectedRevision!==p.revision)throw new Error('ANALYSIS_CONFLICT');
    const preview=await prepareFullFileInput(p.snapshot,p.scope,options.config(),req.body);
    if(options.service().credentials.containsKey(JSON.stringify(preview)))throw new Error('SENSITIVE_FILE');
    res.json(preview);
  });
  app.post('/api/projects/:id/discovery',async(req,res)=>{
    const result=await store.startProject(req.params.id,req.body.expectedRevision,req.body.requestId,async p=>{
      if(req.body.confirmed!==true)throw new Error('SENDING_NOT_CONFIRMED');if(!p.scope||req.body.scopeHash!==p.scope.scopeHash)throw new Error('SCOPE_CONFIRMATION_REQUIRED');
      p.scope={...p.scope,confirmedAt:new Date().toISOString()};return options.service().createDiscovery(p.snapshot,p.scope,req.body.input);
    });
    if(result.created)void options.service().runDiscovery(result.session.id,result.session.revision).catch(()=>{});
    res.status(202).json(result.session);
  });
  app.get('/api/discovery/:id',async(req,res)=>res.json(await options.service().getDiscovery(req.params.id)));
  app.post('/api/discovery/:id/pause',async(req,res)=>res.json(await options.service().pauseDiscovery(req.params.id)));
  app.post('/api/discovery/:id/resume',async(req,res)=>{
    const session=await options.service().assertResumable(req.params.id,req.body.revision);
    void options.service().runDiscovery(session.id,session.revision).catch(()=>{});res.status(202).json(session);
  });
  app.post('/api/discovery/:id/selection',async(req,res)=>res.json(await options.service().selectSuggestion(req.params.id,req.body.suggestionId,req.body.revision)));
  app.get('/api/discovery/:id/excerpts/:index',async(req,res)=>{
    const r=await store.get(req.params.id),index=Number(req.params.index);if(!Number.isSafeInteger(index)||index<0||!r.session.reads[index])throw new Error('INVALID_SOURCE_REF');
    const excerpt=r.session.reads[index]!,checked=await validateSourceRefs(r.snapshot,r.session.reads,[excerpt.ref]);res.json({...excerpt,valid:checked.valid,issues:checked.issues});
  });
  return {sourceProject,async publicProjects(){return Promise.all((await store.projects()).map(async p=>({id:p.id,directory:p.directory,name:p.name,sourceOnly:!options.runtimeProject(p.id),supported:false,gaps:[],gapMarkdown:'源码分析不需要运行条件；实际检查前仍须接入运行配置。',sourceRevision:p.revision,sourceScope:p.scope,sourceSnapshot:{id:p.snapshot.id,sourceHash:p.snapshot.sourceHash,files:scopedSourceFiles(p.snapshot,p.scope!).map(({path,bytes,language,lineCount})=>({path,bytes,language,lineCount})),indexIssues:p.snapshot.indexIssues},discoveryId:p.discoveryId,discovery:p.discoveryId?await options.service().getDiscovery(p.discoveryId):undefined})))}};
}
