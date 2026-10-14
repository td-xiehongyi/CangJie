import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import type {TemplateSpec,RuleContract,ValidationRecord,Transition,Json} from '@website-verification/contracts';
import {validateContract} from '@website-verification/contracts/validate';
import {CoreClient} from '../core/client.js';
import {inspectProject,digest} from '../projects/inspect.js';
import {prepareCopy} from '../projects/copy.js';
import {CredentialSession} from '../execution/session.js';
import {execute} from '../execution/http.js';
import {bindMapping,mappingHash} from '../execution/mapping.js';
import {capabilities,command,runPayload,matches,validateObservations,type SampleFrame,type CaseResult} from './observations.js';
import {executableParameters} from './parameters.js';

const root=fileURLToPath(new URL('../../../../',import.meta.url));
const reference=join(root,'tests/reference'),evidenceRoot=join(root,'.local-data/validation');
interface SuiteCase {id:string;kind:'normal'|'defect'|'unknown';heldOut:boolean;parameters:Record<string,Json>;behavior:string;context?:{ownerId:string;otherId:string;initialPriority:string};expected:Record<string,string>}
export interface ValidationSuite {version:string;review:unknown;rule:RuleContract;cases:SuiteCase[];suiteHash:string}
export interface SuiteValidationRecord extends ValidationRecord {cases:CaseResult[];issues:string[];mappingDefinitionHash:string;recordRef?:string}
async function json(path:string){return JSON.parse(await readFile(path,'utf8'));}
async function frozenFiles():Promise<Record<string,string>>{
  const lock=await json(join(reference,'suite-lock.json')) as Record<string,string>;
  for(const [file,hash]of Object.entries(lock))if(digest(await readFile(join(root,file),'utf8'))!==hash)throw new Error('REFERENCE_CHANGED_REVIEW_REQUIRED');
  return lock;
}
/** Host-private input. Never include this suite, observations, controls or
 * expected labels in model context; a candidate gets only rule/capabilities. */
export async function loadValidationSuite(ruleId:string):Promise<ValidationSuite>{
  let lock:Record<string,string>,manifest:any;
  try{lock=await frozenFiles();manifest=await json(join(reference,'suite-manifest.json'));}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new Error('VALIDATION_RESOURCES_REQUIRED');throw error;}
  const entry=manifest.suites.find((s:{rule:RuleContract})=>s.rule.id===ruleId);if(!entry)throw new Error('UNSUPPORTED_RULE');
  return {...entry,version:manifest.version,review:manifest.review,suiteHash:digest({lock,entry,version:manifest.version})};
}
async function trusted(suite:ValidationSuite):Promise<ValidationSuite>{const original=await loadValidationSuite(suite.rule.id);if(digest(suite)!==digest(original))throw new Error('SUITE_CHANGED');return original;}
async function core():Promise<CoreClient>{const {coreCommand}=await import(pathToFileURL(join(root,'scripts/toolchain.mjs')).href);return new CoreClient({...coreCommand(),timeoutMs:5000});}
async function port():Promise<number>{const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const p=(s.address() as {port:number}).port;await new Promise<void>((r,j)=>s.close(e=>e?j(e):r()));return p;}
function referenceRef(copyId:string,ref:string):string{return `reference:${copyId}:${ref.replace(/^evidence:/,'')}`;}
function configure(spec:TemplateSpec,parameters:Record<string,Json>):TemplateSpec{
  const configured=structuredClone(spec);
  // A suite can vary declared inputs, but cannot repair a missing declaration.
  for(const key of Object.keys(configured.parameters))if(Object.hasOwn(parameters,key))configured.parameters[key]=parameters[key]!;
  return configured;
}
export async function readReferenceEvidence(ref:string):Promise<unknown>{
  const match=/^reference:([a-f0-9-]{36}):([A-Za-z0-9_-]+\.json)$/.exec(ref);if(!match)throw new Error('INVALID_REFERENCE_EVIDENCE');
  return json(join(root,'.local-data/projects',match[1]!,'evidence',match[2]!));
}
/** Whole chain uses T2 preparation, identity, execution, evidence and cleanup. */
export async function runReferenceCase(candidate:TemplateSpec,input:ValidationSuite,control:{behavior:string;parameters:Record<string,Json>;id?:string;context?:SuiteCase['context']}):Promise<CaseResult>{
  const suite=await trusted(input),spec=configure(candidate,control.parameters),id=control.id??randomUUID();
  const source=join(root,'.local-data/reference-sources',randomUUID());await mkdir(source,{recursive:true});
  for(const file of ['server.ts','behaviors.ts','db.ts','seed.ts'])await copyFile(join(reference,file),join(source,file));
  await writeFile(join(source,'control.json'),JSON.stringify({behavior:control.behavior,...control.context}));
  await writeFile(join(source,'package.json'),JSON.stringify({type:'module',dependencies:{express:'5.1.0'}}));
  const mapping=await json(join(reference,'mapping.json'));
  await writeFile(join(source,'verification.json'),JSON.stringify({schemaVersion:1,name:'T3 reviewed reference facility',start:{argv:['server.ts']},initialization:{argv:['seed.ts'],version:'ticket-seed-v1',source:'synthetic',databaseEnv:'TEST_DATABASE',localOnly:true,externalServices:[]},healthPath:'/health',actors:[{actorRef:'owner',role:'user'},{actorRef:'other',role:'user'}],mapping}));
  const profile=await inspectProject(source);if(!profile.supported)throw new Error(`REFERENCE_UNSUPPORTED:${JSON.stringify(profile.gaps)}`);
  const credentials=new CredentialSession(),projectId=`reference-${randomUUID()}`;
  credentials.set(projectId,'owner','synthetic-reference-password-owner');credentials.set(projectId,'other','synthetic-reference-password-other');
  const env=await prepareCopy(profile,{projectId,port:await port(),confirmed:true,data:{source:'synthetic',count:2,seedVersion:'ticket-seed-v1'},accounts:[{actorRef:'owner',username:'alpha',userId:control.context?.ownerId??'user-a',role:'user'},{actorRef:'other',username:'beta',userId:control.context?.otherId??'user-b',role:'user'}],credentials});
  let client:CoreClient|undefined,state:Transition|undefined;const refs:string[]=[];const runId=randomUUID(),bound=bindMapping(mapping,env.id);
  const provenance={copyId:env.id,mappingHash:mappingHash(bound),effectiveCandidateHash:digest(spec)};
  try{
    client=await core();
    const prepare=async(checkId:string)=>env.prepareExperiment({runId,checkId,ruleHash:digest(suite.rule),mapping:bound,mappingHash:mappingHash(bound),confirmed:true,budget:{maxOperations:spec.limits.maxActions,deadlineMs:spec.limits.runTimeoutMs}});
    await prepare(spec.checks[0]!);
    state=await command(client,runId,'start',runPayload(spec,suite.rule,`${suite.suiteHash}:${id}`));
    let incomplete=false;
    while(state!.state==='running'){
      const action=state!.actions[0];if(!action)throw new Error('NO_ACTION');
      if(action.attemptId!==env.currentAttempt?.id){await env.completeAttempt();await prepare(action.checkId);}
      const observation=await execute(action,{environment:env,mapping:bound});
      refs.push(...observation.evidenceRefs.map(ref=>referenceRef(env.id,ref)));
      if(observation.transportStatus!=='ok')incomplete=true;
      state=await command(client,runId,'observation',{observation});
    }
    if(env.currentAttempt?.status==='running')await env.completeAttempt();
    const remapped=state!.verdicts.map(v=>({...v,evidenceRefs:v.evidenceRefs.map(ref=>referenceRef(env.id,ref))}));
    return {caseId:id,phase:'http',completed:state!.state==='completed'&&!incomplete,matched:false,verdicts:remapped,evidenceRefs:refs,...provenance,...(incomplete?{reason:'EXECUTION_INCOMPLETE'}:{})};
  }catch{
    return {caseId:id,phase:'http',completed:false,matched:false,verdicts:state?.verdicts??[],evidenceRefs:refs,...provenance,reason:'EXECUTION_INCOMPLETE'};
  }finally{try{await env.close();}finally{credentials.close();if(client)await client.close();}}
}
export async function validateAgainstSuite(candidate:TemplateSpec,input:ValidationSuite):Promise<SuiteValidationRecord>{
  const suite=await trusted(input),spec=structuredClone(candidate),client=await core();
  const record:SuiteValidationRecord={scope:'template_validation',candidateHash:digest(spec),ruleHash:digest(suite.rule),suiteHash:suite.suiteHash,interpreterVersion:'',mappingHash:digest([]),mappingDefinitionHash:digest(await json(join(reference,'mapping.json'))),gateResults:{static:false,coverage:false,observation:false,http:false,admitted:false},evidenceRefs:[],cases:[],issues:[]};
  try{
    const schema=validateContract('TemplateSpec',spec);
    const validation=await command(client,randomUUID(),'start',{operation:'validateTemplate',spec,capabilities});record.interpreterVersion=validation.interpreterVersion;
    record.gateResults.static=schema.valid&&validation.valid&&executableParameters(spec)&&spec.ruleRef.id===suite.rule.id&&spec.ruleRef.version===suite.rule.version;
    if(!record.gateResults.static){record.issues.push('STATIC_REJECTED');return record;}
    record.gateResults.coverage=['normal','defect','unknown'].every(kind=>suite.cases.some(c=>c.kind===kind&&!c.heldOut)&&suite.cases.some(c=>c.kind===kind&&c.heldOut));
    const samples=await json(join(root,'tests/fixtures/observations.json')) as Record<string,{trace:SampleFrame[]}>;
    for(const c of suite.cases){
      const configured=configure(spec,c.parameters);
      const observation=await validateObservations(client,configured,suite.rule,c.id,samples[c.id]!.trace,evidenceRoot);observation.effectiveCandidateHash=digest(configured);observation.matched=matches(observation,c.expected);record.cases.push(observation);
      const http=await runReferenceCase(spec,suite,c);http.matched=matches(http,c.expected);record.cases.push(http);
    }
    for(const phase of ['observation','http'] as const)record.gateResults[phase]=record.cases.filter(c=>c.phase===phase).length===suite.cases.length&&record.cases.filter(c=>c.phase===phase).every(c=>c.matched);
    record.gateResults.admitted=Object.entries(record.gateResults).filter(([k])=>k!=='admitted').every(([,v])=>v);
    record.mappingHash=digest(record.cases.filter(c=>c.phase==='http').map(c=>({caseId:c.caseId,copyId:c.copyId,mappingHash:c.mappingHash})));
    record.evidenceRefs=record.cases.flatMap(c=>c.evidenceRefs);if(!record.gateResults.admitted)record.issues.push('CONTROL_MISMATCH');
    return record;
  }finally{
    await client.close();await trusted(input);
    await mkdir(evidenceRoot,{recursive:true});const recordId=randomUUID();record.recordRef=`validation:${recordId}`;
    await writeFile(join(evidenceRoot,`${recordId}-record.json`),JSON.stringify(record,null,2)+'\n');
  }
}
