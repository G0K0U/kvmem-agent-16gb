import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateKvmemRows} from '../lib/index.js';
const rows = values => Object.entries({'-c':65536,'--kvmem-budget':32768,'--kvmem-gen-reserve':8192,'--spec-draft-n-max':2,'-ngl':999,...values}).map(([flag,value])=>({flag,value:String(value)}));
test('working 64K configuration preserves GPU loading and generation headroom',()=>assert.deepEqual(validateKvmemRows(rows({})),{context:65536,budget:32768,reserve:8192,mtp:2}));
test('invalid parameters are rejected before restarting the model',()=>{
 for(const change of [{'-c':0},{'--kvmem-budget':65536},{'--spec-draft-n-max':0},{'-ngl':32},{'--kvmem-gen-reserve':999999}])assert.throws(()=>validateKvmemRows(rows(change)));
});
