import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {once} from 'node:events';
const {directory}=JSON.parse(await readFile('docs/evidence/t9-latest.json','utf8'));
const child=spawn(process.execPath,['scripts/workbench.mjs'],{cwd:directory,env:{...process.env,WORKBENCH_PORT:'0'},windowsHide:true,stdio:['ignore','pipe','pipe']});
const exited=once(child,'exit');let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);
try{
  const until=Date.now()+10000;while(!/http:\/\/127\.0\.0\.1:\d+/.test(output)&&Date.now()<until&&child.exitCode===null)await new Promise(r=>setTimeout(r,50));
  const url=output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];if(!url)throw new Error('DELIVERY_ENTRY_START_FAILED:'+output);
  const response=await fetch(url);if(response.status!==200)throw new Error('DELIVERY_UI_UNAVAILABLE');
  const {token}=await(await fetch(url+'/api/session')).json();
  const close=await fetch(url+'/api/session/close',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}'});
  if(!close.ok)throw new Error('DELIVERY_SESSION_CLOSE_FAILED');
  await writeFile('docs/evidence/t9-startup.json',JSON.stringify({directory,command:'node scripts/workbench.mjs (npm start target)',uiStatus:response.status,sessionClosed:true,recordedAt:new Date().toISOString()},null,2)+'\n');
}finally{child.kill();await exited;}
