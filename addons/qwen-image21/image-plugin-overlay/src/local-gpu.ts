/** This machine's DSH-owned GPU handoff. Other ComfyUI endpoints keep upstream behavior. */
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
export interface RewriteResult {
  prompt: string; width: number; height: number; wh_ratio: string; ratio_follow: string;
  followIndex: number; model: string; template: string; sourceCount: number; logPath: string
}
export interface RewriteRequest { prompt: string; images: readonly { data: Uint8Array; mediaType: string }[] }

declare module '@deepseek-ai/cordis' {
  interface Context {
    localImageGpu: {
      run<T>(owner: ToolExecution['agent'], signal: AbortSignal, generate: () => Promise<T>, prepare?: () => Promise<void>): Promise<T>
      rewrite(request: RewriteRequest, signal: AbortSignal): Promise<RewriteResult>
    }
  }
}
export async function withLocalImageGpu<T>(ctx: Context, baseURL: string, exec: ToolExecution, generate: () => Promise<T>, prepare?: () => Promise<void>): Promise<T> {
  if (new URL(baseURL).origin !== 'http://127.0.0.1:8191') return generate()
  return ctx.localImageGpu.run(exec.agent, exec.signal, generate, prepare)
}
