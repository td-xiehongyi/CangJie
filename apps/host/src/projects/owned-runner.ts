import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';

// Trusted supervisor: the IPC lifeline closes even if the host is killed.
// Imported projects cannot start descendants in the supported T2 profile.
const [entry,stateFile]=process.argv.slice(2);
if(!entry||!stateFile||!process.connected)throw new Error('OWNED_RUNNER_REQUIRES_LIFELINE');
let child:ReturnType<typeof spawn>|undefined,disconnected=false,lastHeartbeat=Date.now();
const lease=setInterval(()=>{if(Date.now()-lastHeartbeat>3000)stop();},250);
const stop=()=>{disconnected=true;clearInterval(lease);child?.kill();};
process.on('message',message=>{const kind=(message as {kind?:string})?.kind;if(kind==='stop')stop();if(kind==='heartbeat')lastHeartbeat=Date.now();});
process.on('disconnect',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
child=spawn(process.execPath,[entry],{cwd:process.cwd(),env:process.env,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
writeFileSync(stateFile,JSON.stringify({schemaVersion:1,instanceId:process.env.TEST_INSTANCE,state:'running',entry,pid:child.pid,runnerPid:process.pid}));
process.stdin.pipe(child.stdin!);child.stdin!.on('error',()=>{});
child.stdout!.pipe(process.stdout);child.stderr!.pipe(process.stderr);
if(disconnected)child.kill();
child.on('error',()=>{});
child.on('close',code=>{writeFileSync(stateFile,JSON.stringify({schemaVersion:1,instanceId:process.env.TEST_INSTANCE,state:'stopped',entry,pid:child?.pid,runnerPid:process.pid}));process.exit(code??1);});
