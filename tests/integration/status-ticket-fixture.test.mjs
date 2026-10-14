import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdtemp,cp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
const root=fileURLToPath(new URL('../../',import.meta.url));
const readJson=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
const assertionIds=['closed-status','remains-closed','unchanged-title','unchanged-owner','closed-unchanged-title','closed-unchanged-owner'];
const expectedByBehavior={
  normal:{'closed-status':'pass','remains-closed':'pass','unchanged-title':'pass','unchanged-owner':'pass','closed-unchanged-title':'pass','closed-unchanged-owner':'pass'},
  'reopen-defect':{'closed-status':'fail','remains-closed':'fail','unchanged-title':'fail','unchanged-owner':'fail','closed-unchanged-title':'fail','closed-unchanged-owner':'fail'},
  'owner-defect':{'closed-status':'pass','remains-closed':'pass','unchanged-title':'pass','unchanged-owner':'fail','closed-unchanged-title':'pass','closed-unchanged-owner':'fail'},
  'incomplete-query':{'closed-status':'inconclusive','remains-closed':'inconclusive','unchanged-title':'inconclusive','unchanged-owner':'inconclusive','closed-unchanged-title':'inconclusive','closed-unchanged-owner':'inconclusive'},
  'temporary-mutation':{'closed-status':'pass','remains-closed':'pass','unchanged-title':'pass','unchanged-owner':'pass','closed-unchanged-title':'fail','closed-unchanged-owner':'fail'}
};
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;}
async function service(t,{reference=false,behavior='normal',ownerId='fixture-owner',otherId='fixture-other'}={}){
  const source=join(root,reference?'tests/reference/status-transition':'samples/status-ticket');
  assert.ok(existsSync(join(source,reference?'server.ts':'src/server.ts')),'status-transition HTTP sample must exist');
  const directory=await mkdtemp(join(tmpdir(),'status-ticket-'));
  const executable=join(root,'tests/reference/status-transition/.fixture-'+randomUUID());let child;
  t.after(async()=>{if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('close',r));}await rm(executable,{recursive:true,force:true});await rm(directory,{recursive:true,force:true});});
  // Place a disposable source copy under the repo so Express resolves from its verified installed dependency.
  await mkdir(executable);
  for(const file of reference?['server.ts','behaviors.ts','db.ts','seed.ts']:['src','package.json'])await cp(join(source,file),join(executable,file),{recursive:true});
  if(reference)await writeFile(join(executable,'control.json'),JSON.stringify({behavior,otherId}));
  const port=await freePort(),databasePath=join(directory,'test.sqlite'),instanceId=randomUUID();
  const env={...process.env,PORT:String(port),TEST_DATA_ROOT:directory,TEST_DATABASE:databasePath,TEST_INSTANCE:instanceId};
  const accounts=[{userId:ownerId,username:'alpha',password:'synthetic-status-owner',role:'user'},{userId:otherId,username:'beta',password:'synthetic-status-other',role:'user'}];
  const init=spawnSync(process.execPath,[join(executable,reference?'seed.ts':'src/seed.ts')],{env,input:JSON.stringify({databasePath,instanceId,seedVersion:'status-ticket-seed-v1',count:2,accounts}),encoding:'utf8'});
  assert.equal(init.status,0,init.stderr);const baseline=JSON.parse(init.stdout);assert.equal(baseline.tickets,2);
  child=spawn(process.execPath,[join(executable,reference?'server.ts':'src/server.ts')],{env,stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('HTTP start timeout: '+stderr)),5000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(new Error('HTTP child exit '+code+': '+stderr));});});
  const url='http://127.0.0.1:'+port;
  const request=async(path,{token,method='GET',body,attempt='attempt-'+instanceId,intent='intent-'+instanceId}={})=>{const res=await fetch(url+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),'x-verification-attempt':attempt,'x-verification-intent':intent},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
  const owner=await request('/login',{method:'POST',body:{username:'alpha',password:accounts[0].password}}),other=await request('/login',{method:'POST',body:{username:'beta',password:accounts[1].password}});
  assert.equal(owner.status,200);assert.equal(other.status,200);
  return {request,token:owner.body.token,otherToken:other.body.token,ownerId,otherId,attempt:'attempt-'+instanceId,intent:'intent-'+instanceId};
}
async function transition(t,options={}){
  const x=await service(t,options),create=await x.request('/tickets',{token:x.token,method:'POST',body:{title:options.title??'HTTP 合成 '+x.intent,status:'open',intentId:x.intent}});assert.equal(create.status,201);assert.equal(create.body.status,'open');assert.equal(create.body.ownerId,x.ownerId);
  const query=()=>x.request('/tickets?id='+create.body.id+'&attemptId='+x.attempt,{token:x.token});
  const before=await query();assert.equal(before.status,200);
  const close=await x.request('/tickets/'+create.body.id,{token:x.token,method:'PATCH',body:{status:'closed'}});assert.equal(close.status,200);assert.equal(close.body.status,'closed');
  const closed=await query();const reopen=await x.request('/tickets/'+create.body.id,{token:x.token,method:'PATCH',body:{status:'open'}});const after=await query();
  return {...x,create,before,close,closed,reopen,after};
}
test('status ticket initialization, identity, correlation and irreversible transition are real HTTP behavior',async t=>{
  const x=await transition(t);assert.equal(x.reopen.status,409);assert.equal(x.after.body.items[0].status,'closed');assert.equal(x.after.body.items[0].title,x.before.body.items[0].title);assert.equal(x.after.body.items[0].ownerId,x.before.body.items[0].ownerId);
  assert.equal((await x.request('/tickets',{method:'POST',body:{title:'unauthenticated',status:'open'}})).status,401);
  assert.equal((await x.request('/tickets',{token:x.token,method:'POST',body:{title:'bad initial',status:'closed'}})).status,400);
  assert.equal((await x.request('/tickets',{token:x.token,method:'POST',body:{title:'no attempt',status:'open'},attempt:''})).status,400);
  assert.deepEqual((await x.request('/tickets?id='+x.create.body.id+'&attemptId='+x.attempt,{token:x.otherToken})).body.items,[]);
  assert.equal((await x.request('/tickets/'+x.create.body.id,{token:x.otherToken,method:'PATCH',body:{status:'closed'}})).status,404);
  assert.deepEqual((await x.request('/tickets?id='+x.create.body.id+'&attemptId=wrong-attempt',{token:x.token})).body.items,[]);
  assert.equal((await x.request('/tickets/'+x.create.body.id,{token:x.token,method:'PATCH',body:{status:'closed',title:'injected'}})).status,400);
});
const controlledCases=(await readJson('tests/reference/status-transition/suite-manifest.json')).suites[0].cases;
for(const c of controlledCases)test(`independent ${c.heldOut?'held-out':'development'} ${c.behavior} control preserves observed facts`,async t=>{
  const {behavior,context:{ownerId,otherId}}=c;const x=await transition(t,{reference:true,behavior,ownerId,otherId,title:c.parameters.title});
  assert.equal(x.before.body.complete,behavior!=='incomplete-query');assert.equal(x.before.body.hasMore,behavior==='incomplete-query');
  assert.equal(x.reopen.status,behavior==='reopen-defect'?200:409);assert.equal(x.after.body.items[0].status,behavior==='reopen-defect'?'open':'closed');assert.equal(x.after.body.items[0].ownerId,behavior==='owner-defect'?otherId:ownerId);assert.equal(x.after.body.items[0].title,x.before.body.items[0].title);
  if(behavior==='temporary-mutation'){
    assert.equal(x.closed.body.items[0].title,c.parameters.title+' [temporary close mutation]');assert.equal(x.closed.body.items[0].ownerId,otherId);
    assert.equal(x.reopen.body.title,c.parameters.title);assert.equal(x.reopen.body.ownerId,ownerId);
  }else{
    assert.equal(x.closed.body.items[0].title,x.before.body.items[0].title);assert.equal(x.closed.body.items[0].ownerId,behavior==='owner-defect'?otherId:ownerId);
  }
});
test('frozen private suite has ten independent controls and exact template trace semantics',async()=>{
  assert.ok(existsSync(join(root,'tests/reference/status-transition/suite-manifest.json')),'independent frozen status-transition suite must exist');
  const manifest=await readJson('tests/reference/status-transition/suite-manifest.json'),suite=manifest.suites[0],spec=await readJson('tests/fixtures/status-transition-template.json'),observations=await readJson('tests/fixtures/status-transition-observations.json');
  assert.equal(manifest.version,'status-transition-reference-v1.1.0');assert.equal(suite.rule.id,'status-transition-rule');assert.equal(suite.rule.version,1);assert.equal(suite.cases.length,10);assert.equal(new Set(suite.cases.map(c=>c.parameters.title)).size,10);assert.equal(new Set(suite.cases.map(c=>c.parameters.intent)).size,10);
  assert.deepEqual(spec.steps.map(s=>s.operationId),['create','query','update','query','update','query']);assert.equal(new Set(spec.steps.map(s=>s.checkId)).size,1);assert.equal(spec.steps[4].expectedAcceptance,'rejected');assert.deepEqual(spec.assertions.map(a=>a.id),assertionIds);assert.ok(spec.assertions.every(a=>a.expr.op==='eq'));
  for(const c of suite.cases){assert.deepEqual(Object.keys(c.expected),assertionIds);const trace=observations[c.id].trace;assert.equal(trace.length,c.behavior==='incomplete-query'?2:c.behavior==='reopen-defect'?5:6);assert.deepEqual(trace.map(f=>f.operationId),spec.steps.slice(0,trace.length).map(s=>s.operationId));assert.equal(trace[0].observation.result.title,c.parameters.title);for(const f of trace.filter(f=>f.operationId==='query'))assert.equal(f.observation.result.status,f.observation.result.items[0].status);assert.deepEqual(c.expected,expectedByBehavior[c.behavior]);if(c.behavior==='temporary-mutation'){assert.notEqual(trace[3].observation.result.title,trace[1].observation.result.title);assert.notEqual(trace[3].observation.result.ownerId,trace[1].observation.result.ownerId);assert.equal(trace[4].observation.acceptance,'rejected');assert.equal(trace[5].observation.result.title,trace[1].observation.result.title);assert.equal(trace[5].observation.result.ownerId,trace[1].observation.result.ownerId);}}
  for(const [id,field]of [['closed-unchanged-title','title'],['closed-unchanged-owner','ownerId']])assert.deepEqual(spec.assertions.find(a=>a.id===id).expr,{op:'eq',args:[{op:'field',var:'closed',path:[field]},{op:'field',var:'before',path:[field]}]});
  for(const [id,field]of [['unchanged-title','title'],['unchanged-owner','ownerId']])assert.deepEqual(spec.assertions.find(a=>a.id===id).expr,{op:'eq',args:[{op:'field',var:'after',path:[field]},{op:'field',var:'before',path:[field]}]});
  for(const heldOut of [false,true]){const cases=suite.cases.filter(c=>c.heldOut===heldOut);assert.equal(cases.length,5);assert.deepEqual(cases.map(c=>c.kind),['normal','defect','defect','unknown','defect']);}
  assert.equal(new Set(suite.cases.map(c=>c.context.ownerId)).size,10);assert.equal(new Set(suite.cases.map(c=>c.context.otherId)).size,10);
  const mapping=await readJson('tests/reference/status-transition/mapping.json');assert.deepEqual(mapping.resultBindings.query.status,['items','0','status']);assert.deepEqual(Object.keys(mapping.operations.find(o=>o.operationId==='update').bodyBindings),['status']);
});
test('status-transition resources match frozen sha256 bytes',async()=>{
  assert.ok(existsSync(join(root,'tests/reference/status-transition/suite-lock.json')),'private suite lock must exist');const lock=await readJson('tests/reference/status-transition/suite-lock.json');
  for(const path of ['tests/reference/status-transition/suite-manifest.json','tests/fixtures/status-transition-template.json','tests/fixtures/status-transition-observations.json'])assert.ok(Object.hasOwn(lock,path),'lock must cover '+path);
  for(const [path,hash]of Object.entries(lock)){assert.ok(!path.includes('..'));assert.ok(!path.includes('/history/'),'active lock must not recursively freeze history');assert.equal(createHash('sha256').update(await readFile(join(root,path))).digest('hex'),hash,path);}
});

test('historical v1.0.0 resources preserve original bytes, lock and readable manifest',async()=>{
  const prefix='tests/reference/status-transition/history/v1.0.0/',snapshot=await readJson(prefix+'snapshot-manifest.json'),originalLock=await readJson(prefix+'tests/reference/status-transition/suite-lock.json');
  assert.equal(snapshot.version,'1.0.0');assert.equal(snapshot.activeSuiteVersion,'status-transition-reference-v1');assert.equal(Object.keys(snapshot.sha256).length,10);
  for(const [path,hash]of Object.entries(snapshot.sha256))assert.equal(createHash('sha256').update(await readFile(join(root,prefix,path))).digest('hex'),hash,path);
  for(const [path,hash]of Object.entries(originalLock))assert.equal(snapshot.sha256[path],hash);
  const oldManifest=await readJson(prefix+'tests/reference/status-transition/suite-manifest.json'),oldTemplate=await readJson(prefix+'tests/fixtures/status-transition-template.json');
  assert.equal(oldManifest.suites[0].cases.length,8);assert.equal(oldManifest.version,'status-transition-reference-v1');assert.equal(oldTemplate.assertions.length,4);
  assert.notEqual(oldManifest.version,(await readJson('tests/reference/status-transition/suite-manifest.json')).version);
});
