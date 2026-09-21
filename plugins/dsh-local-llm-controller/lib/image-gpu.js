// Provided through Cordis, so all plugin loader contexts share the same owner.
export class ImageGpuTransaction {
  busy = false
  streams = 0
  constructor(adapter) { this.adapter = adapter }
  async *stream(signal, next) {
    while (this.busy) {
      signal?.throwIfAborted()
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    signal?.throwIfAborted()
    this.streams++
    let active = true
    try {
      for await (const chunk of next()) {
        // Tools may start while the consumer is processing the final chunk.
        if (chunk?.type === 'finish' && active) { this.streams--; active = false }
        yield chunk
      }
    } finally { if (active) this.streams-- }
  }
  async run(owner, signal, generate, prepare) {
    signal.throwIfAborted()
    if (this.busy) throw new Error('Another image generation is using the GPU')
    const others = this.adapter.agents().filter(a => a.status === 'running' && a !== owner)
    if (others.length) throw new Error('Finish other DSH tasks before sharing the GPU with image generation')
    if (!owner) throw new Error('Image GPU handoff requires the calling DSH agent')
    this.busy = true
    let snapshot, unloadAttempted = false, result, primaryError
    const cleanupErrors = []
    try {
      // The calling agent's tool can race its stream finalizer. Reserve the lease
      // first so no new stream starts, then give that finalizer a bounded wait.
      const drainDeadline = Date.now() + (this.adapter.streamDrainMs ?? 5000)
      while (this.streams) {
        signal.throwIfAborted()
        if (Date.now() >= drainDeadline) throw new Error('A model response is still streaming; retry after it finishes')
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      // Missing models or runtime must not unload a working chat model.
      await this.adapter.preflight()
      signal.throwIfAborted()
      snapshot = await this.adapter.snapshot()
      unloadAttempted = true
      if (prepare) await prepare(snapshot)
      signal.throwIfAborted()
      await this.adapter.unload()
      signal.throwIfAborted()
      await this.adapter.startImage(signal)
      result = await generate()
      signal.throwIfAborted()
    } catch (error) { primaryError = error }
    finally {
      if (unloadAttempted) {
        // Cleanup deliberately ignores the caller's abort signal.
        let imageStopped = false
        try { await this.adapter.stopImage(); imageStopped = true }
        catch (error) { cleanupErrors.push(error) }
        // Never reload the LLM while an owned image process may still hold VRAM.
        if (imageStopped) {
          try { await this.adapter.restore(snapshot) }
          catch (error) { cleanupErrors.push(error) }
        }
      }
      this.busy = false
    }
    if (cleanupErrors.length) throw new AggregateError(
      [primaryError, ...cleanupErrors].filter(Boolean),
      'Image GPU recovery failed: ' + cleanupErrors.map(e => e.message).join('; '))
    if (primaryError) throw primaryError
    return result
  }
}
