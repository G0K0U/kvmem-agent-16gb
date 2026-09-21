import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function readImageConfig(home) {
  const file = path.join(home, 'qwen-image21.json')
  const defaults = { enabled: false, root: path.join(home, 'qwen-image21'), python: '', desktopRoot: '' }
  if (!fs.existsSync(file)) return defaults
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const key of ['root', 'python', 'desktopRoot']) {
    if (typeof value[key] !== 'string' || !path.isAbsolute(value[key])) throw new Error('qwen-image21.json requires absolute ' + key)
  }
  return { ...defaults, ...value, enabled: value.enabled === true }
}

export const imageConfig = readImageConfig(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'))
