import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {within} from './inspect.js';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

export function childEnvironment(values:Record<string,string>):NodeJS.ProcessEnv {
  const env:NodeJS.ProcessEnv={};for(const [k,v]of Object.entries(process.env))if(/^(path|systemroot|windir|temp|tmp)$/i.test(k))env[k]=v;
  return {...env,...values};
}
export async function checkPort(port:number):Promise<void>{if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('INVALID_PORT');const server=createServer();await new Promise<void>((res,rej)=>{server.once('error',()=>rej(new Error('PORT_CONFLICT')));server.listen(port,'127.0.0.1',()=>res());});await new Promise<void>((res,rej)=>server.close(e=>e?rej(e):res()));}
export class OwnedProcess {
  readonly child:ChildProcessWithoutNullStreams;
  private readonly exited:Promise<void>;
  private done=false;
  private output='';
  private failed=false;
  constructor(root:string,argv:string[],env:NodeJS.ProcessEnv,input?:unknown){
    if(argv.length!==1)throw new Error('UNSUPPORTED_ARGV');const entry=within(root,argv[0]!);
    const stateFile=within(env.TEST_DATA_ROOT!,`owner-${randomUUID()}.json`);
    this.child=spawn(process.execPath,[fileURLToPath(new URL('./owned-runner.js',import.meta.url)),entry,stateFile],{cwd:root,env,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe','ipc']}) as ChildProcessWithoutNullStreams;
    this.child.stdout.setEncoding('utf8');this.child.stdout.on('data',(v:string)=>{this.output=(this.output+v).slice(-16384);});
    // Imported project logs may contain secrets. Never persist or expose raw stdout/stderr.
    this.child.stderr.resume();this.child.stdin.on('error',()=>{});
    const heartbeat=setInterval(()=>{if(this.child.connected)this.child.send({kind:'heartbeat'},()=>{});},500);heartbeat.unref();
    this.exited=new Promise(res=>{this.child.once('error',()=>{this.failed=true;this.done=true;res();});this.child.once('close',code=>{this.failed=code!==0;this.done=true;res();});});
    void this.exited.then(()=>clearInterval(heartbeat));
    if(input!==undefined)this.child.stdin.end(JSON.stringify(input));else this.child.stdin.end();
  }
  get running():boolean{return !this.done;}
  async finish(timeout=5000):Promise<unknown>{let timer:NodeJS.Timeout|undefined;try{await Promise.race([this.exited,new Promise<never>((_,rej)=>{timer=setTimeout(()=>rej(new Error('PROCESS_TIMEOUT')),timeout);})]);if(this.failed)throw new Error('INITIALIZATION_FAILED');try{return JSON.parse(this.output.trim());}catch{throw new Error('INVALID_INITIALIZATION_RECORD');}}finally{clearTimeout(timer);}}
  async stop():Promise<void>{if(this.done)return;if(this.child.connected)this.child.send({kind:'stop'},()=>{});let timer:NodeJS.Timeout|undefined;await Promise.race([this.exited,new Promise<void>(res=>{timer=setTimeout(res,2000);})]);clearTimeout(timer);if(!this.done)throw new Error('OLD_PROCESS_NOT_ISOLATED');}
}
