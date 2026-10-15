import test from 'node:test';
import assert from 'node:assert/strict';
import {preparationProgress} from '../../apps/ui/src/planPreparation.ts';

test('reuse reports existing evidence and does not invent a fresh trial',()=>{
 const rows=preparationProgress(2,2);
 assert.match(rows[0].value,/2/);assert.match(rows[2].value,/已有/);assert.match(rows[3].value,/未重新/);
});
test('incomplete and failed trials cannot be displayed as business success',()=>{
 const candidate={spec:{},status:'paused',phase:'awaiting_trial',validation:{gateResults:{admitted:true}}};
 assert.match(preparationProgress(1,0,candidate)[3].value,/等待/);
 assert.match(preparationProgress(1,0,{...candidate,trial:{completed:true,verdicts:[{status:'fail'}]}})[3].value,/业务问题/);
 assert.match(preparationProgress(1,0,{...candidate,trial:{completed:true,verdicts:[]}})[3].value,/证据不足/);
 assert.match(preparationProgress(1,0,{...candidate,trial:{completed:false,verdicts:[{status:'pass'}]}})[3].value,/等待/);
});
