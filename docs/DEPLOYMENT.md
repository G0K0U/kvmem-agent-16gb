# Complete 16GB VRAM deployment guide: KVMem + DSH + Qwen-Image 2.1

[**English**](DEPLOYMENT.md) | [简体中文](DEPLOYMENT.zh-CN.md)

Use this guide when reproducing the setup on another computer or handing deployment to Codex. KVMem (sometimes called KVMan) is a llama.cpp fork; Bonsai uses a separate NInfer backend. **Four optional chat models means choosing one at a time, not keeping four servers resident. Chat and image generation must also share the GPU sequentially.**

Identical RTX 4080 16GB / 32GB RAM hardware does not imply identical free resources. A read-only check on the author's desktop on 2026-09-21 showed about 15.4 GiB of total GPU usage with Heretic 128K loaded. This was whole-card usage, not model-only memory, and does not establish the cause of another machine's OOM. Record processes, free VRAM and the failure stage before changing parameters.

## 1. Versions and files

| Component | Package baseline | Notes |
|---|---|---|
| System | Windows x64, RTX 4080 16GB, 32GB RAM | Check RAM, virtual memory and VRAM separately |
| Deployment shell | PowerShell 7, Node.js 24, Git, pnpm 11.7 | Use `pwsh`; do not paste these examples into cmd |
| DSH Desktop | 2.0.12-beta.1 | Installer SHA256 in `config/assets.json` |
| KVMem | v0.16.0-rc2 Windows CUDA 13.2.86 | Requires `llama-kvmem-server.exe`, not ordinary llama-server |
| Chat models | IQ3 / QQZ / Heretic / Bonsai | Files, pinned URLs and hashes in `config/chat-models.json` |
| ComfyUI / GGUF nodes / image plugin | Pinned Git commits | See `addons/qwen-image21/manifest.json` |
| Image baseline | Qwen-Image 2.1 Q4_K_M | 4.60 GB diffusion weights + INT8 encoder + BF16 VAE |

Open PowerShell 7 and work from the repository root throughout deployment. Paths such as `D:\Apps` and `D:\Models` below are examples: replace them with actual paths on the target computer.

```powershell
git clone https://github.com/G0K0U/kvmem-agent-16gb.git
Set-Location kvmem-agent-16gb
node --version
pnpm --version
nvidia-smi
.\scripts\Diagnose.ps1 -Stage inventory
```

Diagnostics default to the Git-ignored `local/diagnostic.json`. They include device information, VRAM, RAM, service names/PIDs and ports, without exporting credentials, conversations or full command lines. Do not start a model yet. Keep a system-managed pagefile and enough disk space; a pagefile cannot replace GPU VRAM.

## 2. Download one chat model and KVMem first

For initial deployment, start with the smaller IQ3 weights to validate the process. Existing weights can stay in your own ModelsDir; configuration still verifies SHA256.

```powershell
.\scripts\Download.ps1
.\scripts\Download-ChatModel.ps1 -Model iq3 -Vision -Destination 'D:\Models\Chat'
Expand-Archive -LiteralPath '.\downloads\kvmem-v0.16.0-rc2-windows-x86_64-cuda13.2.86.zip' -DestinationPath '.\runtime'
Get-ChildItem .\runtime -Recurse -Filter llama-kvmem-server.exe
```

By default, `Download.ps1` downloads only the pinned KVMem archive and DSH installer. Install DSH if needed, or reuse an existing compatible installation. **Do not start an independent KVMem script and then start the DSH controller as well.**

Use the server's `bin` directory from the previous step as RuntimeBin. The retrieval parameters in this package require KVMem. Ordinary llama.cpp does not understand them; an identical HTTP interface does not make the backends interchangeable.

## 3A. Option A: existing DSH application, separate data directory

Prefer this option for initial reproduction. It reuses the installed application while storing this setup's data in `local/dsh-home`, keeping old plugins and settings out of the baseline. A second application installation is unnecessary.

Exit DSH normally, including its tray process, and stop other model services. The scripts do not forcibly terminate processes.

```powershell
.\scripts\Configure-Stack.ps1 `
  -DesktopRoot 'D:\Apps\DSH Desktop Beta' `
  -RuntimeBin 'D:\Repos\kvmem-agent-16gb\runtime\kvmem-v0.16.0-rc2-windows-x86_64-cuda13.2.86\bin' `
  -ModelsDir 'D:\Models\Chat' -Model iq3 -Profile bootstrap
```

Start with the default text mode. This script configures and registers the controller without starting a server. It uses local API `127.0.0.1:18200`, one active slot, shared provider `qqz-kvmem`, an empty server API key and a placeholder local-client Authorization header. Existing permissions are not broadened.

## 3B. Option B: integrate into existing DSH data

This option preserves existing tasks and plugins. First identify the **actual DSH data directory**. The application directory `resources/app`, Electron's `%APPDATA%` cache and DSH_HOME are different locations. Check `DSH_HOME` in the existing launcher. If unset, identify the files used by that DSH version instead of guessing `.dsh` or `.dsh-beta`. The target should contain the active `settings.yaml` and `profiles/desktop`.

After exiting DSH:

```powershell
.\scripts\Configure-Stack.ps1 `
  -DesktopRoot 'D:\Apps\DSH Desktop Beta' `
  -RuntimeBin 'D:\KVMem\bin' -ModelsDir 'D:\Models\Chat' `
  -DshHome 'D:\ExistingDSHData' -IntegrateExisting `
  -Model iq3 -Profile bootstrap
```

The script backs up settings, the root patch and top-level desktop profile registration files under `backups/stack-TIMESTAMP` in that DSH_HOME, then:

- Replaces `local-llm` with the selected model configuration; the previous namespace remains in the backup.
- Merges `llm-pi-ai.providers.qqz-kvmem`, preserving other providers, credential references, permissions, MCP, image workflows and unrelated settings.
- Selects the local model as the default for new tasks and registers the repository's controller.
- Writes this repository's `local/launch.json` so Start.ps1 uses the same DSH_HOME.

Back up any custom controller source separately: registration metadata is not a source backup. If an old provider uses the same local server, do not run another persistent launcher. Existing tasks may retain their previous model selection; validate changes in a new task.

Do not force patches onto an incompatible DSH API version. Preserve that installation and use the pinned application with a separate DSH_HOME for comparison if necessary. Run only one Desktop instance at a time.

## 4. First launch and acceptance checks

```powershell
.\scripts\Diagnose.ps1 -Stage before-chat
.\scripts\Start.ps1
# Wait until the panel reports ready, then run:
.\scripts\Diagnose.ps1 -Stage chat-ready
Invoke-RestMethod http://127.0.0.1:18200/v1/models
Invoke-RestMethod http://127.0.0.1:18200/props
```

Start.ps1 launches Electron with `--disable-gpu` to reduce UI GPU usage; the controller owns the model process. Preflight checks existing model/ComfyUI processes, ports and free VRAM. The 12000 MiB free-memory threshold is conservative: **passing it does not prove the peak workload fits**. This script targets a single GPU and checks each reported card. On a multi-GPU system, identify the actual target; another card's free memory is not available to it automatically.

Create a new task. Test simple arithmetic, then a real read/write operation on a small workspace text file. Do not start with 100K input, a whole directory or many images. Confirm `/v1/models` returns the expected filename, rather than relying only on a healthy HTTP response. Record `nvidia-smi` at idle, after loading, at the first request's peak and after completion.

After passing, exit DSH and rerun the same Configure-Stack command with `-IntegrateExisting -Vision`. Restart and test one small, non-sensitive image. The controller should inject `--no-mmproj-offload --image-max-tokens 512`. Offloading the vision projector to the GPU competes with chat memory.

## 5. Four optional models and two profiles

| Choice | Backend / weight size | Initial `bootstrap` profile | Author's `desktop128` profile |
|---|---|---|---|
| iq3 | KVMem, about 11.29 GiB | 64K / Q5 KV / MTP1 | 128K / Q5 KV / MTP2 |
| qqz | KVMem, about 13.27 GiB | Same, with less VRAM headroom | Same |
| heretic | KVMem, about 13.35 GiB | Same, with less VRAM headroom | Same |
| bonsai | Custom NInfer, about 7.74 GiB | 32K INT8 KV, MTP off, text only | 128K INT8 KV, MTP off, text only |

`scripts/stack-config.mjs` generates the first three models' parameters to avoid manual omissions:

| Parameter | bootstrap | desktop128 |
|---|---:|---:|
| `-c` logical context | 65536 | 131072 |
| `--kvmem-budget` retrieval budget | 8192 | 24576 |
| `--kvmem-gen-reserve` / `-n` | 4096 | 16384 |
| `-b` | 128 | 256 |
| `-ctk` / `-ctv` | q5_0 / q5_0 | q5_0 / q5_0 |
| MTP draft / KV | 1 / f16 | 2 / f16 |
| `-ngl` | 999 | 999 |
| Vision encoder | CPU, 512 image tokens | CPU, 512 image tokens |

bootstrap is the newly added low-budget acceptance profile. Its parameters have automated coverage, but full inference has not been validated on your friend's computer. desktop128 comes from the author's measured configuration, not a guarantee for every 16GB system. Logical context is different from the GPU KV budget: reducing `-c` alone may not fix OOM. Small budgets also handle large uncached input and summary replay less well; expand only after short tasks pass.

To switch to QQZ or Heretic, download the matching file, exit DSH and rerun the same configuration command with `-Model qqz` or `-Model heretic` plus `-IntegrateExisting`. Explicitly add `-Profile desktop128` to select the author's 128K profile. Change one variable at a time and retest. The three GGUF choices share slot A's file selection; they do not create four concurrent slots. After changing a file directly in the panel, use its model-list synchronization action; the configuration script sets these fields automatically.

A fifth, flagship configuration extends the bonsai path rather than replacing it: `Bonsai2-CRACK-PQ2.ninfer` on the CraneBW/ninfer-ternary-bonsai-ada engine allocates 262144/262144 with 4-bit KV + MTP draft 3 and sustains 100+ tok/s in daily use on both RTX 4080 machines here. It needs the newer engine build and self-converted artifacts; provenance, measurements and rollback: [CRACK-FLAGSHIP.md](CRACK-FLAGSHIP.md). The scripted `-Model` choices remain the four documented above; the flagship is configured by pointing slot B at the new artifact and engine.

See [Bonsai configuration and runtime prerequisites](BONSAI.en.md). The controller includes NInfer integration, but the author's custom CUDA binary is not distributed as a generic upstream installation.

## 6. Plugins and the long-session patch

Use this repository's `plugins/dsh-local-llm-controller` and the `dsh-image-gen` built during image setup. A separate DSH installation, provider or persistent vision server per model is unnecessary.

Long sessions may encounter `multimodal query replay failed or cancelled`; this does not necessarily mean OOM. The repository includes a version-pinned summarization patch:

```powershell
# Exit DSH first. Install only when the target application hash matches:
.\patches\compaction-replay-fix\Install.ps1 -DshAppRoot 'D:\Apps\DSH Desktop Beta\resources\app'
```

On a hash mismatch, stop and follow the [patch documentation](../patches/compaction-replay-fix/README.md). Do not remove verification to force an overwrite. Use one task during initial acceptance and disable automatic concurrent subagents; the controller refuses GPU handoff while other tasks are inferring.

## 7. Qwen-Image 2.1, ComfyUI and open-source workflows

Complete chat acceptance before this section. The package reproduces the previously validated **Q4_K_M + official INT8 encoder + BF16 VAE** baseline. Later encoder, INT8 diffusion and LoRA experiments on the author's computer are outside this troubleshooting baseline.

Prepare an existing, working ComfyUI CUDA Python environment, such as `python_embeded` in the official Windows portable distribution. The plugin installer does not build a complete CUDA environment from bare Python. Verify with that exact interpreter:

```powershell
& 'D:\ComfyUI_windows_portable\python_embeded\python.exe' -s -c 'import torch, gguf, safetensors, aiohttp, scipy, transformers, sentencepiece; print(torch.__version__, torch.version.cuda, torch.cuda.is_available())'
```

Fix missing modules in that ComfyUI environment first. Do not install them into system Python or blindly upgrade Torch/CUDA. The author's Python environment used Torch 2.13 / CUDA 13.0; KVMem's CUDA 13.2 runtime libraries form a separate dependency chain. The GPU driver must support both. Upstream installation entry point: [ComfyUI](https://github.com/Comfy-Org/ComfyUI).

Prepare these three files; sources and checksums are in the [extension manifest](../addons/qwen-image21/manifest.json):

```text
ImageRoot/models/diffusion_models/qwen-image-2.1-Q4_K_M.gguf
ImageRoot/models/text_encoders/qwen3vl_8b_int8_convrot.safetensors
ImageRoot/models/vae/qwen_image_2.1_vae_bf16.safetensors
```

Exit DSH and other ComfyUI instances, and use the same DSH_HOME:

```powershell
.\addons\qwen-image21\Install.ps1 `
  -PythonExe 'D:\ComfyUI_windows_portable\python_embeded\python.exe' `
  -WeightsDir 'D:\Models\ImageDownloads' `
  -DesktopRoot 'D:\Apps\DSH Desktop Beta' `
  -DshHome 'D:\ExistingDSHData' `
  -ImageRoot 'D:\ImageRuntime'
```

For the separate-data option, replace DshHome with this repository's absolute `local/dsh-home` path. WeightsDir accepts flat files or the three category directories. Verified weights are copied, not deleted; allow roughly 15GB for the extra copy plus sources, dependencies and outputs. With an existing matching layout, use ImageRoot/models as WeightsDir to reuse files in place. The installer refuses modified source checkouts. Use Configure.mjs to reconfigure an already prepared runtime; see the [extension guide](../addons/qwen-image21/README.md).

Workflow sources: [official Qwen prompts](https://github.com/QwenLM/Qwen-Image-2.1/tree/main/prompt_rewrite/prompts), [ComfyUI-GGUF](https://github.com/leejet/ComfyUI-GGUF), [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen), and [SevnFading workflow reference](https://www.runninghub.cn/post/2101856561537830914). Runnable local API graphs are included, so Codex need not reconstruct nodes from tutorial layouts.

| Workflow | Purpose | Baseline |
|---|---|---|
| Qwen-Image 2.1 Q4_K_M | Basic text-to-image | 25 steps |
| Qwen-Image 2.1 Advanced T2I | Prompt-enhanced text-to-image | 40 steps, CFG1, Euler/simple, about 1MP |
| Qwen-Image 2.1 Advanced I2I | Single/multiple reference editing | Same, with deterministic image order |

CLIPLoader must use `type=qwen_image, device=cpu`; diffusion uses UnetLoaderGGUF. Start with batch_size=1 and an image around 1024 pixels per side. The tested cache node uses auto/default. Do not invent CPU/int8 enum values; inspect `/object_info` from the pinned ComfyUI before changing them. Leave upscaling, SeedVR2/VOSR2 and extra LoRAs disabled to avoid additional memory variables.

The sequence is: chat prompt rewrite → chat process exits → dedicated ComfyUI starts on 8191 with lowvram → image generation → ComfyUI exits → original chat model/slot/preset is restored. **Do not keep this ComfyUI running manually or bypass the controller with another graph in an existing ComfyUI instance.** If image-process shutdown fails, the controller does not reload chat over it.

Restart DSH and create a new task: generate a landscape, edit one ordinary reference into watercolor, then ask a simple question to confirm chat recovery. Port 8191 should listen during generation and be released afterward. Verify the image card, successful tool result and final chat reply. Cancellation recovery has unit coverage; live cancellation during sampling has not been claimed as tested.

## 8. Troubleshoot OOM by failure stage

| Stage / symptom | Inspect first | Response order |
|---|---|---|
| Little free memory before loading | Other llama/Ollama/ComfyUI, browsers, GPU apps | Exit owners normally and repeat inventory; do not kill unknown processes |
| OOM loading chat | Actual KVMem runtime/command line, Q5 KV, MTP, budgets, projector | Return to bootstrap, prefer IQ3, use text mode; record persistent failure before expanding |
| Failure only with large input or summaries | CUDA vs replay errors, uncached input size, RAM | Reproduce with small input and check the summary patch; do not mislabel replay as CUDA OOM |
| OOM starting generation | Whether chat exited; another resident ComfyUI | Fix GPU handoff; do not run chat and diffusion together |
| OOM encoding references | CPU CLIPLoader, available RAM, reference count | Use one small reference; check RAM/pagefile |
| OOM in sampling/VAE | Output size, batch, upscaling, extra nodes | Batch1, start at 512/768 then 1024, keep lowvram, identify the failing node |
| OOM restoring chat | Remaining ComfyUI/8191, newly started GPU apps | Confirm diffusion has released memory before retrying chat |
| Bonsai startup failure | Wrong upstream 5090 build, KV/concurrency, 256K | Use the matching custom build, 32K/one lane; do not apply KVMem flags |

When lowering image size, change the effective workflow/call dimensions. Advanced rewriting may return to about 1MP, so use the basic graph for low-resolution troubleshooting and inspect actual queued parameters. A single `nvidia-smi` snapshot can miss peaks. Record the failing node/service log and GPU sampling times; matching hardware specifications are insufficient evidence.

A useful report includes repository commit, DSH/KVMem/ComfyUI versions, model/profile, whether DSH_HOME is separate, diagnostic JSON, failure stage and the last 30 error lines. **Do not upload settings.yaml, API keys, conversations, images or complete environment variables.** The repository does not guarantee that an unknown machine's workload fits 16GB.

## 9. Rollback, tests and Codex handoff

Exit DSH before changes. To roll back, restore `backups/stack-TIMESTAMP/settings.yaml` into the same DSH_HOME. If plugin registration changed, restore that backup's top-level profile files and re-register the original plugin source. Do not delete sessions or node_modules as a generic reset. To disable images, remove the image plugin and set enabled=false in `qwen-image21.json`. Use the summary patch's own Rollback.ps1. Original model weights remain available.

```powershell
node --test plugins/dsh-local-llm-controller/test/*.test.mjs addons/qwen-image21/test/*.test.mjs scripts/test/*.test.mjs
```

See the [deployment validation record](../evidence/deployment-pack-validation.json) for scope. Packaging did not restart the author's active models or reproduce the friend's OOM. Bonsai and the CUDA Python environment retain separate prerequisites.

Use the [Codex deployment task](CODEX-DEPLOY.en.md) for handoff. The release archive contains the committed repository sources. Keep hash verification and staged acceptance when using the archive; do not run every script concurrently.
