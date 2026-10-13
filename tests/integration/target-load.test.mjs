import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

const defaults={confirmed:true,rate:2,durationSeconds:2,maxVUs:4,maxIterations:50,maxHostMemoryMb:2048,settlementMs:3000,latencyMs:2000,errorRate:0,sustainedSamples:2,ratios:{'save-rule':100}};

test('T8 provides a bounded load runner and explicit settlement',async()=>{
  assert.ok(existsSync('apps/host/dist/load/runner.js'),'target load implementation is missing');
  const {validateTarget}=await import('../../apps/host/dist/load/runner.js');
  const target={confirmed:true,rate:2,durationSeconds:2,maxVUs:2,maxIterations:10,maxHostMemoryMb:1024,settlementMs:3000,latencyMs:1000,errorRate:0,sustainedSamples:2,ratios:{'save-rule':100}};
  assert.doesNotThrow(()=>validateTarget(target,['save-rule']));
  for(const change of [{confirmed:false},{rate:0},{durationSeconds:Infinity},{maxVUs:0},{errorRate:2},{ratios:{other:100}}])assert.throws(()=>validateTarget({...target,...change},['save-rule']));
});

test('actual k6 fixed target, accumulation, stopping and evidence',{timeout:180000},async t=>{
  const {restoreFixture}=await import('../../scripts/t7-fixture.mjs');
  const {TemplateRegistry}=await import('../../apps/host/dist/templates/store.js');
  const {ArtifactStore}=await import('../../apps/host/dist/artifacts/store.js');
  const {CredentialSession}=await import('../../apps/host/dist/execution/session.js');
  const {RunExecutor,confirmPlan}=await import('../../apps/host/dist/replay.js');
  const {inspectProject}=await import('../../apps/host/dist/projects/inspect.js');
  const {startTargetLoad,LoadStore}=await import('../../apps/host/dist/load/runner.js');
  const root=process.cwd(),directory=join(root,'.local-data/target-load-tests',randomUUID());await mkdir(directory,{recursive:true});
  const registry=new TemplateRegistry((await restoreFixture()).registry),frozen=JSON.parse(await readFile('docs/evidence/t7-freeze.json','utf8'));
  const pub=frozen.publications.find(p=>p.rule.id==='save-rule');
  const credentials=new CredentialSession(),projectId='t8-test';credentials.set(projectId,'owner','t8-synthetic-owner');credentials.set(projectId,'other','t8-synthetic-other');t.after(()=>credentials.close());
  const store=new ArtifactStore(join(directory,'runs')),reports=[];
  async function prepare(mutation){
    let source=join(root,'samples/ticket');if(mutation){source=join(directory,randomUUID());await cp(join(root,'samples/ticket'),source,{recursive:true});const path=join(source,'src/server.ts');await writeFile(path,mutation(await readFile(path,'utf8')));}
    const profile=await inspectProject(source),environment={source,projectId,confirmed:true,data:{source:'synthetic',count:2,seedVersion:'ticket-seed-v1'},accounts:[{actorRef:'owner',username:'alpha',userId:'user-a',role:'user'},{actorRef:'other',username:'beta',userId:'user-b',role:'user'}],credentials};
    const plan=confirmPlan({projectId,flow:{id:'submit',title:'提交工单'},checks:[{rule:pub.rule,templateRef:pub.ref,mode:'verify'}],mapping:profile.mapping,sourceHash:profile.sourceHash});
    const sourceRun=await new RunExecutor(registry,store).run(plan,environment);assert.equal(sourceRun.status,'completed',JSON.stringify(sourceRun.uncovered));assert.ok(sourceRun.checks[0].verdicts.every(v=>v.status==='pass'));
    return {sourceRun,environment,registry,directory:join(directory,'loads')};
  }
  const base=await prepare();
  await t.test('concurrent API starts admit only one task per project',async()=>{
    const {startWorkbench}=await import('../../apps/host/dist/api.js');const host=await startWorkbench({directory:join(directory,'api'),registryDirectory:registry.directory,port:0});
    const request=async(path,body)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};};
    try{
      const p=await request('/projects',{directory:base.environment.source,accounts:base.environment.accounts.map(a=>({...a,password:credentials.get(projectId,a.actorRef)}))});const pid=p.data.projectId;
      const current=(await request('/state')).data.projects[0];await request(`/projects/${pid}/confirm`,{environment:true,environmentHash:current.environmentHash});
      const source=structuredClone(base.sourceRun);source.projectId=pid;source.plan.projectId=pid;await host.store.finish(source);
      const results=await Promise.all([request(`/projects/${pid}/load`,{sourceRunId:source.id,target:defaults}),request(`/projects/${pid}/load`,{sourceRunId:source.id,target:defaults})]);
      await Promise.all(results.filter(r=>r.status===202).map(r=>request(`/loads/${r.data.loadId}/stop`,{})));
      assert.deepEqual(results.map(r=>r.status).sort(),[202,400]);
    }finally{await host.close();}
  });
  async function load(config=base,changes={},onStart){const h=startTargetLoad({...config,...defaults,...changes},config.sourceRun.plan.mapping);if(onStart)await onStart(h);const r=await h.result;reports.push(r);return r;}
  await t.test('no_post_target_exploration and all sent experiments have evidence',async()=>{
    const r=await load();assert.equal(r.verdict,'pass',JSON.stringify({reason:r.reason,metrics:r.metrics,generator:r.generator,ledger:r.ledger}));assert.equal(r.metrics.started,4);assert.equal(r.settlement.unknown,0);assert.equal(r.generator.dropped,0);assert.equal(r.ledger.filter(e=>e.phase==='preflight').length,1);assert.ok(r.metrics.verificationRequests>0);assert.ok(Object.keys(r.evidence).length>=10);assert.ok(!JSON.stringify(r).includes('t8-synthetic-owner'));
    const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(root,'.local-data/projects',r.copyId,'data/test.sqlite'),{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) AS n FROM tickets').get().n,7,'2 seed + 1 preflight + 4 target; no reset');}finally{db.close();}
    assert.deepEqual(await new LoadStore(base.directory).getLoad(r.id),r);
    assert.equal(r.environment.attempts[0].status,'completed','settled environment must not retain a running preparation');
    assert.ok(r.metrics.verificationMs>0,'query execution overhead must be measured separately');
  });
  await t.test('thresholds missing reports observation only',async()=>{const r=await load(base,{latencyMs:undefined});assert.equal(r.verdict,'unknown');assert.equal(r.reason,'OBSERVATION_ONLY');});
  await t.test('sustained_latency_stops',async()=>{const r=await load(base,{rate:5,durationSeconds:10,latencyMs:1,sustainedSamples:2});assert.equal(r.reason,'sustained_latency');assert.notEqual(r.verdict,'pass');assert.ok(r.metrics.started<50);});
  await t.test('manual_cancel settles in-flight work',async()=>{const r=await load(base,{durationSeconds:10},async h=>{while(h.snapshot().metrics.started<1&&h.snapshot().status!=='blocked')await new Promise(r=>setTimeout(r,25));await h.stop('manual_cancel');});assert.equal(r.reason,'manual_cancel');assert.notEqual(r.verdict,'pass');assert.equal(r.settlement.unfinished.length,0);});
  await t.test('hard operation limit stops without raising the target',async()=>{const r=await load(base,{durationSeconds:5,maxIterations:1});assert.equal(r.reason,'operation_limit');assert.equal(r.metrics.started,1);assert.notEqual(r.verdict,'pass');});
  await t.test('business_error_stops only selected flow',async()=>{
    const mutated=await prepare(s=>s.replace("res.status(201).json(row);", "if(Number(db.prepare('SELECT count(*) AS n FROM tickets').get()!.n)>3)db.prepare(\"UPDATE tickets SET title='broken' WHERE id=?\").run(row!.id);res.status(201).json(row);"));
    const r=await load(mutated,{durationSeconds:5});assert.equal(r.reason,'business_error');assert.equal(r.verdict,'fail');assert.ok(r.metrics.started<10);
  });
  await t.test('query incompleteness remains unknown',async()=>{
    const mutated=await prepare(s=>s.replace('complete:true','complete:Number(db.prepare(\'SELECT count(*) AS n FROM tickets\').get()!.n)<=3'));
    const r=await load(mutated);assert.equal(r.verdict,'unknown');assert.ok(r.settlement.unknown>0);assert.equal(r.settlement.failed,0);
  });
  await t.test('generator overload is unknown, not a website failure',async()=>{
    const slow=await prepare(s=>s.replace('const delay=Math.max(0,Math.min(2000,Number(req.body.delayMs)||0))','const delay=80'));
    const r=await load(slow,{rate:30,durationSeconds:1,maxVUs:1});assert.equal(r.verdict,'unknown');assert.equal(r.generator.limited,true);assert.ok(r.generator.dropped>0);assert.equal(r.settlement.failed,0);
  });
  await t.test('missing password blocks before any target dispatch',async()=>{
    const empty=new CredentialSession();try{const r=await load({...base,environment:{...base.environment,credentials:empty}});assert.equal(r.status,'blocked');assert.equal(r.metrics.started,0);assert.equal(r.verdict,'unknown');}finally{empty.close();}
  });
  await t.test('failed source and changed mapping block before starting k6',async()=>{const bad=structuredClone(base.sourceRun);bad.checks[0].verdicts[0].status='fail';assert.throws(()=>startTargetLoad({...base,...defaults,sourceRun:bad},bad.plan.mapping),/BUSINESS_GATE/);const mapping=structuredClone(base.sourceRun.plan.mapping);mapping.version++;assert.throws(()=>startTargetLoad({...base,...defaults},mapping),/BUSINESS_GATE/);});
  await writeFile(join(directory,'summary.json'),JSON.stringify(reports.map(r=>({id:r.id,reason:r.reason,verdict:r.verdict,metrics:r.metrics,generator:r.generator})),null,2));
  await writeFile('docs/evidence/t8-latest.json',JSON.stringify({directory,reports:reports.map(r=>({id:r.id,reason:r.reason,verdict:r.verdict,metrics:r.metrics}))},null,2));
});

test('ledger_unsettled_unknown: missing evidence and unfinished work never pass',async()=>{
  assert.ok(existsSync('apps/host/dist/load/ledger.js'),'settlement implementation is missing');
  const {settle}=await import('../../apps/host/dist/load/ledger.js');
  const result=await settle({entries:[{id:'pending',status:'running'},{id:'unknown',status:'unknown'},{id:'pass',status:'pass'}],pending:new Set()},Date.now());
  assert.equal(result.unknown,2);assert.equal(result.passed,1);assert.equal(result.failed,0);
});
