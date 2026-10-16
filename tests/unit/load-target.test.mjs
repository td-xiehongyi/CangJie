import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTarget,LOAD_PRESET} from '../../apps/host/dist/load/runner.js';
const target={...LOAD_PRESET,confirmed:true,rate:4,durationSeconds:8,latencyMs:3000,errorRate:0,ratios:{a:33.33,b:33.33,c:33.34}};
test('three-way fractional proportions produced by the form are valid',()=>assert.doesNotThrow(()=>validateTarget(target,['a','b','c'])));
test('invalid load rates, proportions and thresholds are rejected before dispatch',()=>{
 for(const rate of [0,.5,101,Infinity])assert.throws(()=>validateTarget({...target,rate,ratios:{a:100}},['a']));
 for(const ratios of [{a:0,b:100},{a:50,b:49.99},{a:101,b:-1},{a:NaN,b:100},{a:50,b:50,c:1}])assert.throws(()=>validateTarget({...target,ratios},['a','b']));
 assert.throws(()=>validateTarget({...target,latencyMs:.5,ratios:{a:100}},['a']));
});
