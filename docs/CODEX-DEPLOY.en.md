# Codex deployment task for another computer

[**English**](CODEX-DEPLOY.en.md) | [简体中文](CODEX-DEPLOY.md)

Give Codex the repository URL and the following task:

> Read docs/DEPLOYMENT.md before deploying on this computer. First perform a read-only inventory of the GPU/free VRAM, RAM, model-service processes, DSH application directory and actual DSH_HOME. Run scripts/Diagnose.ps1 -Stage inventory. Do not assume 16GB VRAM can hold all components concurrently.
>
> When reusing installed DSH, prefer the same application with a separate data directory. If I choose integration into existing data, use Configure-Stack.ps1 -IntegrateExisting, back up first and preserve other providers, permissions and plugins. Do not replace settings.yaml wholesale or publish my private configuration.
>
> Start with IQ3 + bootstrap in text mode, with one controller owning KVMem. Verify /health, /v1/models, short text, real tool calls and memory use before enabling CPU-projector vision. Explicitly select desktop128 and repeat acceptance if 128K is needed. On OOM, stop increasing the workload and record the failure stage. Do not substitute ordinary llama.cpp for KVMem or invent parameters.
>
> The four models are optional and sequential. QQZ/Heretic/IQ3 use GGUF+KVMem. Bonsai requires the custom NInfer runtime and finished artifact described in docs/BONSAI.en.md. If unavailable, report the missing prerequisite and complete the GGUF setup first. Do not substitute upstream latest or rename file extensions to pretend compatibility.
>
> Once chat is stable, reuse a working ComfyUI CUDA Python environment and install the Qwen-Image companion at the pinned commits. Begin with Q4_K_M, the official INT8 encoder, BF16 VAE and one approximately 1MP image. Keep the encoder on CPU and launch ComfyUI on demand with lowvram. Chat must exit before generation; ComfyUI must exit before chat restoration. Do not keep another ComfyUI resident. Test a landscape generation and one ordinary reference-image edit before increasing load.
>
> Do not automatically add LoRAs, upscaling, unverified INT8 diffusion or encoder experiments. Do not terminate unrelated processes. At each stage report commands run, model IDs, effective parameters and results, separating static checks, historical author measurements and new local tests. Finish with sanitized diagnostics and rollback locations.
