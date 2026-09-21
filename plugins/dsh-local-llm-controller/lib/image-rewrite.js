import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { imageConfig } from './image-config.js'
const root = imageConfig.root

export function parseRewrite(content, sizes = []) {
  const clean = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  let value
  try { value = JSON.parse(clean) } catch { throw new Error('Qwen prompt enhancement did not return valid JSON; no image was submitted') }
  if (typeof value.rewritten_prompt !== 'string' || !value.rewritten_prompt.trim() || value.rewritten_prompt.length > 24000) throw new Error('Qwen returned an empty or oversized rewritten_prompt')
  const ratio = value.wh_ratio ?? '', follow = value.ratio_follow ?? ''
  if (typeof ratio !== 'string' || typeof follow !== 'string') throw new Error('Invalid ratio fields from Qwen')
  if (follow && !sizes.length) throw new Error('ratio_follow requires a reference image')
  if (ratio && follow) throw new Error('Qwen returned conflicting aspect-ratio instructions')
  let aspect = 1, followIndex = 0
  if (ratio) {
    const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio)
    if (!match) throw new Error('Invalid wh_ratio from Qwen')
    aspect = Number(match[1]) / Number(match[2])
  } else if (sizes.length) {
    const match = /^<image(\d+)>$/.exec(follow || '<image1>')
    if (!match || !sizes[Number(match[1]) - 1]) throw new Error('Invalid ratio_follow reference from Qwen')
    followIndex = Number(match[1]) - 1
    aspect = sizes[followIndex].width / sizes[followIndex].height
  }
  if (!Number.isFinite(aspect) || aspect < 0.25 || aspect > 4) throw new Error('Aspect ratio must be between 1:4 and 4:1 for this local workflow')
  return { prompt: value.rewritten_prompt.replace(/\s*\n\s*/g, ' ').trim(),
    width: Math.max(32, Math.round(Math.sqrt(1048576 * aspect) / 32) * 32),
    height: Math.max(32, Math.round(Math.sqrt(1048576 / aspect) / 32) * 32),
    wh_ratio: ratio, ratio_follow: follow, followIndex }
}

export async function rewriteImagePrompt(request, model, port, signal) {
  if (!imageConfig.desktopRoot) throw new Error('Missing image companion desktopRoot configuration')
  const require = createRequire(path.join(imageConfig.desktopRoot, 'resources/app/package.json'))
  const sharp = require('sharp')
  if (!request.prompt?.trim()) throw new Error('Image request must not be empty')
  if (request.images.length > 16) throw new Error('Qwen-Image accepts at most 16 ordered reference images')
  const template = request.images.length ? 'system_prompt_edit.txt' : 'system_prompt_t2i.txt'
  const system = fs.readFileSync(root + '/prompts/' + template, 'utf8')
  const content = [], sizes = []
  for (let i = 0; i < request.images.length; i++) {
    signal.throwIfAborted()
    const data = Buffer.from(request.images[i].data)
    const meta = await sharp(data).metadata()
    sizes.push({ width: meta.autoOrient?.width || meta.width, height: meta.autoOrient?.height || meta.height })
    const png = await sharp(data).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
    content.push({ type: 'text', text: '<image' + (i + 1) + '>' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + png.toString('base64') } })
  }
  content.push({ type: 'text', text: request.prompt })
  const response = await fetch('http://127.0.0.1:' + port + '/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(600000)]),
    headers: { 'Content-Type': 'application/json', ...(request.apiKey ? { Authorization: 'Bearer ' + request.apiKey } : {}) },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content }],
      stream: false, max_tokens: 4096, temperature: 1, top_p: 0.95, top_k: 20,
      chat_template_kwargs: { enable_thinking: false } }),
  })
  if (!response.ok) throw new Error('Local Qwen prompt enhancement failed (' + response.status + '): ' + (await response.text()).slice(0, 600))
  const result = await response.json(), choice = result.choices?.[0]
  if (choice?.finish_reason === 'length') throw new Error('Qwen prompt enhancement was truncated; no image submitted')
  const parsed = parseRewrite(choice?.message?.content || '', sizes)
  const record = { ...parsed, model, template, sourceCount: sizes.length, input: request.prompt, createdAt: new Date().toISOString() }
  const logPath = root + '/logs/rewrite-' + Date.now() + '.json'
  fs.writeFileSync(logPath, JSON.stringify(record, null, 2))
  return { ...record, logPath }
}
