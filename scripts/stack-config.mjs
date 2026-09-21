import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const catalog = JSON.parse(fs.readFileSync(path.join(root, 'config/chat-models.json'), 'utf8'))
const rows = object => Object.entries(object).map(([flag, value]) => ({ flag, value: String(value) }))

export function modelPresets(backend, profile = 'bootstrap') {
  if (!['bootstrap', 'desktop128'].includes(profile)) throw Error('Unknown profile')
  const daily = profile === 'desktop128'
  const base = backend === 'ninfer' ? {
    '--max-context': daily ? 131072 : 32768, '--kv-capacity': daily ? 131072 : 32768,
    '--kv-dtype': 'int8', '--max-concurrency': 1, '--prefill-chunk': 128,
    '--host-kv-mib': 512, '--host-state-slots': 2, '--device-state-slots': 1,
    '--default-thinking-budget': 256, '--default-max-tokens': daily ? 131072 : 4096,
  } : {
    '-b': daily ? 256 : 128, '-ngl': 999, '-c': daily ? 131072 : 65536,
    '-n': daily ? 16384 : 4096, '--kvmem-budget': daily ? 24576 : 8192,
    '--kvmem-gen-reserve': daily ? 16384 : 4096, '--kvmem-block-tokens': 128,
    '-ctk': 'q5_0', '-ctv': 'q5_0', '--spec-type': 'draft-mtp',
    '--spec-draft-n-max': daily ? 2 : 1, '--spec-kv-dtype': 'f16',
    '--kvmem-mtp-state': 'replay', '--enable-thinking': '', '--reasoning-effort': 'medium',
    '--reasoning-budget': daily ? 4096 : 1024,
  }
  return Object.fromEntries(['text:fast', 'text:long', 'vision:fast', 'vision:long'].map(key => {
    const value = { ...base }
    if (backend !== 'ninfer' && key.startsWith('vision')) value['--reasoning-budget'] = 1024
    return [key, rows(value)]
  }))
}

export function mergeStack(existing, options) {
  const { model = 'iq3', profile = 'bootstrap', modelsDir, runtimeBin, ninferBin, bonsaiDir,
    qwenModel = 'iq3', port = 18200, vision = false } = options
  if (!catalog[model] || !catalog[qwenModel] || catalog[qwenModel].backend !== 'kvmem') throw Error('Unknown model or invalid Qwen fallback')
  const selectedQwen = model === 'bonsai' ? qwenModel : model
  const template = JSON.parse(fs.readFileSync(path.join(root, 'config/settings.template.json'), 'utf8'))
  const slot = (key, dir, engineDir) => ({ backend: catalog[key].backend, dir, engineDir,
    serverExe: key === 'bonsai' ? 'ninfer-serve.exe' : 'llama-kvmem-server.exe',
    file: catalog[key].file, alias: catalog[key].file, presets: modelPresets(catalog[key].backend, profile) })
  const slots = { a: { ...slot(selectedQwen, modelsDir, runtimeBin), mmproj: 'mmproj-Qwen3.8-27B-F16.gguf' },
    b: ninferBin && bonsaiDir ? slot('bonsai', bonsaiDir, ninferBin) : { dir: '', file: '' } }
  if (model === 'bonsai' && (!ninferBin || !bonsaiDir)) throw Error('Bonsai requires its verified NInfer runtime and artifact directory')
  const provider = { ...template['llm-pi-ai'].providers['qqz-kvmem'], baseURL: `http://127.0.0.1:${port}/v1`,
    headers: { authorization: 'Bearer dsh-local-llm' },
    models: [selectedQwen, ...(ninferBin && bonsaiDir ? ['bonsai'] : [])].map(key => ({
      id: catalog[key].file, name: key + ' / ' + profile,
      contextWindow: profile === 'desktop128' ? 131072 : key === 'bonsai' ? 32768 : 65536,
      maxTokens: profile === 'desktop128' ? key === 'bonsai' ? 131072 : 16384 : 4096,
      input: key === 'bonsai' || !vision ? ['text'] : ['text', 'image'],
      reasoningEfforts: { low: 'low', medium: 'medium', high: 'xhigh' },
    })) }
  return { ...existing,
    'local-llm': { slot: model === 'bonsai' ? 'b' : 'a', mode: model === 'bonsai' || !vision ? 'text' : 'vision', preset: 'fast',
      config: { llamaDir: runtimeBin, serverExe: 'llama-kvmem-server.exe', port, apiKey: '', settingsNs: 'llm-pi-ai', slots } },
    'llm-pi-ai': { ...existing['llm-pi-ai'], providers: { ...existing['llm-pi-ai']?.providers, 'qqz-kvmem': provider } },
    'agent-default-model': { ...existing['agent-default-model'], provider: 'qqz-kvmem', model: catalog[model].file, reasoningEffort: 'medium' },
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  const require = createRequire(path.join(options.desktopRoot, 'resources/app/package.json'))
  const YAML = require('yaml'), file = path.join(options.dshHome, 'settings.yaml')
  const doc = YAML.parseDocument(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}')
  const merged = mergeStack(doc.toJSON() || {}, options)
  for (const ns of ['local-llm', 'llm-pi-ai', 'agent-default-model']) doc.set(ns, merged[ns])
  if (!doc.has('dsh-desktop')) doc.set('dsh-desktop', { port: 43189 })
  fs.writeFileSync(file + '.stack.tmp', String(doc))
  fs.renameSync(file + '.stack.tmp', file)
}
