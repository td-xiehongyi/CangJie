import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildSourceSnapshot} from '../../apps/host/dist/discovery/index.js';
import {createAnalysisScope,validateSourceRefs} from '../../apps/host/dist/discovery/access.js';
import {prepareFullFileInput} from '../../apps/host/dist/discovery/full-input.js';
async function fixture(t,text='export const message="hello";\r\n'){
 const root=await mkdtemp(join(tmpdir(),'full-source-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'app.ts'),text);
 const snapshot=await buildSourceSnapshot(root,'p');
 const scope=createAnalysisScope(snapshot,{allowedPaths:['.'],excludedPaths:[],includeProjectTests:false,serviceUrl:'https://example.com/v1'});
 return {root,snapshot,scope,config:{model:'synthetic',serviceUrl:'https://example.com/v1'}};
}
test('all allowed files retain complete original text and verifiable references',async t=>{
 const f=await fixture(t);const p=await prepareFullFileInput(f.snapshot,f.scope,f.config,{mode:'automatic',prompt:''});
 assert.equal(p.reads.length,1);assert.equal(p.reads[0].text,'export const message="hello";\r\n');assert.equal(p.reads[0].kind,'full-file');
 assert.equal((await validateSourceRefs(f.snapshot,p.reads,p.reads.map(r=>r.ref))).valid,true);
});
test('prompt and model are bound to sending preview',async t=>{
 const f=await fixture(t);const p=await prepareFullFileInput(f.snapshot,f.scope,f.config,{mode:'prompt',prompt:'识别提交业务'});
 const q=await prepareFullFileInput(f.snapshot,f.scope,{...f.config,model:'other'},{mode:'prompt',prompt:'识别提交业务'});
 const r=await prepareFullFileInput(f.snapshot,f.scope,f.config,{mode:'prompt',prompt:'识别修改业务'});
 assert.notEqual(p.manifestHash,q.manifestHash);assert.notEqual(p.manifestHash,r.manifestHash);
 await assert.rejects(()=>prepareFullFileInput(f.snapshot,f.scope,f.config,{mode:'prompt',prompt:''}),/INVALID_ANALYSIS_INPUT/);
});
test('oversized complete files block without truncation',async t=>{
 const f=await fixture(t,'a'.repeat(70000));await assert.rejects(()=>prepareFullFileInput(f.snapshot,f.scope,f.config,{mode:'automatic',prompt:''}),/FULL_INPUT_TOO_LARGE/);
});
test('changed files invalidate the preview and no model request occurs',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'app.ts'),'changed');
 await assert.rejects(()=>prepareFullFileInput(f.snapshot,f.scope,f.config,{mode:'automatic',prompt:''}),/STALE_SOURCE/);
});
test('common non-JavaScript text files are included completely without claiming parsed routes',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'server.py'),'def cancel_order():\n    return True\n');
 const snapshot=await buildSourceSnapshot(f.root,'p'),scope=createAnalysisScope(snapshot,{allowedPaths:['.'],excludedPaths:[],includeProjectTests:false,serviceUrl:f.config.serviceUrl});
 const packed=await prepareFullFileInput(snapshot,scope,f.config,{mode:'automatic',prompt:''});
 assert.equal(packed.reads.length,2);assert.equal(packed.reads.find(r=>r.ref.path==='server.py').text,'def cancel_order():\n    return True\n');
 assert.deepEqual(snapshot.files.find(f=>f.path==='server.py').routes,[]);
});
