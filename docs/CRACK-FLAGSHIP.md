# Flagship: Bonsai 2 CRACK PQ2 — 100+ tok/s with 256K context

[English](CRACK-FLAGSHIP.md) | [简体中文](CRACK-FLAGSHIP.zh-CN.md)

The fastest validated configuration in this repository: a 27B ternary CRACK model on the custom NInfer runtime, deployed 2026-09-22 on RTX 4080 16GB (sm_89), Windows, CUDA 13.2 / MSVC 14.44. **After this deployment, both RTX 4080 machines here run it as the daily driver and sustain 100+ tok/s decode in everyday use.** The deployment-day single-shot baseline below measured 98.9–99.1 tok/s on the strictest protocol (temperature 0, thinking off, 256-token output); everyday agent traffic with high MTP draft acceptance runs faster — the benchmark log records ~160 tok/s on tool-call cases.

Like [Bonsai](BONSAI.en.md), this model does **not** run on KVMem. It uses the same custom NInfer runtime prerequisite class and the same controller launch contract (slot B text mode, backend `127.0.0.1:18200` managed by the parameter panel, GPU handoff with image generation preserved — the handoff itself was not re-executed in this round). A matching custom Windows/Ada NInfer runtime and converted `.ninfer` weights remain prerequisites; ordinary Bonsai GGUF cannot be passed directly to `ninfer-serve`.

## Sources and pinned provenance

- Model: [dealignai/Bonsai-2-27B-Ternary-CRACK-GGUF](https://huggingface.co/dealignai/Bonsai-2-27B-Ternary-CRACK-GGUF), revision `3d36486a5fb2a3868116b8f6e768179e2391d28d`; GGUF SHA256 `5b24ea3eebc3e0bccd05fb474eb88b10c57699d71a5db2f29485e3789a70d55d` (verified after download).
- Engine: [CraneBW/ninfer-ternary-bonsai-ada](https://github.com/CraneBW/ninfer-ternary-bonsai-ada), commit `ad6cb4645bbfee13d487578682c7b2a53f299e16`, built with CUDA 13.2.86 / MSVC 14.44 for sm_89.
- Artifact: `Bonsai2-CRACK-PQ2.ninfer`, 8,306,927,628 bytes, SHA256 `ea11022e5b275bcf115cde29146106d0f64ed9db83105f7900de3bcdfd00ca84`.

As with the earlier Bonsai artifact: the PQ2 GGUF text weights are converted into an NInfer artifact, borrowing the existing Qwen3.8 template's tokenizer/frontend, vision tower and MTP head. This is **not** a complete NInfer artifact published by the model author. Local pack-check passed geometry, dtype and byte-roundtrip verification. Windows build adaptations: reused NVTX headers, FFmpeg shared dependencies, and the MSVC conforming preprocessor enabled only for the CUDA sources that need CCCL (the remaining large templates would compile extremely slowly otherwise). `Build.ps1` can rebuild the engine.

The small-batch ternary MMA threshold defaults to 32 in this build; setting `NINFER_TERNARY_MMA_MIN_TOKENS=64` restores the upstream threshold. No controlled measurement of the threshold alone was performed — the overall speed gain cannot be attributed to it.

## Validated configuration

| Parameter | Value |
|---|---|
| Context / KV capacity | 262144 / 262144 |
| KV dtype | `rk4v4-e8` (4-bit) |
| MTP | draft 3 |
| Prefill chunk | 128 |
| Concurrency | 1 |
| Host KV / host states / device cached states | 512 MiB / 2 / 1 |
| Max output | 16384 |
| Thinking budget | 256 |

Context capacity and the per-turn output ceiling are different parameters. The 262144 4-bit KV allocation succeeds; after a text-mode start the engine reports about 1.61 GiB VRAM free. The DSH model ID is `Bonsai2-CRACK-PQ2.ninfer`; the original `Bonsai2-PQ2-MTP.ninfer` artifact passes new-engine compatibility testing and remains selectable.

## Measured (deployment day, single machine)

Same machine, same CRACK artifact, same gardening prompt, temperature 0, thinking off, 256 output tokens, one run each — **not a universal speed guarantee**:

| Configuration | decode tok/s |
|---|---:|
| Original engine, BF16 KV, 8192 ctx, no MTP | 62.37 |
| New engine, BF16 KV, 8192 ctx, no MTP | 63.47 |
| New engine, 4-bit KV, 262144 ctx, MTP 3 | 99.07 |
| DSH controller production port, new artifact | 98.87 |

The end-configuration gain is about 59% — but KV dtype, MTP and context size changed together, so no single factor is independently quantified. Prefill: ~4590 tokens in about 914 tok/s cold; a repeated-prefix second round hit the 4581-token cache with a ~305 ms time-to-first-token. Tool calls with tool-result continuation, integer arithmetic, and ~4.6K-token text retrieval all passed. Raw per-case numbers: [crack-flagship-benchmarks.json](../evidence/crack-flagship-benchmarks.json).

## Boundaries — read before relying on the headline

- The 100+ tok/s figure is the operational experience of the two RTX 4080 machines after this deployment; the tables above are single-run, short-output measurements. Neither is a guarantee that long-context decoding always holds this speed.
- **No full-256K accuracy or long-term stability test was run.** 262144 allocates and serves; semantic quality at deep context and multi-day stability are unverified.
- DSH's Bonsai route stays **text mode** — vision is not wired into DSH. On an isolated API port with vision enabled, a 1200×1200 JPEG (red square / blue circle + position) was recognized correctly. The "six 2048×2048 images" claim seen in screenshots was not tested. Existing image-generation/training flows were not changed.
- Display-name note: after switching, confirm the actual model via the ID `Bonsai2-CRACK-PQ2.ninfer` in `/v1/models`, not the display name — the controller could previously label every Bonsai artifact with the same name.

## Rollback

To switch weights only, select `Bonsai2-PQ2-MTP.ninfer` in DSH. To restore the earlier engine and parameters as well, run the rollback script while the task queue is idle; it restarts the model through the controller rather than killing processes. After any rollback, wait for the ready state and verify the actual model ID. Keep a private backup of your settings before touching them; never commit settings backups to the repository.
