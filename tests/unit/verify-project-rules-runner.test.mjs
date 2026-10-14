import test,{mock} from 'node:test';import assert from 'node:assert/strict';
test('S3 rule and capability suites run in both discovery and all dispatch',async()=>{
  const calls=[];mock.module('node:child_process',{namedExports:{spawnSync(executable,args,options){calls.push({executable,args,options});return {status:0}}}});
  const argv=process.argv;try{for(const group of ['discovery','all']){calls.length=0;process.argv=[process.execPath,'scripts/verify.mjs',group];await import(`../../scripts/verify.mjs?s3-runner=${group}`);const tests=calls.find(c=>c.args.includes('--test'));assert.ok(tests);for(const file of ['tests/integration/project-rules.test.mjs','tests/integration/project-rules-api.test.mjs','tests/integration/rule-readiness.test.mjs'])assert.ok(tests.args.includes(file),group+': '+file)}}finally{process.argv=argv}
});
