import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildNinferArgv,ninferOutputLimit} from '../lib/index.js';
const slot={engineDir:'D:/NInfer/build/apps',serverExe:'ninfer-serve.exe',alias:'Bonsai2-PQ2-MTP.ninfer'};
const rows=(extra={})=>Object.entries({'--max-context':8192,'--kv-capacity':8192,'--kv-dtype':'bf16','--max-concurrency':1,...extra}).map(([flag,value])=>({flag,value:String(value)}));
test('NInfer output follows its launch setting without a hidden 4096 ceiling',()=>{
 assert.equal(ninferOutputLimit(rows({'--max-context':131072,'--default-max-tokens':131072})),131072);
 assert.equal(ninferOutputLimit(rows({'--default-max-tokens':32768})),8192);
 assert.throws(()=>ninferOutputLimit(rows({'--default-max-tokens':'NaN'})));
 assert.throws(()=>ninferOutputLimit(rows({'--default-max-tokens':0})));
});
test('NInfer uses a positional artifact and the exact HTTP model alias',()=>{
 const argv=buildNinferArgv(slot,'F:/models/Bonsai.ninfer',rows(),18201);
 assert.equal(argv[1],'F:/models/Bonsai.ninfer');
 assert.equal(argv[argv.indexOf('--model-id')+1],slot.alias);
 assert.equal(argv[argv.indexOf('--host')+1],'127.0.0.1');
 assert.ok(!argv.includes('-m'));
});
test('wrong model formats, insufficient KV capacity and foreign engine options are rejected',()=>{
 assert.throws(()=>buildNinferArgv(slot,'model.gguf',rows(),18201));
 assert.throws(()=>buildNinferArgv(slot,'model.ninfer',rows({'--kv-capacity':4096}),18201));
 assert.throws(()=>buildNinferArgv(slot,'model.ninfer',rows({'--kvmem-budget':32768}),18201));
});
