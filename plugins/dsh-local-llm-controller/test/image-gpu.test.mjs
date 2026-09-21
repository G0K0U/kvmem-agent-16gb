import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ImageGpuTransaction } from '../lib/image-gpu.js'

function fixture(model = 'QQZ') {
  const events = [], owner = { status: 'running' }, signal = new AbortController()
  const snapshot = { model, mode: model === 'Bonsai' ? 'text' : 'vision', preset: 'long', args: ['131072'] }
  const adapter = {
    streamDrainMs: 50,
    agents: () => [owner],
    preflight: async () => { events.push('preflight') },
    snapshot: async () => structuredClone(snapshot),
    unload: async () => { events.push('unload') },
    startImage: async () => { events.push('image-start') },
    stopImage: async () => { events.push('image-stop') },
    restore: async saved => { assert.deepEqual(saved, snapshot); events.push('restore') },
  }
  return { events, owner, signal, adapter, tx: new ImageGpuTransaction(adapter) }
}
test('finish chunk releases inference before consumer runs the tool',async()=>{
 const f=fixture()
 const stream=f.tx.stream(f.signal.signal,async function*(){yield {type:'finish'}})
 await stream.next();assert.equal(f.tx.streams,0)
 await f.tx.run(f.owner,f.signal.signal,async()=>{})
 await stream.return();assert.equal(f.tx.streams,0)
})
test('tool reserves the lease while the calling stream finalizes',async()=>{
 const f=fixture();f.tx.streams=1
 setTimeout(()=>f.tx.streams--,10)
 await f.tx.run(f.owner,f.signal.signal,async()=>{})
 assert.equal(f.tx.busy,false);assert.equal(f.tx.streams,0)
})
test('prompt enhancement runs inside the lease before unloading chat', async()=>{
 const f=fixture()
 await f.tx.run(f.owner,f.signal.signal,async()=>f.events.push('generate'),async()=>{assert.equal(f.tx.busy,true);f.events.push('rewrite')})
 assert.deepEqual(f.events,['preflight','rewrite','unload','image-start','generate','image-stop','restore'])
})
test('prompt rewrite failure restores any temporary model without starting ComfyUI',async()=>{
 const f=fixture()
 await assert.rejects(f.tx.run(f.owner,f.signal.signal,async()=>{},async()=>{throw Error('rewrite failed')}),/rewrite failed/)
 assert.deepEqual(f.events,['preflight','image-stop','restore'])
})
for (const model of ['IQ3', 'QQZ', 'Bonsai', 'Heretic']) test(`${model}: restore exact saved configuration`, async () => {
  const f = fixture(model)
  const result = await f.tx.run(f.owner, f.signal.signal, async () => { f.events.push('generate'); return 'image' })
  assert.equal(result, 'image')
  assert.deepEqual(f.events, ['preflight','unload','image-start','generate','image-stop','restore'])
})
test('missing weights does not unload chat', async () => {
  const f = fixture(); f.adapter.preflight = async () => { throw Error('missing weights') }
  await assert.rejects(f.tx.run(f.owner, f.signal.signal, () => {}), /missing weights/)
  assert.deepEqual(f.events, []); assert.equal(f.tx.busy, false)
})
for (const stage of ['unload','startImage','generate']) test(`failure during ${stage} restores chat`, async () => {
  const f = fixture(), fail = async () => { throw Error('test failure') }
  if (stage !== 'generate') f.adapter[stage] = fail
  await assert.rejects(f.tx.run(f.owner, f.signal.signal, fail), /test failure/)
  assert.deepEqual(f.events.slice(-2), ['image-stop','restore'])
})
test('cancel during generation still releases image GPU and restores chat', async () => {
  const f = fixture()
  await assert.rejects(f.tx.run(f.owner, f.signal.signal, async () => {
    f.signal.abort(); f.signal.signal.throwIfAborted()
  }), { name: 'AbortError' })
  assert.deepEqual(f.events.slice(-2), ['image-stop','restore'])
})
test('refuse overlapping image requests and other running agents', async () => {
  const f = fixture(); f.tx.busy = true
  await assert.rejects(f.tx.run(f.owner, f.signal.signal, () => {}), /Another image/)
  f.tx.busy = false; f.adapter.agents = () => [f.owner, { status: 'running' }]
  await assert.rejects(f.tx.run(f.owner, f.signal.signal, () => {}), /other DSH tasks/)
  assert.deepEqual(f.events, [])
})
test('failed image shutdown must not reload chat over occupied VRAM', async () => {
  const f = fixture(); f.adapter.stopImage = async () => { throw Error('still alive') }
  await assert.rejects(f.tx.run(f.owner, f.signal.signal, async () => 'image'), /recovery failed/)
  assert.ok(!f.events.includes('restore')); assert.equal(f.tx.busy, false)
})
test('restore failure is surfaced and unlocks transaction', async () => {
  const f = fixture(); f.adapter.restore = async () => { throw Error('reload failed') }
  await assert.rejects(f.tx.run(f.owner, f.signal.signal, async () => 'image'), /reload failed/)
  assert.equal(f.tx.busy, false)
})
test('active inference is not stopped by an image job', async () => {
  const f = fixture(); f.tx.streams = 1
  await assert.rejects(f.tx.run(f.owner, f.signal.signal, () => {}), /still streaming/)
  assert.deepEqual(f.events, [])
})
test('new model inference waits until the image lease ends', async () => {
  const f = fixture(); f.tx.busy = true
  let entered = false
  const stream = f.tx.stream(f.signal.signal, async function* () { entered = true; yield 'ready' })
  const next = stream.next()
  assert.equal(entered, false)
  f.tx.busy = false
  assert.deepEqual(await next, { value: 'ready', done: false })
  assert.equal(f.tx.streams, 1)
  await stream.return()
  assert.equal(f.tx.streams, 0)
})
