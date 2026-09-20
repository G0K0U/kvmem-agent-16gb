# Compaction-replay fix (`dsh-compaction-basic` patch)

Fixes long DSH coding-agent sessions dying with

```
This turn failed "multimodal query replay failed or cancelled"
```

when context compaction fires (or when a single large tool result pushes a
request past the KVMem replay budget at depth).

## What actually happens

Two layers, verified by source tracing plus a reproduction on the real stack:

1. **KVMem server (upstream `kvmem-llama.cpp` v0.16.0-rc2).** Query replay
   (re-decoding a span whose attention view changed) performs no slot
   placement, while the applied retrieval selection is capped at the
   `--kvmem-budget` block pool and filled newest-first. A request whose
   uncached span is wider than that budget (a big `read` tool result, or a
   compaction summarizer replaying the whole leading region) dies at its first
   replay chunk (`block N has no GPU slot`) and the whole request fails. The
   KV rolls back to the last checkpoint, so a retry inherits the same
   oversized span. Despite the name, no images are involved (`image=0` in
   every trace) — "multimodal" is the server's universal query path when an
   mmproj is loaded.
2. **DSH (`dsh-compaction-basic`).** The compaction summarizer replays the
   entire leading region as one giant request (the largest of the session),
   and request-error recovery only recognised `CONTEXT_WINDOW_EXCEEDED`, so a
   hit turn died instead of recovering.

## What this patch changes (in DSH only)

- **Chunked map-reduce summarizer.** Regions above 16,384 estimated tokens are
  summarised in ≤8,192-token segments; each map request starts with a
  synthetic `[compaction segment i/N]` marker so the provider's prefix cache
  breaks at a shallow depth (deep host-resident KV rows are never replayed).
  A reduce call merges the segment notes into the standard structured
  checkpoint. Smaller regions keep the original warm-prefix single call.
- **Self-healing.** A `query replay failed or cancelled` provider failure now
  triggers overflow compaction + retry instead of killing the turn. User
  cancellation behaviour is unchanged.

No server binary, model, MTP/KV flag or context setting is modified.

## Version pinning

The patched file is pinned to `@deepseek-ai/dsh-compaction-basic`
**0.1.6-alpha.2** (the family shipped with DSH Desktop Beta 2.0.13-beta.1):

| File | SHA256 |
|---|---|
| `index.original.js` (as shipped) | `f523795257c81d93d70af8f946853a21ac12ccbd8949edaffefd379095ce1122` |
| `index.patched.js` (this fix) | `c86f39af516f8f26a2a3ff5aeeb18c0ec0cd20f4bf3e4397446b698adfbc78a` |

`Install.ps1` refuses to touch anything else. When DeepSeek ships a newer
dsh-compaction-basic, this patch must be re-derived from
`dsh-compaction-basic-chunked-summarize.patch` against the new source.

## Install / verify / uninstall

```powershell
# install (backs up the original file first)
.\Install.ps1 -DshAppRoot "C:\Users\<you>\AppData\Local\Programs\DSH Desktop Beta\resources\app"

# restart DSH Desktop, then run the regression tests (see below)

# uninstall
.\Rollback.ps1 -DshAppRoot "C:\Users\<you>\AppData\Local\Programs\DSH Desktop Beta\resources\app"
```

Regression tests (10; they resolve `@deepseek-ai/*` from an installed DSH app —
point a `node_modules` junction at your app root, or run them from inside it):

```powershell
node --test test\compaction-chunk.test.mjs
```

## Validation (2026-09-20, RTX 4080 16 GB, 128K / KV32K / reserve 8K / MTP2)

| Case | DSH | KVMem server | Result |
|---|---|---|---|
| baseline | original | original | turn died at step 2 with the replay error (reproduced; server trace correlated) |
| patched DSH + original server | patched | original | agent recovered from the replay error, **compaction committed** (checkpoint in the session journal), follow-up turns with `read` + `pwsh` tool calls completed on the compacted context |

A server-side streaming fix for the KVMem replay path itself was prototyped
(placement + slot recycling in `prepare_ubatches`); it is **not** part of this
patch — the MTP draft mirror needs an upstream decision. The DSH-side fix above
is the shipped remedy: the failure mode degrades to a recovered retry instead
of a dead session.

## Files

- `Install.ps1` / `Rollback.ps1` — hash-pinned install and rollback
- `index.patched.js` / `index.original.js` — the pinned file pair
- `dsh-compaction-basic-chunked-summarize.patch` — the same change as a diff
- `test/compaction-chunk.test.mjs` — regression tests

The patched package remains MIT (upstream dsh-compaction-basic); these scripts
and docs are MIT like the rest of this repo.
