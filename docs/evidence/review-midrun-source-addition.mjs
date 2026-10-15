import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import '../../tests/support/project-rules.mjs';
import {setupDiscovery,action,read,overview} from '../../tests/support/discovery.mjs';
test('review: new in-scope source during model response is not checked before next request',async t=>{
 let x;
 x=await setupDiscovery(t,async(payload,n)=>{
  if(n===1){await writeFile(join(x.root,'src/new-business.ts'),'export const changedBusiness = true;\n');return action([read('src/orders.ts',1,9)]);}
  return overview(payload.files);
 });
 const initial=await x.create();const result=await x.service.runDiscovery(initial.id,initial.revision);
 const saved=(await x.store.get(initial.id)).session;const view=await x.service.getDiscovery(initial.id);
 console.log(JSON.stringify({requests:x.requests.length,returned:result.status,persisted:saved.status,publicView:view.status,publicReferencesValid:view.referencesValid}));
 assert.equal(x.requests.length,2);assert.equal(result.status,'completed');assert.equal(saved.status,'completed');assert.equal(view.status,'stale');assert.equal(view.referencesValid,false);
});
