import {mkdir,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {inspectProject,readSourceFile} from './inspect.js';

export async function inspectSupport(directory:string){
 const profile=await inspectProject(directory);
 const hasPackage=profile.files.some(f=>f.path==='package.json');
 const outside=profile.gaps.some(g=>g.code==='UNSAFE_INITIALIZATION_TARGET'||g.code==='DEPENDENCY_GAP'&&hasPackage);
 return {status:profile.supported?'compatible':outside?'unsupported':'needs_configuration',sourceHash:profile.sourceHash,checkedAt:new Date().toISOString(),gaps:profile.gaps,gapMarkdown:profile.gapMarkdown};
}

export async function createPracticeExample(projectRoot:string){
 const profile=await inspectProject(join(projectRoot,'samples/ticket'));
 if(!profile.supported)throw new Error('EXAMPLE_UNAVAILABLE');
 const name='工单示例（练习副本）',target=join(projectRoot,'practice-projects',randomUUID(),name);
 for(const file of profile.files){
  const destination=join(target,file.path);await mkdir(dirname(destination),{recursive:true});
  await writeFile(destination,await readSourceFile(profile.root,file.path));
 }
 await writeFile(join(target,'verification.json'),JSON.stringify({...profile.manifest,name},null,2));
 return {kind:'practice',name,directory:target};
}
