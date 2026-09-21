import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeImageSettings } from '../Configure.mjs'
import { readImageConfig } from '../../../plugins/dsh-local-llm-controller/lib/image-config.js'

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
test('installation preserves chat settings and unrelated workflows; rerun does not duplicate entries', () => {
  const initial = { 'local-llm': { mode: 'vision', config: { port: 18200 } }, other: { keep: true },
    'image-generation': { custom: 'keep', comfyuiWorkflows: [{ name: 'my workflow', json: '{}' }] } }
  const merged = mergeImageSettings(initial, source)
  assert.deepEqual(merged['local-llm'], initial['local-llm'])
  assert.deepEqual(merged.other, initial.other)
  assert.equal(merged['image-generation'].custom, 'keep')
  assert.equal(merged['image-generation'].comfyuiWorkflows.length, 4)
  assert.deepEqual(mergeImageSettings(merged, source), merged)
  assert.equal(initial['image-generation'].comfyuiWorkflows.length, 1)
})
test('advanced graphs use existing GGUF, ordered reference encoder and 40-step cache path', () => {
  const workflows = mergeImageSettings({}, source)['image-generation'].comfyuiWorkflows
  const t2i = JSON.parse(workflows[1].json), i2i = JSON.parse(workflows[2].json)
  assert.equal(t2i['1'].class_type, 'UnetLoaderGGUF')
  assert.equal(t2i['6'].inputs.steps, 40)
  assert.equal(t2i['10'].class_type, 'QwenImage21Cache')
  assert.equal(i2i['9'].inputs.image, '{{image}}')
  assert.deepEqual(i2i['4'].inputs['images.image_1'], ['9', 0])
  assert.deepEqual(i2i['6'].inputs.latent_image, ['4', 2])
})
test('companion is disabled until configured and validates portable paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image21-config-'))
  try {
    assert.equal(readImageConfig(dir).enabled, false)
    fs.writeFileSync(path.join(dir, 'qwen-image21.json'), JSON.stringify({ enabled: true, root: dir, python: path.join(dir, 'python.exe'), desktopRoot: dir }))
    assert.equal(readImageConfig(dir).enabled, true)
    fs.writeFileSync(path.join(dir, 'qwen-image21.json'), JSON.stringify({ root: 'relative' }))
    assert.throws(() => readImageConfig(dir), /absolute/)
  } finally {
    fs.unlinkSync(path.join(dir, 'qwen-image21.json'))
    fs.rmdirSync(dir)
  }
})
