import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import type {ReviewRecord,ValidationRecord} from '@website-verification/contracts';
import {CoreClient} from '../core/client.js';
import {command} from './observations.js';
import {digest} from '../projects/inspect.js';

export const projectRoot=fileURLToPath(new URL('../../../../',import.meta.url));
export async function registryCore(payload:Record<string,unknown>):Promise<any>{
  const {coreCommand}=await import(pathToFileURL(join(projectRoot,'scripts/toolchain.mjs')).href);
  const core=new CoreClient({...coreCommand(),timeoutMs:5000});
  try{return await command(core,randomUUID(),'start',payload);}finally{await core.close();}
}
export function checkReview(review:ReviewRecord,scope:string,validationRef:string):void{
  if(!review||review.decision!=='approve'||review.scope!==scope||review.validationRef!==validationRef||
    ![review.businessConfirmation,review.technicalReviewer,review.time].every(v=>typeof v==='string'&&v.trim().length>0)||
    !Number.isFinite(Date.parse(review.time)))throw new Error('REVIEW_REQUIRED_OR_STALE');
}
function recordPath(ref:string):string{
  const m=/^validation:([a-f0-9-]{36})$/.exec(ref);if(!m)throw new Error('INVALID_VALIDATION_REF');
  return join(projectRoot,'.local-data/validation',m[1]+'-record.json');
}
function evidencePath(ref:string):string{
  const http=/^(reference|target):([a-f0-9-]{36}):([a-f0-9]{64}\.json)$/.exec(ref);
  if(http)return join(projectRoot,'.local-data/projects',http[2]!,'evidence',http[3]!);
  const observation=/^observation:([a-f0-9-]{36}):[A-Za-z0-9_-]+$/.exec(ref);
  if(observation)return join(projectRoot,'.local-data/validation',observation[1]+'.json');
  throw new Error('INVALID_EVIDENCE_REF');
}
async function evidenceText(path:string):Promise<string>{
  try{return await readFile(path,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new Error('EVIDENCE_MISSING');throw e;}
}
function evidenceJson(text:string):any{try{return JSON.parse(text);}catch{throw new Error('EVIDENCE_CORRUPT');}}
/** Re-read host-produced records, never trust submitted gate booleans alone.
 * Digests detect stale/corrupt local records; they are not a signature against
 * an attacker who can rewrite the entire local workspace. */
export async function evidenceSeal(record:ValidationRecord,trial:ValidationRecord):Promise<string>{
  const stored=evidenceJson(await evidenceText(recordPath(record.recordRef??'')));
  if(digest(stored)!==digest(record))throw new Error('STALE_VALIDATION_RECORD');
  if(!trial.copyId||!/^[a-f0-9-]{36}$/.test(trial.copyId))throw new Error('INVALID_TRIAL');
  const events=(await evidenceText(join(projectRoot,'.local-data/projects',trial.copyId,'evidence/events.jsonl'))).trim().split(/\r?\n/).map(evidenceJson);
  if(!events.some(e=>e.data?.kind==='candidate_trial_result'&&digest(e.data.record)===digest(trial)))throw new Error('STALE_TRIAL_RECORD');
  if(!record.evidenceRefs.length||!trial.evidenceRefs.length)throw new Error('MISSING_EVIDENCE');
  const hashes:Record<string,string>={};
  for(const ref of [...record.evidenceRefs,...trial.evidenceRefs].sort())hashes[ref]=digest(await evidenceText(evidencePath(ref)));
  return digest({record,trial,hashes});
}
