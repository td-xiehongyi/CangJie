// Explicit Linux-only test double. Never imported by production or native acceptance.
import {mock} from 'node:test';
if(process.platform!=='win32'){
 const held=new Set();
 mock.module(new URL('../../apps/host/dist/model/task-lock.js',import.meta.url).href,{namedExports:{async acquireTask(id){
  if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('CANDIDATE_LOCK_UNAVAILABLE');
  if(held.has(id))throw new Error('CANDIDATE_BUSY');
  held.add(id);return async()=>{held.delete(id)};
 }}});
}
