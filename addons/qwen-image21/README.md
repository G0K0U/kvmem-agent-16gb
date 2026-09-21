# Qwen-Image 2.1 companion for KVMem + DSH

[简体中文](README.zh-CN.md)

**This image-generation configuration works alongside this repository's KVMem + DSH stack** (sometimes referred to as “KVMan + DSH”). It shares the GPU sequentially: local Qwen rewrites the prompt → the controller unloads the chat model → ComfyUI generates/edits the image → ComfyUI exits → the original chat model and preset are restored. It does not require both models to fit in VRAM at once.

## Included

- Basic text-to-image and advanced text-to-image/image-editing API workflows using the existing **Qwen-Image 2.1 Q4_K_M** weights.
- Official Qwen prompt templates fetched at a pinned revision and SHA-256 checked. The installed local Qwen chat model performs rewriting; this is **not** the dedicated fine-tuned rewrite model in the tutorial.
- Strict parsing of `rewritten_prompt`, `wh_ratio`, and `ratio_follow`; ratio metadata is applied to the graph instead of passed as raw JSON to the image model.
- Ordered references for editing, QwenImage21Cache, Euler/simple, CFG 1, 40 steps, approximately 1 megapixel. The basic workflow keeps its 25-step preset.
- An overlay for pinned `dsh-image-gen` 0.6.10: default `generate_image` uses Advanced T2I; default `edit_image` selects Advanced I2I automatically. Image cards remain visible while the local chat model receives a text result. Generated-image references remain available for subsequent edits through presentation metadata.
- Bounded stream handoff, concurrency protection, cleanup and restoration on errors/cancellation. If the owned image process cannot be confirmed stopped, the controller does not reload the chat model over it.

**SeedVR2/VOSR2 upscaling is not enabled.** Those branches require separate models. UI-only layout, preview and switch nodes from the tutorial are represented by two runnable API graphs instead of installing every third-party UI node.

## Install after the main KVMem + DSH setup

Requires Windows, the pinned DSH Desktop stack, Node.js 24, Git, pnpm 11.7, and an **existing working ComfyUI CUDA Python environment** with its standard dependencies and GGUF dependencies (`gguf`, etc.). A bare Python environment is insufficient. The original desktop used Torch 2.13 + CUDA 13.0. The script adds five pinned packages to an isolated `deps` directory; it does not replace your Torch installation.

Obtain these weights from [the model repository](https://huggingface.co/abenzerps/Qwen-Image-2.1-Uncensored-GGUF) under its applicable license, or reuse your existing copies:

| File | Destination under the image root |
| --- | --- |
| `qwen-image-2.1-Q4_K_M.gguf` | `models/diffusion_models/` |
| `qwen3vl_8b_int8_convrot.safetensors` | `models/text_encoders/` |
| `qwen_image_2.1_vae_bf16.safetensors` | `models/vae/` |

Fully exit DSH, then run from the repository root:

```powershell
.\addons\qwen-image21\Install.ps1 `
  -PythonExe 'D:\ComfyUI\python_embeded\python.exe' `
  -WeightsDir 'D:\Models\QwenImage21'
```

`WeightsDir` can be a flat directory or contain the three category folders above. Weights are SHA-256 verified and copied, never deleted. Budget about 15 GB for an additional copy plus source/dependency space. To reuse in-place files, set `-ImageRoot` to their parent (with the weights already under `ImageRoot/models/...`) and `-WeightsDir` to `ImageRoot/models`.

Defaults are the repository's dedicated `local/dsh-home`, `local/qwen-image21`, and the desktop root saved in `local/launch.json`. For another existing installation, pass all relevant paths explicitly:

```powershell
.\addons\qwen-image21\Install.ps1 `
  -PythonExe 'D:\ComfyUI\python_embeded\python.exe' `
  -WeightsDir 'D:\Models\QwenImage21' `
  -DesktopRoot 'D:\Apps\DSH Desktop Beta' `
  -DshHome 'D:\DSHData' `
  -ImageRoot 'D:\ImageRuntime'
```

The installer clones pinned ComfyUI/GGUF/image-plugin sources, applies the source overlay, builds the plugin, registers both plugins through the desktop CLI, backs up settings, and writes `qwen-image21.json` into the selected DSH home. It preserves chat settings and unrelated workflows. It refuses modified pre-existing source checkouts; use a fresh image root rather than overwrite local customizations. For an already prepared runtime, `Configure.mjs` can merge configuration without recloning. Do not install over an unrelated custom controller without backing it up: the script installs this repository's controller.

Start DSH using your existing launcher (with the same `DSH_HOME`). With the standard repository setup, use `scripts/Start.ps1`. **Do not start a second ComfyUI on port 8191.** The controller owns that port/process only during an image task. The optional extension is dormant when `qwen-image21.json` is absent.

## Use in chat

- Text-to-image: “Generate an anime illustration of an adult explorer on a mountain bridge, morning light, landscape 3:2.”
- Editing: provide an image in the conversation or an explicitly named image **inside the task workspace**, then ask `edit_image` to turn it into a watercolor while retaining the pose and composition.
- Multiple references: supply `source_paths` or `source_attachment_ids` in order and refer to image 1, image 2, etc. Both rewriting and ComfyUI use the same order.

Keep a Qwen model configured in the active slot or slot A. Editing requires its matching vision projector. The rewriter temporarily selects vision mode when needed and restores the original slot/mode/preset afterward. The runtime uses the controller's configured chat port and API key; image traffic stays on localhost.

The interface accepts up to 16 references; real tests covered one and two. CPU text/vision encoding makes edits slower than plain generation. Uploads must also be supported by the calling chat backend; if it cannot decode an inline image before tool use, provide a workspace image path. External clients sending requests directly to the chat HTTP port are outside DSH's scheduling guard.

## Validation and limits

[Sanitized validation record](../../evidence/qwen-image21-validation.json). Real desktop checks: advanced T2I, two-reference I2I, and a Bonsai-originated single-image edit with temporary Qwen rewriting all generated files, restored the original model and completed the final chat reply. Basic generation had previously passed with Heretic, IQ3, QQZ and Bonsai. Advanced IQ3/QQZ runs were not repeated. Cancellation recovery has unit coverage; live cancellation during sampling was not tested.

**Bonsai/NInfer is evidence from the author's separate local backend integration, not an engine installed by this add-on.** The public companion integrates with the GGUF/KVMem controller shipped in this repository. Do not replace a custom NInfer controller with this one expecting that engine support to be added.

The portable installer was validated with syntax, configuration and transaction tests; a second clean-machine CUDA installation has not been performed. The real images were generated on the original desktop deployment. These are distinct validation scopes.

```powershell
node --test plugins/dsh-local-llm-controller/test/*.test.mjs addons/qwen-image21/test/*.test.mjs
```

The pinned plugin overlay's adapter/reference tests also passed (44 tests) against its upstream checkout. On Windows, run directory-junction tests with an NTFS temporary directory; exFAT does not support them.

A broader upstream suite run passed 350/352 tests. Two remaining failures are an upstream assertion that still expects all multi-image ComfyUI editing to be rejected, and a workspace-save junction test returning `EEXIST` on this Windows environment. The complete upstream suite is therefore not reported as passing.

## Rollback and sources

For 25-step generation without enhancement, select `Qwen-Image 2.1 Q4_K_M` in DSH image settings. To disable the extension, exit DSH, remove the image plugin from the desktop profile and set `enabled: false` in `qwen-image21.json`. Restore the settings backup if desired. Keep the runtime/models for reuse. Never roll back during a model task.

- [Qwen official prompt templates](https://github.com/QwenLM/Qwen-Image-2.1/tree/main/prompt_rewrite/prompts)
- [ComfyUI](https://github.com/Comfy-Org/ComfyUI), [GGUF nodes](https://github.com/leejet/ComfyUI-GGUF), [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen)
- [SevnFading advanced workflow/tutorial reference](https://www.runninghub.cn/post/2101856561537830914)
- Pins and hashes: [manifest.json](manifest.json). The original tutorial JSON, model weights, generated images, private settings and conversation logs are not redistributed.
