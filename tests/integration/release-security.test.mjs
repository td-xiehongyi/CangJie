import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,access,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildPackage,buildDeveloperResources,verifyPackage,installDeveloperResources} from '../../scripts/package.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
async function temp(){await mkdir('output/delivery',{recursive:true});return mkdtemp(join(process.cwd(),'output/delivery/security-'));}

test('ordinary delivery excludes compiled candidate examples',async()=>{
  const manifest=await verifyPackage(await buildPackage());
  assert.ok(manifest.files.every(f=>!f.path.includes('/fixtures/')));
});
test('resource builder rejects a lock path before any escaping write',async()=>{
  const base=await temp(),source=join(base,'workspace');await mkdir(join(source,'scripts'),{recursive:true});await mkdir(join(source,'tests/reference'),{recursive:true});
  await copyFile('scripts/package.mjs',join(source,'scripts/package.mjs'));
  await writeFile(join(base,'escape.txt'),'retain this source');
  await writeFile(join(source,'tests/reference/suite-lock.json'),JSON.stringify({'../escape.txt':hash('retain this source')}));
  const builder=await import(pathToFileURL(join(source,'scripts/package.mjs')).href);
  await assert.rejects(builder.buildDeveloperResources(),/INVALID_RESOURCE_FILES/);
  await assert.rejects(access(join(source,'output/delivery/escape.txt')));
  assert.equal(await readFile(join(base,'escape.txt'),'utf8'),'retain this source');
});
test('root junction and installation ancestor junction are rejected',async()=>{
  const base=await temp(),resources=await buildDeveloperResources();
  await symlink(resources,join(base,'resource-link'),'junction');
  await assert.rejects(verifyPackage(join(base,'resource-link')),/SYMLINK_REJECTED/);
  await mkdir(join(base,'actual/child'),{recursive:true});await symlink(join(base,'actual'),join(base,'link'),'junction');
  await assert.rejects(installDeveloperResources(resources,join(base,'link/child')),/SYMLINK_REJECTED/);
  await assert.rejects(access(join(base,'actual/child/tests')));
});
test('parent cleanup removes only the failed acceptance credential and verifies deletion',async()=>{
  const {cleanupFixtureCredential}=await import('../support/release-cleanup.mjs');
  const {ModelCredentials}=await import('../../apps/host/dist/model/credentials.js');
  const base=await temp(),keys=new ModelCredentials();let ref;
  try{
    ref=await keys.set('https://example.test','T9-failed-acceptance-synthetic',{remember:true});
    const config=join(base,'state.json');await writeFile(config,JSON.stringify({config:{credentialRef:ref,serviceUrl:'https://example.test'}}));
    assert.equal(await cleanupFixtureCredential(config),true);
    const next=new ModelCredentials();try{await assert.rejects(next.get(ref,'https://example.test'),/MODEL_KEY_REQUIRED/);}finally{next.close();}
  }finally{if(ref)await keys.clear(ref);keys.close();}
});
