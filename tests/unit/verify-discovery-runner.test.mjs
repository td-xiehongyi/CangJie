import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
// Exercise the real verification script's dispatch without launching builds.
// This checks runner configuration, not whether any suite passes.
test('full verification includes state regressions and retains its fifteen-minute timeout',async()=>{
  const calls=[];
  mock.module('node:child_process',{namedExports:{spawnSync(executable,args,options){calls.push({executable,args,options});return {status:0}}}});
  const argv=process.argv;process.argv=[process.execPath,'scripts/verify.mjs','all'];
  try{await import('../../scripts/verify.mjs?runner-regression')}finally{process.argv=argv}
  const tests=calls.find(c=>c.args.includes('--test'));assert.ok(tests);
  assert.ok(tests.args.includes('tests/unit/discovery-state-race.test.mjs'));
  assert.ok(tests.args.includes('--experimental-test-module-mocks'));
  assert.equal(tests.options.timeout,900000);
});
