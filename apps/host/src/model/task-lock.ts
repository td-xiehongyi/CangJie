import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const bridge=fileURLToPath(new URL('../../../../scripts/candidate-lock.ps1',import.meta.url));
/** Windows named mutex is held by a pipe-owned helper. It survives neither
 * normal close nor host death, and works across independent Node processes. */
export async function acquireTask(id:string):Promise<()=>Promise<void>>{
  if(process.platform!=='win32'||!/^[a-f0-9-]{36}$/.test(id))throw new Error('CANDIDATE_LOCK_UNAVAILABLE');
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',bridge,'-TaskId',id],{windowsHide:true,stdio:'pipe'});child.stderr.resume();child.stdin.on('error',()=>{});
  const exited=new Promise<void>(r=>child.once('close',()=>r()));
  await new Promise<void>((resolve,reject)=>{
    let buffer='';const timer=setTimeout(()=>{child.kill();reject(new Error('CANDIDATE_LOCK_UNAVAILABLE'));},5000);
    child.once('error',()=>{clearTimeout(timer);reject(new Error('CANDIDATE_LOCK_UNAVAILABLE'));});
    child.once('close',()=>{clearTimeout(timer);reject(new Error('CANDIDATE_LOCK_UNAVAILABLE'));});
    child.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.includes('\n')){clearTimeout(timer);if(buffer.trim()==='{"locked":true}')resolve();else{child.stdin.end();reject(new Error('CANDIDATE_BUSY'));}}});
  });
  return async()=>{child.stdin.end();let timer:NodeJS.Timeout|undefined;try{await Promise.race([exited,new Promise<void>(r=>{timer=setTimeout(()=>{child.kill();r();},3000);})]);}finally{clearTimeout(timer);}};
}
