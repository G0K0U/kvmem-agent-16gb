import type { RewriteResult } from './local-gpu.js'

export const QWEN_T2I = 'Qwen-Image 2.1 Advanced T2I'
export const QWEN_I2I = 'Qwen-Image 2.1 Advanced I2I'
export function isAdvancedQwen(name: string, baseURL: string): boolean {
  return new URL(baseURL).origin === 'http://127.0.0.1:8191' && [QWEN_T2I, QWEN_I2I].includes(name)
}

/** Convert official rewrite fields into graph inputs; preserve reference order. */
export function applyQwenRewrite(workflow: Record<string, unknown>, rewrite: RewriteResult | undefined, images: string[]): Record<string, unknown> {
  if (!rewrite) throw new Error('Local Qwen prompt enhancement did not complete')
  const graph = structuredClone(workflow) as Record<string, { class_type: string; inputs: Record<string, unknown> }>
  if (!graph['4'] || !graph['5'] || !graph['6']) throw new Error('Invalid local Qwen advanced workflow')
  graph['4'].inputs.prompt = rewrite.prompt
  graph['5'].inputs.width = rewrite.width
  graph['5'].inputs.height = rewrite.height
  graph['6'].inputs.latent_image = ['5', 0]
  // All references enter the encoder and VAE in the same order as prompt rewriting.
  for (let i = 0; i < images.length; i++) {
    const id = String(100 + i)
    graph[id] = { class_type: 'LoadImage', inputs: { image: images[i] } }
    graph['4'].inputs['images.image_' + (i + 1)] = [id, 0]
  }
  delete graph['9']
  // The encoder latent matches image 1 exactly for ordinary single-image edits.
  if (images.length && !rewrite.wh_ratio && rewrite.followIndex === 0) graph['6'].inputs.latent_image = ['4', 2]
  return graph
}
