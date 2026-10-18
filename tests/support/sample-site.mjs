import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
export async function sampleSite(t,name,sourceRoot){
 const root=sourceRoot??resolve('samples',name),directory=await mkdtemp(join(tmpdir(),'cangjie-sample-'));
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const instanceId=randomUUID(),databasePath=join(directory,'sample.sqlite');
 const env={...process.env,PORT:String(port),TEST_INSTANCE:instanceId,TEST_DATA_ROOT:directory,TEST_DATABASE:databasePath};
 const accounts=[{userId:'owner',username:'demo-owner',password:'synthetic-owner',role:'user'},{userId:'other',username:'demo-other',password:'synthetic-other',role:'user'}];
 let child;
 t.after(async()=>{if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('close',r))}await rm(directory,{recursive:true,force:true})});
 const seed=spawnSync(process.execPath,['src/seed.ts'],{cwd:root,env,input:JSON.stringify({databasePath,instanceId,seedVersion:name+'-seed-v1',count:0,accounts}),encoding:'utf8'});
 if(seed.status!==0)throw new Error(seed.stderr);
 child=spawn(process.execPath,['src/server.ts'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',v=>stderr+=v);
 await new Promise((res,rej)=>{const timer=setTimeout(()=>rej(new Error(stderr||'sample start timeout')),5000);child.once('error',e=>{clearTimeout(timer);rej(e)});child.once('exit',code=>{clearTimeout(timer);rej(new Error('sample exit '+code+': '+stderr))});child.stdout.once('data',()=>{clearTimeout(timer);res()})});
 return {url:'http://127.0.0.1:'+port,accounts};
}
