# Deployment work in this repository

Read `docs/DEPLOYMENT.md` and `docs/CODEX-DEPLOY.en.md` before deployment (Chinese: `docs/DEPLOYMENT.zh-CN.md` and `docs/CODEX-DEPLOY.md`). Use the stage-based diagnostic workflow; a 16GB hardware label is not a memory-fit guarantee.

- Start with one chat model, `bootstrap`, text mode. Never start independent chat/ComfyUI services alongside the DSH controller.
- Preserve existing DSH settings outside explicitly selected namespaces. Use `Configure-Stack.ps1 -IntegrateExisting` for a backed-up merge. Confirm the actual DSH_HOME from the installation, not an assumed default.
- Keep pinned versions and verified hashes. Never substitute ordinary llama.cpp for KVMem or upstream latest NInfer for the custom Windows/Ada build.
- `docs/BONSAI.md` documents a real prerequisite gap: this repository does not contain the complete custom NInfer build/packing toolchain. Do not claim four-model clean-machine installation when only three GGUF backends are deployable.
- Keep Python environments separate. Do not upgrade Torch/CUDA as a generic missing-module fix. Do not introduce untested image-model/LoRA/upscaler changes into an OOM reproduction.
- Do not commit credentials, settings backups, diagnostic files, weights or user media. Keep local artifacts under ignored `local/`.
- State which validations actually ran. Static tests do not prove GPU inference or clean-machine installation. Use non-sensitive text and images for smoke tests.
