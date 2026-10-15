import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {listenLoopback,availableLoopbackPort} from '../../apps/host/dist/execution/ports.js';
const close=s=>new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve()));
test('automatic HTTP ports work even when OS port zero would select a fetch-blocked port',async t=>{
  const server=createServer((_q,r)=>r.end('ready')),listen=server.listen;
  t.mock.method(server,'listen',function(port,...args){return listen.call(this,port===0?6667:port,...args);});
  await listenLoopback(server);t.after(()=>close(server));
  const response=await fetch(`http://127.0.0.1:${server.address().port}`);assert.equal(await response.text(),'ready');
});
test('automatic binds retry address conflicts, explicit ports fail without silently moving',async t=>{
  const server=createServer(),listen=server.listen;let attempts=0;
  t.mock.method(server,'listen',function(...args){if(++attempts===1){queueMicrotask(()=>this.emit('error',Object.assign(new Error('busy'),{code:'EADDRINUSE'})));return this;}return listen.apply(this,args);});
  await listenLoopback(server);t.after(()=>close(server));assert.equal(attempts,2);
  const occupied=createServer();await assert.rejects(listenLoopback(occupied,server.address().port),{code:'EADDRINUSE'});assert.equal(occupied.listening,false);
});
test('automatic binding failures are bounded and available port probes close their socket',async t=>{
  const server=createServer(),initialErrors=server.listenerCount('error'),initialListening=server.listenerCount('listening');let attempts=0;
  t.mock.method(server,'listen',function(){attempts++;queueMicrotask(()=>this.emit('error',Object.assign(new Error('denied'),{code:'EACCES'})));return this;});
  await assert.rejects(listenLoopback(server),{code:'EACCES'});assert.equal(attempts,32);assert.equal(server.listenerCount('error'),initialErrors);assert.equal(server.listenerCount('listening'),initialListening);
  const port=await availableLoopbackPort(),probe=createServer();await listenLoopback(probe,port);await close(probe);
});

test('invalid explicit ports are rejected rather than converted to automatic ports',async()=>{
  for(const port of [NaN,-1,65536]){const server=createServer();try{await assert.rejects(listenLoopback(server,port),{code:'ERR_SOCKET_BAD_PORT'});}finally{if(server.listening)await close(server);}}
});
