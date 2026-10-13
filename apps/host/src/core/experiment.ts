import {randomUUID} from 'node:crypto';
import type {CoreClient} from './client.js';
import type {Observation,RunStart,Transition} from '@website-verification/contracts';

/** One controlled run. Host drives clock ticks, Cangjie alone owns actions and verdicts. */
export class CoreExperiment {
  private timer: NodeJS.Timeout | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private result: Transition | undefined;
  private error: Error | undefined;
  private started = false;
  private readonly waiters: {resolve:(t:Transition)=>void;reject:(e:Error)=>void}[]=[];
  private readonly delivered = new Set<string>();
  constructor(private readonly client:CoreClient,private readonly runId:string,private readonly onTransition:(t:Transition)=>void=()=>{}) {}

  start(payload:RunStart):Promise<Transition> {
    if(this.started)return Promise.reject(new Error('Experiment already started'));
    this.started=true;return this.enqueue('start',payload as unknown as Record<string,unknown>);
  }
  observe(observation:Observation):Promise<Transition> {return this.enqueue('observation',{observation});}
  cancel():Promise<Transition> {return this.enqueue('cancel',{});}
  waitForTerminal():Promise<Transition> {
    if(this.error)return Promise.reject(this.error);
    if(this.result && this.result.state!=='running')return Promise.resolve(structuredClone(this.result));
    return new Promise((resolve,reject)=>this.waiters.push({resolve,reject}));
  }
  private enqueue(kind:string,payload:Record<string,unknown>):Promise<Transition> {
    const work=this.queue.then(()=>this.send(kind,payload));
    this.queue=work.catch(()=>{});return work;
  }
  private async send(kind:string,payload:Record<string,unknown>):Promise<Transition> {
    if(this.error)throw this.error;
    let rejected=false;
    try {
      const events=await this.client.send({schemaVersion:1,messageId:randomUUID(),runId:this.runId,kind,payload});
      const event=events.at(-1)!;
      if(event.payload.status==='error'){rejected=true;throw new Error(event.payload.code??'Core rejected command');}
      clearTimeout(this.timer);
      const t=event.payload.data as Transition;
      this.result=t;
      const fresh={...t,actions:t.actions.filter(a=>!this.delivered.has(a.actionId))};
      for(const a of fresh.actions)this.delivered.add(a.actionId);
      if(t.code!=='WAITING')this.onTransition(structuredClone(fresh));
      if(t.state==='running') {
        const delay=t.actions[0]?.deadline??5;
        this.timer=setTimeout(()=>{void this.enqueue('start',{operation:'tick'}).catch(()=>{});},delay+2);
      } else {for(const w of this.waiters.splice(0))w.resolve(structuredClone(t));}
      return structuredClone(fresh);
    } catch(e) {
      if(rejected)throw e;
      this.error=e instanceof Error?e:new Error(String(e));
      for(const w of this.waiters.splice(0))w.reject(this.error);
      throw this.error;
    }
  }
}
