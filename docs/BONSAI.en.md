# Fourth optional model: Bonsai / NInfer

[**English**](BONSAI.en.md) | [简体中文](BONSAI.md)

Bonsai does not use KVMem. This repository provides its controller launch contract, text-only UI restrictions, GPU handoff and 32K/128K settings. **A matching custom Windows/Ada NInfer runtime and converted `.ninfer` weights remain prerequisites.** Ordinary Bonsai GGUF cannot be passed directly to ninfer-serve, and upstream-latest 5090/NVFP4 commands are not a substitute.

Author's build provenance:

- [NInfer](https://github.com/Neroued/ninfer) baseline `d139d3388c350981dde61b33126ed93eb11a72c2`.
- [Ada ternary patches](https://www.modelscope.cn/models/shensanshu/ninfer-ada-ternary), revision `61c391fa662616bd1a6d1f188001dc969765bc4f`, plus local Windows/Ada, arithmetic and media-disable adaptations. The baseline and public patches alone do not reproduce the final local build.
- CUDA 13.2.86, MSVC 19.44.35228, sm_89, text path; final ternary MMA optimization is not enabled.
- Tested executable SHA256: `8f78cf7da8adfbff5769d938e03c48cb0ac815eec6d3b00523b991c2558bc8b7`.
- `Bonsai2-PQ2-MTP.ninfer`: 8306927628 bytes, SHA256 `05bbbf01090c6f61113b54556daa22ad0b45036a078af6cd6f02a3fde47ad76c`.
- Source GGUF SHA256: `3907dc1658db1f78a9826bf8d5bcb8dc65db0d466388937af57f2294fae62ec1`; historical template revision `3526913004b1cf552cb57b88d6a5c6f5e4a89a70`, SHA256 `eec39564993d6e9c7d5e383382a760f093465c9d163ec9a1bd6b80199514bf3e`.

The complete custom-engine build/artifact-conversion toolchain, binaries, weights and credentials are not distributed here. Without compatible artifacts, deploy the other three GGUF choices first and **stop at Bonsai runtime preparation**. Do not report a completed one-click four-model clean installation. The configuration script verifies the final weight hash and does not download a substitute. Executable hashes can change with the toolchain; the value above identifies the author's build and cannot replace functional checks.

With a compatible runtime/artifact already available, confirm `ninfer-serve.exe --help` supports these parameters, exit DSH and other services, then configure:

```powershell
.\scripts\Configure-Stack.ps1 `
  -DesktopRoot 'D:\Apps\DSH Desktop Beta' `
  -RuntimeBin 'D:\KVMem\bin' -ModelsDir 'D:\Models\Chat' `
  -DshHome 'D:\ExistingDSHData' -IntegrateExisting `
  -Model bonsai -QwenModel iq3 -Profile bootstrap `
  -NinferBin 'D:\NInfer\build\apps' -BonsaiDir 'D:\Models\Bonsai'
```

Slot A retains Qwen for prompt enhancement and visual reference rewriting, requiring its matching mmproj. Slot B runs Bonsai text mode; the models are not resident concurrently. Validate text, tool use and switching in both directions before image generation. Do not advertise image input for Bonsai. Image tools can use workspace file paths so the chat backend does not attempt to decode inline images first.

| Parameter | bootstrap | desktop128 |
|---|---|---|
| max-context / kv-capacity |32768 /32768 |131072 /131072 |
| kv-dtype | int8 | int8 |
| max-concurrency / prefill-chunk |1 /128 |1 /128 |
| host-kv-mib |512 |512 |
| host-state-slots / device-state-slots |2 /1 |2 /1 |
| default-thinking-budget |256 |256 |
| default-max-tokens |4096 |131072 |
| MTP | Off | Off |

The output ceiling does not mean 128K input plus 128K output fit together: they share the context capacity. The author's 128K setting passed capacity allocation and roughly 15K input/summary tests, not full 128K semantic-quality validation. 256K previously failed for insufficient VRAM **on this earlier engine build with INT8 KV and MTP off**. Do not automatically increase context to 256K or raise concurrency when copying this configuration.

## Superseded for the CRACK artifact: 256K + MTP on the newer engine

The table above describes `Bonsai2-PQ2-MTP.ninfer` on the earlier NInfer build. The newer [CRACK artifact + engine combination](CRACK-FLAGSHIP.md) (`Bonsai2-CRACK-PQ2.ninfer` on CraneBW/ninfer-ternary-bonsai-ada) changes the envelope: 262144/262144 allocates with 4-bit KV (`rk4v4-e8`) + MTP draft 3, leaving about 1.61 GiB VRAM free, at a 98.9–99.1 tok/s single-shot decode baseline on RTX 4080 — and both RTX 4080 machines here sustain 100+ tok/s in daily use after that deployment. The original artifact also passes new-engine compatibility, so both artifacts share the slot. Full-256K accuracy and long-term stability are still not validated; see the flagship document for provenance, measurements and rollback.
