import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,unlink,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import '../support/project-rules.mjs';
import {setupDiscovery,action,read,overview} from '../support/discovery.mjs';

const edits={
 addition:x=>writeFile(join(x.root,'src/added.ts'),'export const newlyAdded = true;\n'),
 deletion:x=>unlink(join(x.root,'src/storage.ts')),
 rename:x=>rename(join(x.root,'src/storage.ts'),join(x.root,'src/storage-renamed.ts')),
 modification:x=>writeFile(join(x.root,'src/storage.ts'),'export const changed = true;\n'),
};
for(const [name,edit] of Object.entries(edits))test(`live ${name} stops further model calls and persists stale without prior reads`,async t=>{
 let x;x=await setupDiscovery(t,async(p,n)=>{if(n===1){await edit(x);return action([read('src/orders.ts',1,9)]);}return overview(p.files);});
 const initial=await x.create(),done=await x.service.runDiscovery(initial.id,initial.revision);
 assert.equal(x.requests.length,1);assert.equal(done.status,'stale');assert.equal(done.referencesValid,false);
 const saved=(await x.store.get(initial.id)).session;assert.equal(saved.status,'stale');assert.equal(saved.referencesValid,false);
 assert.equal(saved.budget.calls,1);await assert.rejects(x.service.assertResumable(initial.id,saved.revision),/STALE_SOURCE/);
});
test('new source while final result is in flight cannot be saved as completed',async t=>{
 let x;x=await setupDiscovery(t,async(p,n)=>{if(n===1)return action([read('src/orders.ts',1,9)]);await edits.addition(x);return overview(p.files);});
 const initial=await x.create(),done=await x.service.runDiscovery(initial.id,initial.revision);
 assert.equal(x.requests.length,2);assert.equal(done.status,'stale');assert.equal(done.referencesValid,false);
 assert.equal((await x.store.get(initial.id)).session.status,'stale');assert.equal(done.result,undefined);
 assert.equal(done.reads.length,1);assert.equal(done.budget.calls,2);
});
test('new source outside the explicitly selected scope does not invalidate analysis',async t=>{
 let x;x=await setupDiscovery(t,async(p,n)=>{if(n===1){await mkdir(join(x.root,'unselected'));await writeFile(join(x.root,'unselected/new.ts'),'export const extra = true;');return action([read('src/orders.ts',1,9)]);}return overview(p.files);});
 const initial=await x.create(),done=await x.service.runDiscovery(initial.id,initial.revision);
 assert.equal(done.status,'completed');assert.equal(x.requests.length,2);
});
