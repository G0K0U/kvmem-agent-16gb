[**English**](README.md) | [简体中文](README.zh-CN.md)

# 16GB VRAM Local Agent Stack — DSH Desktop + KVMem (llama.cpp)

A reproducible Windows deployment snapshot: a desktop Agent harness (DSH Desktop) driving a KVMem llama.cpp server through a local parameter panel. **The stack itself is model-agnostic** — two GGUF model slots, with context, MTP and KV-budget launch parameters fully editable per group — **but this repository ships and validates one pinned default**: the QQZ 27B IQ4_XS MTP quant, tuned for the 16GB-VRAM / 32GB-RAM machine class.

**Validated real-world case: RTX 4080 16GB + 32GB RAM, 64K preset — a coding-agent session (single-file HTML with an animated SVG pelican on a bicycle) finished 10 model calls at a weighted 32.05 token/s.** The session's actual peak context was about 27K tokens; this is not a claim of "full 64K at a constant 32 token/s". Method, numbers and limits: [case study](docs/CASE-STUDY.md).

This repo ships the text/coding agent path used in that session. To keep the case-study parameters intact, the config still loads the vision encoder on CPU; that does not mean the vision agent is stable. The Computer Use plugin, which produced many errors, is not installed by this repo.

## Architecture & pinned versions

```text
DSH Desktop → local parameter panel manages the model process
           → OpenAI-compatible API 127.0.0.1:18200/v1
           → KVMem CUDA → GGUF (language model on GPU / vision encoder on CPU)
```

| Component | Pinned version / source |
|---|---|
| QQZ (default model) | [IQ4_XS V3 Final MTP](https://huggingface.co/QQZ2026/Qwen3.8-27B-ZeroRefusal-UD-IQ4_XS-MTP-GGUF), revision `e45b6a3a3c137c11df9da4a79cfae82fdd7faaa3` |
| KVMem | [v0.16.0-rc2](https://github.com/kvmem/kvmem-llama.cpp/releases/tag/v0.16.0-rc2), Windows CUDA 13.2.86 |
| DSH Desktop | [2.0.12-beta.1](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.12-beta.1), community desktop client |
| DeepSeek Harness | `0.1.6-alpha.2`, bundled with the desktop build |
| Parameter panel | [Lbunc/dsh-local-llm-controller](https://github.com/Lbunc/dsh-local-llm-controller), local KVMem adaptation `2.0.4-kvmem.1` based on `87f23f187aad397f0040d8d192c6d9ad83320f85` |

This is a version snapshot, not a tracker of latest. Download URLs and SHA256 live in [assets.json](config/assets.json). The repo distributes no model weights and no upstream binaries.

## What is generic vs. what is pinned

| Generic — works with other models | Pinned in this snapshot |
|---|---|
| Two model slots (A/B); each slot points at any folder of GGUF files, `mmproj` auto-detected, one model process at a time | `assets.json` pins the QQZ IQ4_XS V3 model + F16 mmproj so `Download.ps1` is one command with SHA256 checks |
| Eight editable launch-parameter groups (2 slots × text/vision × fast/long) | `settings.template.json` presets were tuned on the 27B / 66-layer model: 64K, MTP2, q5_0 KV, budget 32K |
| Model display name derives from the GGUF filename and can be renamed on the models page | The case-study numbers were measured with the QQZ model only |
| `serverExe` is configurable (`llama-kvmem-server.exe`; `llama-server` on Linux/macOS) | DSH Desktop and DeepSeek Harness versions are fixed |

Apply-time validation in the panel enforces an envelope: context ∈ {64K, 128K, 192K, 256K}; `--kvmem-budget` ∈ {8K … 48K} in 8K steps; `--kvmem-gen-reserve` ∈ {4K, 8K, 16K}; budget + reserve ≤ context; MTP drafts 1–4; `-ngl` ≥ 66 (full GPU offload). That envelope matches 27B-class MTP GGUFs on 16GB VRAM. Other models load through the same slots, but anything outside this envelope is outside what this repo has tested, and the MTP presets assume an MTP-enabled GGUF.

## Install

Requires Windows x64, an NVIDIA driver matching the CUDA runtime above, 16GB NVIDIA VRAM, 32GB RAM, Node.js 24 (original environment 24.19.0), PowerShell, Git and curl. The model is about 14.25GB and the vision encoder about 0.93GB; leave room for runtimes, installers and cache. Close ComfyUI and other large GPU software during testing.

1. Clone this repo and enter it. In PowerShell run:

   ```powershell
   .\scripts\Download.ps1 -Models
   ```

   Without `-Models` only the runtime and desktop installer download. Every file is SHA256-checked; an interrupted download leaves a `.part` that restarts next time.

2. Run the DSH Desktop installer from `downloads`. Unzip the KVMem ZIP and locate the `bin` directory containing `llama-kvmem-server.exe`. The GGUF files may stay in `downloads`. If you already have the same versions and model, reuse them — no need to download again.

3. Generate the dedicated config and install the panel plugin on first run. Replace the example paths with your own:

   ```powershell
   .\scripts\Configure.ps1 `
     -DesktopRoot 'D:\Apps\DSH Desktop Beta' `
     -RuntimeBin 'D:\Models\kvmem\bin' `
     -ModelsDir "$PWD\downloads" `
     -NodeExe 'node'
   ```

   `DesktopRoot` must contain `DSH Desktop Beta.exe` and `resources/app/lib/desktop-cli.js`. You can find the install directory via the shortcut's "Open file location". The script calls the desktop-only CLI's `plugin --profile desktop add ... --ignore-scripts`; do not substitute a different global dsh.

   Data goes into the Git-ignored `local/dsh-home`, with working directory `local/workspace`. An existing DSH user directory is never touched. Re-runs refuse to overwrite; if plugin installation is interrupted, set `DSH_HOME` to this dedicated directory manually and retry the desktop-cli plugin command.

4. Fully exit other DSH Desktop instances and anything occupying ports 18200/43189, then start:

   ```powershell
   .\scripts\Start.ps1
   .\scripts\Health.ps1
   ```

   First model load takes a while. Once the health endpoint is OK, select `QQZ + KVMem 64K / MTP2` in DSH. The panel owns starting and stopping KVMem — do not run another llama-server launcher alongside it. The desktop starts with Electron GPU acceleration disabled; the model's CUDA compute stays enabled.

## Daily use & parameter panel

Open the Local LLM Controller / QQZ-KVMem card in DSH settings. Default slot A, vision mode, fast preset = **64K / MTP2**, with the CPU vision encoder kept in this mode. Pick a context step, MTP draft count and KV budget, then click "Apply & restart"; wait for the backend to become healthy again, confirm the context size synced in the model list, and only then start a new task. Finish any running agent request first.

| Parameter | Default | Meaning |
|---|---:|---|
| `-c` | 65536 | Logical context ceiling, not tokens actually in use |
| `--kvmem-budget` | 32768 | KVMem token retrieval budget, not MB |
| `--kvmem-gen-reserve` | 8192 | Generation reserve |
| `--spec-draft-n-max` | 2 | MTP draft count (not the negative value -2) |
| `-ctk` / `-ctv` | q5_0 | KV quantization |
| `-b` | 256 | batch |
| `-ngl` | 999 | Request full GPU offload |

The config also enables `draft-mtp`, MTP replay, and a thinking budget of 4096. DSH's High maps to **xhigh**, which the model template accepts, preventing `Unexpected reasoning effort high`. low/medium pass through unchanged. The standalone launch parameter medium is only a default; DSH requests may override it.

For a coding acceptance check, use "create a single-file HTML in the working directory with an SVG animation of a pelican riding a bicycle". The default Workspace Write permission keeps DSH's approval behavior; choose the permission mode you need in the UI. This repo does not auto-approve on your behalf.

To shut down: stop tasks, stop the model in the panel, then exit the desktop normally. Backing up `local/dsh-home` preserves settings and sessions, but never commit it to GitHub.

## Using a different model

The slots are model-agnostic; the pinned default is a convenience, not a requirement.

- **Swap interactively:** drop any GGUF (plus an optional `mmproj-*.gguf`) into a folder, point the card's model-folder field for the active slot at it, choose the file, then Apply & restart. GGUF and mmproj files are auto-detected inside the folder; the display name derives from the filename and can be renamed on the models page. One slot runs at a time — stop the current model before switching (they share one VRAM budget).
- **Change the pinned default (reproducible from scratch):** edit the `model`/`vision` entries in `config/assets.json` (URL + SHA256) and the `file`/`mmproj` fields of slot A in `config/settings.template.json`, then re-run `Download.ps1 -Models` and `Configure.ps1` in a fresh location.
- **Tuning notes for other models:** the MTP flags (`--spec-type draft-mtp`, `--spec-draft-n-max`, `--kvmem-mtp-state replay`) require an MTP-enabled GGUF (QQZ V3, Unsloth MTP builds, and similar). KV quantization trades VRAM for fidelity — q5_0 is the validated middle ground here; q8_0 costs VRAM, q4_0 frees it. Budget and reserve are token counts, not MB. A smaller `-b` frees compute buffer memory at some prompt-processing speed. Keep `-ngl 999` for full GPU offload.
- **Boundary:** 128K is an optional preset; 192K/256K are not validated as stable daily settings. On a different GPU/RAM the whole envelope shifts — re-verify rather than assuming the case-study numbers transfer.

## Stability boundaries

- 64K is the conservative default step. 128K is an optional configuration; 192K/256K are not validated as stable daily settings.
- One stress test reached 155,539 input tokens, but available RAM/VRAM were nearly exhausted and a KVMem block/replay error appeared; that is not a long-term agent reliability guarantee.
- KVMem keeping historical KV in system memory is a framework mechanism. GPU offload of language-model layers and KV storage in memory are two different things; Windows can still migrate to shared GPU memory.
- Vision parsing, screenshot understanding and generic desktop clicking have known failures. Computer Use's non-JSON output, approval-mode and repeated-observation problems are outside this stable default path.
- Switching context/budget can exhaust memory. On a startup error, restore 64K / 32768 / MTP2 and check the panel logs; do not keep launching more model processes.

## Verification & license

Plugin tests:

```powershell
node --test plugins/dsh-local-llm-controller/test/logic.test.mjs plugins/dsh-local-llm-controller/test/kvmem.test.mjs
```

Release checks and the actual verification boundary: [VALIDATION.md](docs/VALIDATION.md). A fresh full install on a new machine is not itself a re-validation, and this repo does not describe script checks as end-to-end stability testing.

The parameter panel keeps its original MIT license; the new scripts and documentation in this repo are MIT. Upstream models, runtimes and the desktop client remain under their own licenses — see [third-party notices](THIRD_PARTY_NOTICES.md).
