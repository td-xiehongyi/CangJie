import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {join,resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const hash=text=>createHash('sha256').update(text).digest('hex');
const registryRelative='.local-data/t7-frozen-registry';
const archivePath=join(projectRoot,'tests/fixtures/t7-frozen-evidence.json');
const allowed=/^\.local-data\/(?:t7-frozen-registry\/published\/[A-Za-z0-9_-]+@[0-9]+\.[0-9]+\.[0-9]+\.json|validation\/[a-f0-9-]{36}(?:-record)?\.json|projects\/[a-f0-9-]{36}\/evidence\/(?:[a-f0-9]{64}\.json|events\.jsonl))$/;

// Development-only archive: preserve original bytes and version identities.
// No model, registry publication API, test database or credentials are copied.
export async function archiveFixture(){
  const freeze=JSON.parse(await readFile(join(projectRoot,'docs/evidence/t7-freeze.json'),'utf8'));
  const sources=new Map();
  for(const p of freeze.publications){
    const name=`${p.ref.id}@${p.ref.version}.json`;
    sources.set(`${registryRelative}/published/${name}`,join(freeze.directory,'registry/published',name));
    sources.set(`.local-data/validation/${p.validation.recordRef.slice('validation:'.length)}-record.json`,null);
    sources.set(`.local-data/projects/${p.trial.copyId}/evidence/events.jsonl`,null);
    for(const ref of [...p.validation.evidenceRefs,...p.trial.evidenceRefs]){
      const [kind,id,file]=ref.split(':');
      if(kind==='observation')sources.set(`.local-data/validation/${id}.json`,null);
      else if(kind==='reference'||kind==='target')sources.set(`.local-data/projects/${id}/evidence/${file}`,null);
      else throw new Error('INVALID_FIXTURE_REFERENCE');
    }
  }
  const files=[];
  for(const [path,source]of sources){if(!allowed.test(path))throw new Error('INVALID_FIXTURE_PATH');const content=await readFile(source??join(projectRoot,path),'utf8');files.push({path,content,hash:hash(content)});}
  const fixture={schemaVersion:1,frozenAt:freeze.frozenAt,scope:freeze.scope,files};
  await writeFile(archivePath,JSON.stringify(fixture,null,2)+'\n',{flag:'wx'});
  return {files:files.length,archivePath};
}

async function safeParents(root,path){
  const rel=relative(root,dirname(path));let current=root;
  for(const part of ['',...rel.split(/[\\/]/).filter(Boolean)]){
    if(part)current=join(current,part);
    try{const stat=await lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('FIXTURE_UNSAFE_PARENT');}
    catch(e){if(e.code!=='ENOENT')throw e;}
  }
}
export async function restoreFixture(destination=projectRoot,input){
  const fixture=input??JSON.parse(await readFile(archivePath,'utf8')),root=resolve(destination);
  if(fixture.schemaVersion!==1||!Array.isArray(fixture.files)||fixture.files.length===0)throw new Error('INVALID_FIXTURE');
  const seen=new Set(),missing=[];
  // Preflight every path, checksum and existing byte sequence before writing.
  for(const f of fixture.files){
    if(typeof f.path!=='string'||!allowed.test(f.path)||seen.has(f.path))throw new Error('INVALID_FIXTURE_PATH');seen.add(f.path);
    if(typeof f.content!=='string'||hash(f.content)!==f.hash)throw new Error('FIXTURE_HASH_MISMATCH');
    const path=join(root,f.path);await safeParents(root,path);
    try{const stat=await lstat(path);if(stat.isSymbolicLink()||!stat.isFile()||await readFile(path,'utf8')!==f.content)throw new Error('FIXTURE_CONFLICT');}
    catch(e){if(e.code!=='ENOENT')throw e;missing.push({path,content:f.content});}
  }
  for(const f of missing){await safeParents(root,f.path);await mkdir(dirname(f.path),{recursive:true});try{await writeFile(f.path,f.content,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;const stat=await lstat(f.path);if(!stat.isFile()||stat.isSymbolicLink()||await readFile(f.path,'utf8')!==f.content)throw new Error('FIXTURE_CONFLICT');}}
  return {registry:join(root,registryRelative),publications:fixture.files.filter(f=>f.path.startsWith(registryRelative+'/published/')).length,restored:missing.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==='archive')console.log(JSON.stringify(await archiveFixture()));
  else if(process.argv[2]==='restore')console.log(JSON.stringify(await restoreFixture()));
  else throw new Error('Use archive once, or restore without republishing');
}
