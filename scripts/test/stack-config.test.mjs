import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeStack, modelPresets, catalog } from '../stack-config.mjs'
import { validateKvmemRows, buildNinferArgv } from '../../plugins/dsh-local-llm-controller/lib/index.js'
const opts={modelsDir:'D:/Models',runtimeBin:'D:/KVMem/bin'}
test('existing DSH credentials, unrelated providers, image workflows and permissions survive merge',()=>{
  const old={'llm-pi-ai':{custom:true,providers:{remote:{key:'fixture'}}},permission:{defaultPreset:'read-only'},'image-generation':{provider:'comfyui'},other:{keep:true}}
  const updated=mergeStack(old,opts)
  assert.deepEqual(updated.permission,old.permission)
  assert.deepEqual(updated['llm-pi-ai'].providers.remote,old['llm-pi-ai'].providers.remote)
  assert.deepEqual(updated['image-generation'],old['image-generation'])
  assert.deepEqual(updated.other,old.other)
  assert.equal(old['local-llm'],undefined)
})
test('three GGUF choices produce exact identities and valid bootstrap/daily launch rows',()=>{
  for(const model of ['iq3','qqz','heretic']) for(const profile of ['bootstrap','desktop128']){
    const s=mergeStack({}, {...opts,model,profile,vision:true})
    assert.equal(s['local-llm'].config.slots.a.file,catalog[model].file)
    assert.equal(s['agent-default-model'].model,catalog[model].file)
    for(const rows of Object.values(s['local-llm'].config.slots.a.presets)) validateKvmemRows(rows)
  }
})
test('Bonsai uses a separate engine, no KVMem flags, one lane and no vision',()=>{
  assert.throws(()=>mergeStack({}, {...opts,model:'bonsai'}),/NInfer/)
  const s=mergeStack({}, {...opts,model:'bonsai',vision:true,ninferBin:'D:/NInfer/bin',bonsaiDir:'D:/Bonsai'})
  const local=s['local-llm'], b=local.config.slots.b
  assert.equal(local.mode,'text'); assert.equal(local.slot,'b')
  assert.equal(local.config.slots.a.file,catalog.iq3.file)
  assert.deepEqual(s['llm-pi-ai'].providers['qqz-kvmem'].models[1].input,['text'])
  const argv=buildNinferArgv(b,b.dir+'/'+b.file,b.presets['text:fast'],18200)
  assert.ok(!argv.includes('--kvmem-budget'));assert.ok(!argv.includes('--spec'))
  assert.equal(argv[argv.indexOf('--max-concurrency')+1],'1')
})
test('bootstrap reduces retrieval budget and reserve; daily remains exact desktop configuration',()=>{
  const map=p=>Object.fromEntries(modelPresets('kvmem',p)['vision:fast'].map(r=>[r.flag,r.value]))
  assert.equal(map('bootstrap')['--kvmem-budget'],'8192')
  assert.equal(map('bootstrap')['--kvmem-gen-reserve'],'4096')
  assert.equal(map('desktop128')['--kvmem-budget'],'24576')
  assert.equal(map('desktop128')['--kvmem-gen-reserve'],'16384')
  assert.equal(map('desktop128')['--reasoning-budget'],'1024')
})
