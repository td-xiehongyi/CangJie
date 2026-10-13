import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ModelCredentials} from '../apps/host/dist/model/credentials.js';
import {disclose,confirmDisclosure} from '../apps/host/dist/model/context.js';
import {CandidateTask} from '../apps/host/dist/model/candidate.js';
const root=fileURLToPath(new URL('../',import.meta.url)),serviceUrl='https://api.deepseek.com';
const context={projectId:'t4-title-update-pilot',root,serviceUrl,entries:[{path:'docs/model/title-update-context.json',contentType:'rule'}]};
const publicContext=JSON.parse(await readFile(join(root,context.entries[0].path),'utf8'));
const disclosure=await disclose(context);
if(process.argv.includes('--disclose')){console.log(JSON.stringify({disclosure,publicContext,payloadTypes:['confirmed rule','capability and operation descriptions','generic TemplateSpec schema','public obligation identifiers','generic validation diagnostics'],excluded:['project source','complete templates','reference fixtures and labels','database','credentials'],limits:{maxCalls:8,maxAutoRevisions:2}}));process.exit(0);}
// This entrypoint accepts a secret only on stdin from the secure local prompt.
// Neither arguments, environment variables nor project files carry the key.
let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>10000)throw new Error('INVALID_LOCAL_INPUT');}
let input;try{input=JSON.parse(raw);}catch{throw new Error('INVALID_LOCAL_INPUT');}raw='';
if(input.confirmed!==true||typeof input.model!=='string'||!input.model.trim())throw new Error('LOCAL_CONFIRMATION_OR_MODEL_REQUIRED');
const credentials=new ModelCredentials();let task;
try{
  const credentialRef=await credentials.set(serviceUrl,input.key,{remember:input.remember===true});input.key='';
  const config={serviceUrl,model:input.model,credentialRef};
  await mkdir(join(root,'.local-data/model'),{recursive:true});
  await writeFile(join(root,'.local-data/model/config.json'),JSON.stringify({...config,credentialRef:input.remember===true?credentialRef:undefined},null,2)+'\n');
  task=input.taskId?await CandidateTask.open(input.taskId,credentials,credentialRef):await CandidateTask.create({rule:publicContext.rule,capabilities:publicContext.capabilities,context,consent:confirmDisclosure(disclosure,true),config},credentials);
  if(task.snapshot().input.config.model!==input.model||task.snapshot().input.config.serviceUrl!==serviceUrl)throw new Error('MODEL_CONFIGURATION_CHANGED');
  console.log(JSON.stringify({stage:'created',taskId:task.id,model:input.model,serviceUrl,remembered:input.remember===true}));
  if(!input.taskId)await task.checkConnection();
  const result=await task.run({source:join(root,'samples/ticket'),projectId:'t4-ticket-trial',confirmed:true});
  const summary={schemaVersion:1,evidenceTier:'live-model',taskId:task.id,actualModel:input.model,serviceUrl,status:result.status,phase:result.phase,code:result.code,revisionIndex:result.revisionIndex,budget:result.budget,preset:result.input.preset??'model-v1',candidateHash:result.candidateHash,ruleHash:result.ruleHash,connection:'checked separately from candidate qualification',gates:result.validation?.gateResults,validationRef:result.validation?.recordRef,cases:result.validation?.cases.map(({caseId,phase,completed,matched,verdicts})=>({caseId,phase,completed,matched,verdicts:verdicts.map(v=>({assertion:v.assertionRef,status:v.status}))})),trial:result.trial?{projectId:result.trial.projectId,copyId:result.trial.copyId,mappingHash:result.trial.mappingHash,completed:result.trial.completed,verdicts:result.trial.verdicts}:undefined,audit:result.audit};
  await writeFile(join(root,'.local-data/model',`${task.id}-live-result.json`),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({stage:'result',taskId:task.id,status:summary.status,code:summary.code,revisionIndex:summary.revisionIndex,calls:summary.budget.calls,validationGates:summary.gates,trialCompleted:summary.trial?.completed,evidence:join(root,'.local-data/model',`${task.id}-live-result.json`)}));
  if(result.status!=='ready_for_review')process.exitCode=2;
}catch(error){console.error(JSON.stringify({stage:'stopped',taskId:task?.id,code:/^[A-Z_]+$/.test(error?.message??'')?error.message:'LOCAL_EXECUTION_FAILED'}));process.exitCode=1;}
finally{input.key='';credentials.close();}
