import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

import { imageConfig } from './image-config.js'
export const IMAGE_ROOT = imageConfig.root
export const IMAGE_URL = 'http://127.0.0.1:8191'
const PYTHON = imageConfig.python || ''
const required = [
  'models/diffusion_models/qwen-image-2.1-Q4_K_M.gguf',
  'models/text_encoders/qwen3vl_8b_int8_convrot.safetensors',
  'models/vae/qwen_image_2.1_vae_bf16.safetensors',
]
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export function createImageRuntime() {
  let child = null, exited = null, logFd = null
  return {
    async preflight() {
      if (!imageConfig.enabled) throw new Error('Install the optional Qwen-Image 2.1 companion first; see addons/qwen-image21')
      const missing = required.filter(p => !fs.existsSync(path.join(IMAGE_ROOT, p)) ||
        fs.existsSync(path.join(IMAGE_ROOT, p + '.aria2')))
      if (missing.length) throw new Error('Qwen-Image 2.1 尚未部署完整，聊天模型未卸载。缺少: ' + missing.join(', '))
      for (const p of [PYTHON, IMAGE_ROOT + '/run_comfy.py', IMAGE_ROOT + '/ComfyUI/main.py']) {
        if (!fs.existsSync(p)) throw new Error('Missing image runtime: ' + p)
      }
      try {
        await fetch(IMAGE_URL + '/system_stats', { signal: AbortSignal.timeout(1500) })
        throw new Error('Port 8191 is already occupied; image handoff requires its own process')
      } catch (error) {
        if (!(error instanceof TypeError) && error.name !== 'TimeoutError') throw error
      }
    },
    async startImage(signal) {
      fs.mkdirSync(IMAGE_ROOT + '/logs', { recursive: true })
      fs.mkdirSync(IMAGE_ROOT + '/output', { recursive: true })
      logFd = fs.openSync(IMAGE_ROOT + '/logs/comfy.log', 'a')
      child = spawn(PYTHON, ['-s', IMAGE_ROOT + '/run_comfy.py', '--listen', '127.0.0.1',
        '--port', '8191', '--disable-auto-launch', '--lowvram', '--preview-method', 'none',
        '--extra-model-paths-config', IMAGE_ROOT + '/extra_model_paths.yaml',
        '--output-directory', IMAGE_ROOT + '/output'],
      { cwd: IMAGE_ROOT, windowsHide: true, stdio: ['ignore', logFd, logFd] })
      let spawnError = null
      exited = new Promise(resolve => {
        child.once('error', error => { spawnError = error; resolve() })
        child.once('exit', resolve)
      })
      const deadline = Date.now() + 180000
      while (Date.now() < deadline) {
        signal.throwIfAborted()
        if (spawnError) throw spawnError
        if (child.exitCode !== null) throw new Error('ComfyUI exited; see ' + IMAGE_ROOT + '/logs/comfy.log')
        try {
          const response = await fetch(IMAGE_URL + '/system_stats', { signal: AbortSignal.timeout(2000) })
          if (response.ok) return
        } catch {}
        await delay(500)
      }
      throw new Error('ComfyUI startup timed out')
    },
    async stopImage() {
      if (child) {
        if (child.exitCode === null) child.kill()
        let timer
        try {
          await Promise.race([exited, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('ComfyUI did not exit; LLM stays stopped')), 30000)
          })])
        } finally { clearTimeout(timer) }
        child = null; exited = null
      }
      if (logFd !== null) { fs.closeSync(logFd); logFd = null }
    },
  }
}
