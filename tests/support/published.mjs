import {listenLoopback} from '../../apps/host/dist/execution/ports.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
export async function publishedFixture(directory,registry,fixture='tests/fixtures/title-update.json',ruleId='title-update-rule',version='1.0.0'){
  const {CandidateTask}=await import('../../apps/host/dist/model/candidate.js');
  const {ModelCredentials}=await import('../../apps/host/dist/model/credentials.js');
  const {disclose,confirmDisclosure}=await import('../../apps/host/dist/model/context.js');
  const {capabilities}=await import('../../apps/host/dist/validation/observations.js');
  const {loadValidationSuite}=await import('../../apps/host/dist/validation/reference-runner.js');
  const spec=JSON.parse(await readFile(join(process.cwd(),fixture),'utf8'));
  await mkdir(directory,{recursive:true});await writeFile(join(directory,'public-summary.md'),'Synthetic HTTP JSON project.');
  const server=createServer(async(req,res)=>{for await(const c of req){}res.writeHead(200,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(spec)}}],usage:{total_tokens:20}}));});
  await listenLoopback(server);const serviceUrl=`http://127.0.0.1:${server.address().port}`,keys=new ModelCredentials();
  try{
    const credentialRef=await keys.set(serviceUrl,'synthetic-t6-model-key',{remember:false}),suite=await loadValidationSuite(ruleId);
    const context={projectId:'t6-fixture',root:directory,entries:[{path:'public-summary.md',contentType:'summary'}],serviceUrl};
    const task=await CandidateTask.create({rule:suite.rule,capabilities,context,consent:confirmDisclosure(await disclose(context),true),config:{serviceUrl,model:'deterministic-test-only',credentialRef}},keys);
    const candidate=await task.run({source:join(process.cwd(),'samples/ticket'),projectId:'t6-fixture',confirmed:true});
    if(candidate.status!=='ready_for_review')throw new Error(JSON.stringify({status:candidate.status,phase:candidate.phase,code:candidate.code}));
    const draft=await registry.stageCandidate(task.id,{version,applicable:['Reviewed HTTP JSON rule'],excluded:['Other business semantics'],instructions:'Confirm new project mapping and reset the synthetic baseline.'});
    return await registry.publishCandidate(candidate.candidateHash,candidate.validation,{scope:draft.draftHash,validationRef:candidate.validation.recordRef,decision:'approve',businessConfirmation:'fixture-business',technicalReviewer:'fixture-developer',time:new Date().toISOString()});
  }finally{keys.close();await new Promise(r=>server.close(r));}
}
