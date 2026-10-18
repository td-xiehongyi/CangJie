// Local-only demo. Always creates its own fresh temporary database; never reuses a supplied database path.
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await readFile(join(root,'verification.json'),'utf8'));
const requested=process.env.PORT===undefined?0:Number(process.env.PORT);
if(!Number.isSafeInteger(requested)||requested<0||requested>65535)throw new Error('PORT must be an integer from 0 to 65535');
const socket=createServer();await new Promise((res,rej)=>{socket.once('error',rej);socket.listen(requested,'127.0.0.1',res)});const port=socket.address().port;await new Promise(r=>socket.close(r));
const directory=await mkdtemp(join(tmpdir(),'cangjie-demo-')),instanceId=randomUUID(),databasePath=join(directory,'demo.sqlite');
const accounts=['owner','other'].map(role=>({userId:'demo-'+role,username:'demo-'+role,password:randomBytes(12).toString('base64url'),role:'user'}));
const env={...process.env,PORT:String(port),TEST_INSTANCE:instanceId,TEST_DATA_ROOT:directory,TEST_DATABASE:databasePath};
let child,stopping=false;
async function cleanup(){await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
function stop(){if(stopping)return;stopping=true;child?.kill();}
function onMessage(message){if(message==='stop')stop()}
try{
 const seeded=spawnSync(process.execPath,['src/seed.ts'],{cwd:root,env,input:JSON.stringify({databasePath,instanceId,seedVersion:manifest.initialization.version,count:0,accounts}),encoding:'utf8'});
 if(seeded.status!==0)throw new Error('Demo initialization failed: '+seeded.stderr);
 child=spawn(process.execPath,['src/server.ts'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 // IPC lets a supervising process request cleanup without force-killing this launcher on Windows.
 process.on('message',onMessage);
 let stderr='';child.stderr.on('data',v=>stderr+=v);
 const finished=new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('close',code=>resolve(code??0))});
 await new Promise((res,rej)=>{const timer=setTimeout(()=>rej(new Error('Demo startup timed out')),8000);child.once('error',e=>{clearTimeout(timer);rej(e)});child.once('exit',code=>{clearTimeout(timer);rej(new Error('Demo exited '+code+': '+stderr))});child.stdout.once('data',()=>{clearTimeout(timer);res()})});
 const info={name:manifest.name,url:'http://127.0.0.1:'+port,accounts,directory};
 if(process.argv.includes('--json'))console.log(JSON.stringify(info));
 else {console.log('\n'+info.name+'：'+info.url+'\n仅用于本机合成测试。密码每次随机生成，不要使用真实账号。');for(const a of accounts)console.log('账号：'+a.username+'  密码：'+a.password);console.log('按 Ctrl+C 停止。正常退出删除临时数据库；强制终止可能留下系统临时目录。\n')}
 process.exitCode=await finished;
}catch(e){stop();if(child&&child.exitCode===null)await new Promise(r=>child.once('close',r));console.error(e.message);process.exitCode=1}
finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);process.removeListener('message',onMessage);try{await cleanup()}finally{if(process.connected)process.disconnect()}}
