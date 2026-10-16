import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateCandidate,candidateShape} from '../../apps/host/dist/model/proposal.js';

test('generation supplies public execution requirements for each supported business without private answers',async()=>{
 const rules=JSON.parse(await readFile('tests/reference/suite-manifest.json','utf8')).suites.map(s=>s.rule);
 const expected={
  'save-rule':{parameters:['title'],assertionIds:['saved-title'],operations:['create','query']},
  'duplicate-rule':{parameters:['title','intent'],assertionIds:['one-result'],operations:['create','create','query']},
  'permission-rule':{parameters:['title'],assertionIds:['not-visible'],operations:['create','query']},
  'title-update-rule':{parameters:['title','newTitle'],assertionIds:['updated-title','unchanged-priority','unchanged-owner'],operations:['create','query','update','query']}
 };
 for(const rule of rules){
  let request;await generateCandidate({async json(r){request=r;return {value:{}}}},rule,{operations:['create','query','update'],actorRefs:['owner','other'],expressions:['eq']},{context:{}},0);
  const required=request.payload.executionRequirements;
  assert.ok(required,rule.id+' needs explicit public requirements');assert.deepEqual(required.parameters,expected[rule.id].parameters);assert.deepEqual(required.assertionIds,expected[rule.id].assertionIds);assert.deepEqual(required.steps.map(s=>s.operationId),expected[rule.id].operations);
  assert.equal(required.singleCheck,true);if(rule.id==='permission-rule')assert.equal(required.steps[1].actorRef,'other');
  assert.ok(!JSON.stringify(required).includes('\"expr\"'));assert.ok(!JSON.stringify(required).includes('\"bindings\"'));const sent=JSON.stringify(request);for(const text of ['held-owner','c001','save-drop','suite-manifest','"expected"'])assert.ok(!sent.includes(text),text);
 }
});

test('save candidate with incompatible operations or assertion identifiers fails public shape before independent execution',async()=>{
 const rule=JSON.parse(await readFile('tests/reference/suite-manifest.json','utf8')).suites.map(s=>s.rule).find(r=>r.id==='save-rule'),spec=JSON.parse(await readFile('templates/saved-result.json','utf8'));
 assert.equal(candidateShape(spec,rule),true);
 assert.equal(candidateShape({...spec,assertions:spec.assertions.map(a=>({...a,id:'arbitrary-name'}))},rule),false);
 assert.equal(candidateShape({...spec,steps:[...spec.steps,{...spec.steps[1],stepId:'extra',output:'extra'}]},rule),false);
 assert.equal(candidateShape({...spec,parameters:{title:{type:'string'}}},rule),false);
});

test('model format distinguishes operation capabilities from actors and revises category errors',async()=>{
 const rule=JSON.parse(await readFile('tests/reference/suite-manifest.json','utf8')).suites[0].rule,spec=JSON.parse(await readFile('templates/saved-result.json','utf8')),capabilities={operations:['create','query','update'],actorRefs:['owner','other'],expressions:['field','eq']};
 for(const misplaced of ['owner','eq'])await assert.rejects(generateCandidate({async json(){return {value:{...spec,requiredCapabilities:['create','query',misplaced]}}}},rule,capabilities,{context:{}},0),/INVALID_CAPABILITY_DECLARATION/);
 let request;await generateCandidate({async json(value){request=value;return {value:spec}}},rule,capabilities,{context:{}},0);
 assert.deepEqual(request.payload.format.$defs.TemplateSpec.properties.requiredCapabilities.items.enum,capabilities.operations);
});
