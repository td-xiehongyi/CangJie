import {mkdir,copyFile,realpath,lstat,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {within,digest,sourceFiles,inspectProject,type ProjectProfile} from './inspect.js';
import {TestEnvironment,type TestConfig} from './reset.js';
import type {CredentialSession} from '../execution/session.js';

export {type TestConfig} from './reset.js';
export async function prepareCopy(profile:ProjectProfile,config:TestConfig):Promise<TestEnvironment>{
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(config.projectId)||!Array.isArray(config.accounts)||config.accounts.length!==2||config.accounts.some(a=>a.role!=='user'||![a.actorRef,a.username,a.userId].every(v=>typeof v==='string'&&v.length>0&&v.length<=128)))throw new Error('TEST_ACCOUNT_CONFIG_GAP');
  // Persist only declared public parameters; caller-owned objects cannot change a live target.
  config={projectId:config.projectId,port:config.port,confirmed:config.confirmed,data:Object.freeze({source:config.data.source,count:config.data.count,seedVersion:config.data.seedVersion}),accounts:config.accounts.map(a=>Object.freeze({actorRef:a.actorRef,username:a.username,userId:a.userId,role:a.role})),credentials:config.credentials};Object.freeze(config.accounts);Object.freeze(config);
  const toolRoot=fileURLToPath(new URL('../../../../',import.meta.url)),base=resolve(toolRoot,'.local-data/projects');
  await mkdir(base,{recursive:true});within(toolRoot,await realpath(base));
  const id=randomUUID(),directory=within(base,id),copyRoot=resolve(directory,'source'),dataRoot=resolve(directory,'data'),evidenceRoot=resolve(directory,'evidence');
  if(digest(await sourceFiles(profile.root))!==profile.sourceHash)throw new Error('PROFILE_CHANGED');
  await Promise.all([mkdir(copyRoot,{recursive:true}),mkdir(dataRoot,{recursive:true}),mkdir(evidenceRoot,{recursive:true})]);
  for(const f of profile.files){const src=within(profile.root,f.path),dest=within(copyRoot,f.path);if((await lstat(src)).isSymbolicLink())throw new Error('PATH_ESCAPE');within(profile.root,await realpath(src));await mkdir(dirname(dest),{recursive:true});await copyFile(src,dest);}
  if(digest(await sourceFiles(copyRoot))!==profile.sourceHash)throw new Error('COPY_CHANGED');
  const env=new TestEnvironment(id,profile,config,copyRoot,dataRoot,evidenceRoot);
  await writeFile(resolve(directory,'project.json'),JSON.stringify(config.credentials.redact({schemaVersion:1,projectId:config.projectId,copyId:id,sourceRoot:profile.root,sourceHash:profile.sourceHash,port:config.port,accounts:config.accounts.map(({actorRef,username,userId,role})=>({actorRef,username,userId,role})),data:config.data,initialization:profile.initialization?{version:profile.initialization.version,argv:profile.initialization.argv}:null,gaps:profile.gaps}),null,2));
  if(profile.gapMarkdown)await writeFile(resolve(directory,'initialization-gap.md'),profile.gapMarkdown);
  return env;
}

/** Reopen local evidence only; never resurrect tokens/passwords or dispatch automatically. */
export async function restoreCopy(id:string,credentials:CredentialSession):Promise<TestEnvironment>{
  if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('INVALID_COPY_ID');
  const toolRoot=fileURLToPath(new URL('../../../../',import.meta.url)),directory=within(resolve(toolRoot,'.local-data/projects'),id);
  if((await lstat(directory)).isSymbolicLink())throw new Error('PATH_ESCAPE');within(toolRoot,await realpath(directory));
  const metadata=JSON.parse(await readFile(resolve(directory,'project.json'),'utf8'));
  if(metadata.schemaVersion!==1||metadata.copyId!==id||typeof metadata.sourceRoot!=='string')throw new Error('INVALID_COPY_RECORD');
  const profile=await inspectProject(metadata.sourceRoot);if(profile.sourceHash!==metadata.sourceHash)throw new Error('PROFILE_CHANGED_RECONNECT_REQUIRED');
  for(const name of ['source','data','evidence'])if((await lstat(resolve(directory,name))).isSymbolicLink())throw new Error('PATH_ESCAPE');
  const env=new TestEnvironment(id,profile,{projectId:metadata.projectId,port:metadata.port,confirmed:true,data:metadata.data,accounts:metadata.accounts,credentials},resolve(directory,'source'),resolve(directory,'data'),resolve(directory,'evidence'));
  await env.restoreAttempts();return env;
}

/** A new whole-flow run first proves that an interrupted copy has no live owners.
 * This reads the frozen copy, so a changed original can still be reconnected. */
export async function isolateCopyForReplay(id:string,projectId:string,credentials:CredentialSession):Promise<void>{
  if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('INVALID_COPY_ID');
  const toolRoot=fileURLToPath(new URL('../../../../',import.meta.url)),directory=within(resolve(toolRoot,'.local-data/projects'),id);
  if((await lstat(directory)).isSymbolicLink())throw new Error('PATH_ESCAPE');within(toolRoot,await realpath(directory));
  const metadata=JSON.parse(await readFile(resolve(directory,'project.json'),'utf8'));
  if(metadata.schemaVersion!==1||metadata.copyId!==id||metadata.projectId!==projectId)throw new Error('INVALID_COPY_RECORD');
  for(const name of ['source','data','evidence']){const path=resolve(directory,name);if((await lstat(path)).isSymbolicLink())throw new Error('PATH_ESCAPE');within(directory,await realpath(path));}
  const profile=await inspectProject(resolve(directory,'source'));if(profile.sourceHash!==metadata.sourceHash)throw new Error('COPY_CHANGED');
  const old=new TestEnvironment(id,profile,{projectId,port:metadata.port,confirmed:true,data:metadata.data,accounts:metadata.accounts,credentials},resolve(directory,'source'),resolve(directory,'data'),resolve(directory,'evidence'));
  await old.verifyIsolated();
}

/** Changed code/data/environment uses a newly inspected copy, with an explicit link.
 * No initialization or HTTP request occurs until the caller confirms resume again.
 */
export async function reconnectCopy(id:string,config:TestConfig,confirmation:{confirmed:boolean;reconfirmedChanges:boolean}):Promise<TestEnvironment>{
  if(!confirmation.confirmed||!confirmation.reconfirmedChanges)throw new Error('CONDITIONS_CHANGED');
  if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('INVALID_COPY_ID');
  const toolRoot=fileURLToPath(new URL('../../../../',import.meta.url)),directory=within(resolve(toolRoot,'.local-data/projects'),id);
  within(toolRoot,await realpath(directory));if((await lstat(directory)).isSymbolicLink())throw new Error('PATH_ESCAPE');
  const metadata=JSON.parse(await readFile(resolve(directory,'project.json'),'utf8'));
  if(metadata.schemaVersion!==1||metadata.copyId!==id||config.projectId!==metadata.projectId)throw new Error('INVALID_COPY_RECORD');
  for(const name of ['source','data','evidence']){const path=resolve(directory,name);if((await lstat(path)).isSymbolicLink())throw new Error('PATH_ESCAPE');within(directory,await realpath(path));}
  const snapshot=await inspectProject(resolve(directory,'source'));if(snapshot.sourceHash!==metadata.sourceHash)throw new Error('COPY_CHANGED');
  const previous=new TestEnvironment(id,snapshot,{projectId:metadata.projectId,port:metadata.port,confirmed:true,data:metadata.data,accounts:metadata.accounts,credentials:config.credentials},resolve(directory,'source'),resolve(directory,'data'),resolve(directory,'evidence'));
  await previous.restoreAttempts();
  const fresh=await prepareCopy(await inspectProject(metadata.sourceRoot),config);await fresh.linkInterruptedAttempt(previous);return fresh;
}
