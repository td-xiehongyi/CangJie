import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateContract} from '../../packages/contracts/dist/validate.js';
for(const name of ['save-result','duplicate-submit','permission-isolation'])test(`schema accepts ${name} and rejects executable additions`,()=>{const s=JSON.parse(readFileSync(new URL(`../../packages/contracts/fixtures/${name}.json`,import.meta.url)));assert.equal(validateContract('TemplateSpec',s).valid,true);s.steps[0].code='eval()';assert.equal(validateContract('TemplateSpec',s).valid,false);});
test('exists only tests field presence',()=>{const s=JSON.parse(readFileSync(new URL('../../packages/contracts/fixtures/save-result.json',import.meta.url)));s.assertions[0].expr={op:'exists',arg:{op:'eq',args:[{op:'const',value:1},{op:'const',value:1}]}};assert.equal(validateContract('TemplateSpec',s).valid,false);});
test('schema rejects malformed observations, unknown capabilities and rules',()=>{
 const obs={actionId:'a',intentId:'i',attemptId:'t',transportStatus:'timeout',identityVerified:'bad',acceptance:'accepted',result:{},queryComplete:null,evidenceRefs:['e']};assert.equal(validateContract('Observation',obs).valid,false);
 assert.equal(validateContract('CapabilitySet',{operations:['query'],actorRefs:['owner'],expressions:['eval']}).valid,false);
 assert.equal(validateContract('RuleContract',{id:'rule',version:1,confirmation:'confirmed',source:'user',preconditions:[1],expectedChanges:[],invariants:[],completionDeadline:400000}).valid,false);
});
