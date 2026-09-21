import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export function mergeImageSettings(settings, sourceDir) {
  const current = settings['image-generation'] ?? {}
  const definitions = [
    ['Qwen-Image 2.1 Q4_K_M', 'workflow-api.json'],
    ['Qwen-Image 2.1 Advanced T2I', 'workflow-advanced-t2i.json'],
    ['Qwen-Image 2.1 Advanced I2I', 'workflow-advanced-i2i.json'],
  ]
  const names = definitions.map(([name]) => name)
  return { ...settings, 'image-generation': {
    ...current, provider: 'comfyui', comfyuiBaseURL: 'http://127.0.0.1:8191',
    comfyuiTimeoutMs: 1800000, saveToWorkspace: true,
    comfyuiActiveWorkflow: names[1],
    comfyuiWorkflows: [ ...(current.comfyuiWorkflows ?? []).filter(w => !names.includes(w.name)),
      ...definitions.map(([name, file]) => ({ name, json: fs.readFileSync(path.join(sourceDir, file), 'utf8'), presetPrompt: '' })) ],
  } }
}

export function configure({ dshHome, desktopRoot, imageRoot, python }) {
  for (const value of [dshHome, desktopRoot, imageRoot, python]) if (!value || !path.isAbsolute(value)) throw Error('All install paths must be absolute')
  const require = createRequire(path.join(desktopRoot, 'resources/app/package.json'))
  const YAML = require('yaml'), file = path.join(dshHome, 'settings.yaml')
  const original = fs.readFileSync(file, 'utf8'), doc = YAML.parseDocument(original)
  if (!doc.get('local-llm')) throw Error('Configure the KVMem + DSH stack first')
  const sourceDir = path.dirname(fileURLToPath(import.meta.url))
  const merged = mergeImageSettings(doc.toJSON(), sourceDir)
  fs.copyFileSync(file, file + '.before-image21-' + Date.now())
  for (const name of ['workflow-api.json', 'workflow-advanced-t2i.json', 'workflow-advanced-i2i.json', 'run_comfy.py']) fs.copyFileSync(path.join(sourceDir, name), path.join(imageRoot, name))
  fs.writeFileSync(path.join(imageRoot, 'extra_model_paths.yaml'), YAML.stringify({ qwen_image21: {
    base_path: path.join(imageRoot, 'models').replaceAll('\\', '/'), diffusion_models: 'diffusion_models', text_encoders: 'text_encoders', vae: 'vae',
  } }))
  const configFile = path.join(dshHome, 'qwen-image21.json')
  if (fs.existsSync(configFile)) fs.copyFileSync(configFile, configFile + '.backup-' + Date.now())
  fs.writeFileSync(configFile, JSON.stringify({ enabled: true, root: imageRoot, python, desktopRoot }, null, 2) + '\n')
  doc.set('image-generation', merged['image-generation'])
  fs.writeFileSync(file + '.image21.tmp', String(doc)); fs.renameSync(file + '.image21.tmp', file)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dshHome, desktopRoot, imageRoot, python] = process.argv.slice(2)
  configure({ dshHome, desktopRoot, imageRoot, python })
  console.log('Image companion configured. Restart DSH; the controller will own ComfyUI on demand.')
}
