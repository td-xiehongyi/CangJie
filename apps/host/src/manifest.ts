import {digest} from './projects/inspect.js';
import {ArtifactStore} from './artifacts/store.js';
import type {RunRecord} from './replay.js';
export interface PackageManifest {schemaVersion:1;interpreterVersion:'1.0.0';kind:'verification'|'observations';sourceRunId:string;projectId:string;files:{path:string;hash:string;content:string}[];hash:string}
export async function exportPackage(store:ArtifactStore,runId:string):Promise<PackageManifest>{
  const run=await store.get(runId);const content=JSON.stringify(run);const body={schemaVersion:1 as const,interpreterVersion:'1.0.0' as const,kind:run.kind,sourceRunId:run.id,projectId:run.projectId,files:[{path:'run.json',hash:digest(content),content}]};return {...body,hash:digest(body)};
}
/** JSON container: no archive extraction and no filesystem paths from a package. */
export function readPackage(input:unknown):{manifest:PackageManifest;run:RunRecord}{
  const p=input as PackageManifest;
  if(!p||p.schemaVersion!==1||p.interpreterVersion!=='1.0.0')throw new Error('VERSION_MISMATCH');
  if(!Array.isArray(p.files)||p.files.some(f=>f.path!=='run.json'))throw new Error('PACKAGE_ESCAPE_REJECTED');
  if(p.files.length!==1||p.files.some(f=>typeof f.content!=='string'||Buffer.byteLength(f.content)>16*1024*1024||digest(f.content)!==f.hash))throw new Error('PACKAGE_TAMPER_REJECTED');
  const {hash,...body}=p;if(hash!==digest(body))throw new Error('PACKAGE_TAMPER_REJECTED');
  let run:RunRecord;try{run=JSON.parse(p.files[0]!.content);}catch{throw new Error('INVALID_PACKAGE_RECORD');}
  if(run.schemaVersion!==1||run.id!==p.sourceRunId||run.projectId!==p.projectId||run.kind!==p.kind||!Array.isArray(run.checks)||!Array.isArray(run.events)||!run.evidence)throw new Error('INVALID_PACKAGE_RECORD');
  return {manifest:structuredClone(p),run};
}
