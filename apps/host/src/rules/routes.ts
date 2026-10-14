import type {Express} from 'express';
import {resolve} from 'node:path';
import type {ProjectRuleVersion,RuleReadiness} from '@website-verification/contracts/discovery';
import type {DiscoveryService} from '../discovery/service.js';
import type {DiscoveryStore} from '../discovery/store.js';
import {validateSourceRefs} from '../discovery/access.js';
import {ProjectRuleStore} from './store.js';
import {assessRule,type ProjectCapabilities} from './readiness.js';
/** Mount only after local-session authentication. Catalogs are host-owned, never request data. */
export function mountProjectRuleRoutes(app:Express,options:{store:ProjectRuleStore;discoveryStore:DiscoveryStore;discovery:()=>DiscoveryService;ensureProject:(id:string)=>Promise<{directory:string}>;capabilities:(id:string)=>ProjectCapabilities}){
  const {store}=options;
  async function sources(rule:ProjectRuleVersion){
    const r=await options.discoveryStore.get(rule.suggestionRef.discoveryId);
    if(r.session.projectId!==rule.projectId)return false;
    const current=await options.ensureProject(rule.projectId);if(resolve(current.directory).toLowerCase()!==resolve(r.snapshot.root).toLowerCase())return false;
    const refs=[...rule.sourceRefs,...rule.facts.flatMap(s=>s.sourceRefs),...rule.expectations.flatMap(s=>s.sourceRefs)];
    return (await validateSourceRefs(r.snapshot,r.session.reads,refs)).valid;
  }
  async function fresh(rule:ProjectRuleVersion){if(!await sources(rule))throw new Error('STALE_SOURCE')}
  async function publicRules(projectId:string){await options.ensureProject(projectId);const collection=await store.list(projectId);const readiness:RuleReadiness[]=await Promise.all(collection.versions.map(async rule=>{
    // Dynamic independent resources and qualified project templates are not present in S3.
    // Seed rules never qualify an unrelated semantic version by action name.
    const capabilities=options.capabilities(projectId),grammar:Record<string,string[]>={create:['title','status'],query:['id'],update:['id','title','status']};
    // Readiness asks whether this rule's needed bindings exist, not whether every optional
    // grammar input is mapped. Keep unsupported grammar distinct from missing bindings.
    const required=rule.requirements?.operations??[];
    const r=assessRule(rule,{...capabilities,operations:capabilities.operations.map(op=>{const needs=required.filter(r=>r.operationId===op.operationId).flatMap(r=>r.parameters),supported=grammar[op.operationId]??op.parameters;return {...op,parameters:supported,mapped:op.mapped&&needs.every(p=>op.parameters.includes(p))}})},[],[]);
    if(!await sources(rule)){r.status=r.status==='needs_capability'?'needs_capability':'needs_conditions';r.missing.push({code:'STALE_SOURCE',detail:'源码引用已变化；历史版本仍可查看，不能继续确认或使用。'})}
    return r;
  }));return {...collection,readiness}}
  app.get('/api/projects/:id/rules',async(req,res)=>res.json(await publicRules(req.params.id)));
  app.post('/api/projects/:id/rules/confirm',async(req,res)=>{
    const current=await options.ensureProject(req.params.id);const record=await options.discoveryStore.get(req.body.discoveryId),session=await options.discovery().getDiscovery(req.body.discoveryId);
    if(session.projectId!==req.params.id)throw new Error('RULE_PROJECT_MISMATCH');
    if(resolve(current.directory).toLowerCase()!==resolve(record.snapshot.root).toLowerCase())throw new Error('STALE_SOURCE');
    if(session.status==='stale'||!session.referencesValid)throw new Error('STALE_SOURCE');
    if(session.status==='running'||session.status==='draft')throw new Error('ANALYSIS_CONFLICT');
    const suggestion=session.result?.suggestions.find(s=>s.id===req.body.suggestionId);if(!suggestion)throw new Error('SUGGESTION_NOT_FOUND');
    const refs=[...suggestion.sourceRefs,...suggestion.facts.flatMap(s=>s.sourceRefs),...suggestion.expectations.flatMap(s=>s.sourceRefs),...suggestion.risks.flatMap(s=>s.sourceRefs)];
    if(!(await validateSourceRefs(record.snapshot,record.session.reads,refs)).valid)throw new Error('STALE_SOURCE');
    const rule=await store.confirmProjectRule(req.params.id,{suggestionRef:{discoveryId:session.id,suggestionId:suggestion.id},suggestion,answers:req.body.answers,expectedBehavior:req.body.expectedBehavior,requirements:req.body.requirements,confirmed:req.body.confirmed===true},req.body.expectedRevision);res.status(201).json(rule);
  });
  app.get('/api/projects/:id/rules/:ruleId/versions/:version',async(req,res)=>{await options.ensureProject(req.params.id);res.json(await store.getProjectRule(req.params.id,req.params.ruleId,Number(req.params.version)))});
  app.post('/api/projects/:id/rules/:ruleId/revise',async(req,res)=>{await options.ensureProject(req.params.id);const collection=await store.list(req.params.id),current=collection.versions.find(v=>v.id===req.params.ruleId);if(!current)throw new Error('RULE_NOT_FOUND');await fresh(current);res.json(await store.reviseProjectRule({projectId:current.projectId,id:current.id,version:current.version,contentHash:current.contentHash},{expectedBehavior:req.body.expectedBehavior,answers:req.body.answers,note:req.body.note,...(req.body.requirements!==undefined?{requirements:req.body.requirements}:{})},req.body.expectedRevision))});
  app.post('/api/projects/:id/rules/:ruleId/confirm-version',async(req,res)=>{await options.ensureProject(req.params.id);const rule=await store.getProjectRule(req.params.id,req.params.ruleId,req.body.version);await fresh(rule);res.json(await store.confirmVersion(req.params.id,req.params.ruleId,req.body.version,req.body.expectedRevision,req.body.confirmed===true))});
  app.post('/api/projects/:id/rules/selection',async(req,res)=>{await options.ensureProject(req.params.id);if(req.body.ruleRef?.projectId!==req.params.id)throw new Error('RULE_PROJECT_MISMATCH');const rule=await store.assertCurrent(req.body.ruleRef);await fresh(rule);await store.select(req.params.id,req.body.ruleRef,req.body.expectedRevision);res.json(await publicRules(req.params.id))});
  return {publicRules};
}
