import test,{mock} from 'node:test';import assert from 'node:assert/strict';
test('S4 developer checks are explicit in discovery and all while native core remains prerequisite',async()=>{
  const calls=[];mock.module('node:child_process',{namedExports:{spawnSync(_exec,args){calls.push(args);return {status:0}}}});
  const argv=process.argv;try{for(const group of ['discovery','all']){calls.length=0;process.argv=[process.execPath,'scripts/verify.mjs',group];await import(`../../scripts/verify.mjs?s4=${group}`);const tests=calls.find(a=>a.includes('--test'));for(const file of ['tests/integration/discovered-rule-execution.test.mjs','tests/integration/status-ticket-fixture.test.mjs','tests/integration/status-transition-validation.test.mjs','tests/integration/discovered-rule-api.test.mjs','tests/unit/discovered-rule-ui.test.mjs'])assert.ok(tests.includes(file),file);assert.ok(calls.some(a=>a[0]==='scripts/build-core.mjs'))}}finally{process.argv=argv}
});
