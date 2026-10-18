import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';

const root=fileURLToPath(new URL('../../',import.meta.url));
const fixture=resolve(root,'output/t10-comparison');
const digest=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));

test('T10 frozen projects preserve originals and reproduce the intended difference over HTTP', {timeout:30000}, async()=>{
  const manifest=await load(resolve(fixture,'private-manifest.json'));
  const currentOriginals=new Map(await Promise.all(Object.keys(manifest.original).map(async name=>[name,digest(await readFile(resolve(root,'samples/ticket',name)))])));
  // The repaired snapshot preserves the original at freeze time; the live sample may evolve independently.
  for(const [name,hash] of Object.entries(manifest.original))
    assert.equal(digest(await readFile(resolve(fixture,'repaired',name))),hash,`frozen original changed: ${name}`);
  for(const [name,hash] of Object.entries(manifest.files))
    assert.equal(digest(await readFile(resolve(fixture,name))),hash,`frozen file changed: ${name}`);
  const {inspectProject}=await import('../../apps/host/dist/projects/inspect.js');
  const observations=[];
  for(const version of ['initial','repaired']){
    const source=resolve(fixture,version);
    const profile=await inspectProject(source);
    assert.equal(profile.supported,true,JSON.stringify(profile.gaps));
    await mkdir(resolve(root,'.local-data/t10-fixture-checks'),{recursive:true});
    const dataRoot=await mkdtemp(resolve(root,'.local-data/t10-fixture-checks/run-'));
    const databasePath=resolve(dataRoot,'test.sqlite');
    const instanceId=randomUUID();
    const accounts=[{userId:'user-a',username:'alpha',role:'user',password:randomUUID()},
      {userId:'user-b',username:'beta',role:'user',password:randomUUID()}];
    const seed={databasePath,instanceId,seedVersion:'ticket-seed-v1',count:2,accounts};
    const env={...process.env,TEST_DATA_ROOT:dataRoot,TEST_DATABASE:databasePath,TEST_INSTANCE:instanceId};
    const initialize=()=>{
      const result=spawnSync(process.execPath,['src/seed.ts'],{cwd:source,env,input:JSON.stringify(seed),encoding:'utf8',windowsHide:true,timeout:5000});
      assert.equal(result.status,0,result.stderr);
      return JSON.parse(result.stdout.trim());
    };
    const baseline=initialize();
    assert.equal(baseline.users,2);assert.equal(baseline.tickets,2);
    const socket=createServer();
    await new Promise(r=>socket.listen(0,'127.0.0.1',r));
    const port=socket.address().port;
    await new Promise(r=>socket.close(r));
    const child=spawn(process.execPath,['src/server.ts'],{cwd:source,env:{...env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
    const closed=new Promise(r=>child.once('close',r));
    child.stderr.resume();
    const trace=[];
    try{
      await new Promise((ok,no)=>{
        const timer=setTimeout(()=>no(new Error('sample startup timeout')),5000);
        const finish=error=>{clearTimeout(timer);error?no(error):ok();};
        child.once('error',finish);
        child.once('exit',code=>finish(new Error(`sample exited: ${code}`)));
        child.stdout.once('data',()=>finish());
      });
      const url=`http://127.0.0.1:${port}`;
      const request=async(method,path,body,token)=>{
        const response=await fetch(url+path,{method,headers:{'Content-Type':'application/json',
          ...(token?{Authorization:`Bearer ${token}`} : {}),'x-verification-attempt':'t10-attempt','x-verification-intent':'t10-intent'},
          ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(3000)});
        const data=await response.json();
        if(path!=='/login')trace.push({method,path,status:response.status,body:data});
        return {status:response.status,data};
      };
      const login=await request('POST','/login',{username:accounts[0].username,password:accounts[0].password});
      assert.equal(login.status,200);const token=login.data.token;
      const other=await request('POST','/login',{username:accounts[1].username,password:accounts[1].password});
      assert.equal(other.status,200);
      const created=await request('POST','/tickets',{title:'初始标题',intentId:'t10-intent'},token);
      assert.equal(created.status,201);assert.equal(created.data.priority,'high');
      const id=created.data.id;
      const updated=await request('PATCH',`/tickets/${id}`,{title:'更新标题'},token);
      assert.equal(updated.status,200);
      const queried=await request('GET',`/tickets?attemptId=t10-attempt&id=${id}`,undefined,token);
      assert.equal(queried.status,200);assert.equal(queried.data.complete,true);
      assert.equal(queried.data.total,1);
      const after=queried.data.items[0];
      assert.equal(after.title,'更新标题');assert.equal(after.ownerId,'user-a');
      assert.equal(after.priority,version==='initial'?'low':'high');
      const unauthorized=await request('PATCH',`/tickets/${id}`,{title:'越权标题'},other.data.token);
      assert.equal(unauthorized.status,404);
      const otherQuery=await request('GET',`/tickets?attemptId=t10-attempt&id=${id}`,undefined,other.data.token);
      assert.equal(otherQuery.data.total,0);
      observations.push({version,baselineHash:baseline.hash,trace,priorityPreserved:after.priority===created.data.priority});
    }finally{child.kill();await closed;}
    const reset=initialize();assert.equal(reset.hash,baseline.hash,'reset did not restore semantic baseline');
  }
  assert.equal(observations[0].baselineHash,observations[1].baselineHash);
  for(const [name,hash] of Object.entries(manifest.files))
    assert.equal(digest(await readFile(resolve(fixture,name))),hash,`execution changed source: ${name}`);
  for(const [name,hash] of currentOriginals)
    assert.equal(digest(await readFile(resolve(root,'samples/ticket',name))),hash,`execution changed current sample: ${name}`);
  await writeFile(resolve(root,'docs/evidence/t10-fixture-check.json'),JSON.stringify({recordedAt:new Date().toISOString(),
    kind:'developer fixture validation only',realModel:false,comparisonRun:false,node:process.version,
    manifestSha256:digest(await readFile(resolve(fixture,'private-manifest.json'))),observations},null,2)+'\n');
});
