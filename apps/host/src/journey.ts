import {containsSecret} from './discovery/index.js';
import type {Express} from 'express';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {replaceFile} from './artifacts/replace.js';
export interface JourneyPreferences {revision:number;skipAnalysis?:boolean;analysisMode?:'automatic'|'prompt';analysisPrompt?:string;lastStep?:number;businessNotes?:string;goal:'correctness'|'load'|'both';rate:string;durationSeconds:string;repairEnabled:boolean;repairRunId?:string}
export const emptyJourney=():JourneyPreferences=>({revision:0,goal:'correctness',rate:'',durationSeconds:'',repairEnabled:false});
export function mountJourneyRoutes(app:Express,directory:string,exists:(id:string)=>Promise<void>){
 const root=join(directory,'journey');const queue=new Map<string,Promise<unknown>>();
 function path(id:string){if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('INVALID_ID');return join(root,id+'.json');}
 async function read(id:string):Promise<JourneyPreferences>{try{return JSON.parse(await readFile(path(id),'utf8'))}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return emptyJourney();throw e;}}
 app.get('/api/projects/:id/journey',async(req,res)=>{await exists(req.params.id);res.json(await read(req.params.id));});
 app.post('/api/projects/:id/journey',async(req,res)=>{
  const id=req.params.id;await exists(id);path(id);
  const input=req.body;
  if(!input||Object.keys(input).some(k=>!['revision','goal','rate','durationSeconds','repairEnabled','repairRunId','businessNotes','skipAnalysis','analysisMode','analysisPrompt','lastStep','viewOnly'].includes(k))||!Number.isSafeInteger(input.revision)||!['correctness','load','both'].includes(input.goal)||typeof input.repairEnabled!=='boolean'||typeof input.rate!=='string'||typeof input.durationSeconds!=='string'||input.rate.length>20||input.durationSeconds.length>20||input.rate!==''&&(!Number.isFinite(Number(input.rate))||Number(input.rate)<=0)||input.durationSeconds!==''&&(!Number.isInteger(Number(input.durationSeconds))||Number(input.durationSeconds)<1||Number(input.durationSeconds)>300))throw new Error('INVALID_JOURNEY');
  if(input.businessNotes!==undefined&&(typeof input.businessNotes!=='string'||input.businessNotes.length>8000||containsSecret(input.businessNotes)))throw new Error('INVALID_JOURNEY');
  if(input.repairRunId!==undefined&&(typeof input.repairRunId!=='string'||!/^[a-f0-9-]{36}$/.test(input.repairRunId)))throw new Error('INVALID_JOURNEY');
  if(input.skipAnalysis!==undefined&&typeof input.skipAnalysis!=='boolean')throw new Error('INVALID_JOURNEY');
  if(input.analysisMode!==undefined&&!['automatic','prompt'].includes(input.analysisMode)||input.analysisPrompt!==undefined&&(typeof input.analysisPrompt!=='string'||input.analysisPrompt.length>8000||containsSecret(input.analysisPrompt))||input.lastStep!==undefined&&(!Number.isInteger(input.lastStep)||input.lastStep<1||input.lastStep>12))throw new Error('INVALID_JOURNEY');
  if(input.viewOnly!==undefined&&(input.viewOnly!==true||!Number.isInteger(input.lastStep)))throw new Error('INVALID_JOURNEY');
  const prior=queue.get(id)??Promise.resolve();
  const job=prior.catch(()=>{}).then(async()=>{
   const previous=await read(id);if(!input.viewOnly&&previous.revision!==input.revision)throw new Error('JOURNEY_CONFLICT');
   const next:JourneyPreferences=input.viewOnly?{...previous,lastStep:input.lastStep}:{revision:previous.revision+1,...(input.analysisMode?{analysisMode:input.analysisMode}:{}),...(input.analysisPrompt!==undefined?{analysisPrompt:input.analysisPrompt}:{}),...(previous.lastStep?{lastStep:previous.lastStep}:input.lastStep?{lastStep:input.lastStep}:{}),...(input.skipAnalysis!==undefined?{skipAnalysis:input.skipAnalysis}:{}),...(input.businessNotes!==undefined?{businessNotes:input.businessNotes}:{}),goal:input.goal,rate:input.rate,durationSeconds:input.durationSeconds,repairEnabled:input.repairEnabled,...(input.repairRunId?{repairRunId:input.repairRunId}:{})};
   await mkdir(root,{recursive:true});const temporary=join(root,randomUUID()+'.tmp');await writeFile(temporary,JSON.stringify(next));await replaceFile(temporary,path(id));return next;
  });queue.set(id,job);
  try{res.json(await job)}finally{if(queue.get(id)===job)queue.delete(id);}
 });
 return {read};
}
