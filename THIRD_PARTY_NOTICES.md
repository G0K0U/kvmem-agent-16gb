# 第三方来源

- `plugins/dsh-local-llm-controller` 源于 https://github.com/Lbunc/dsh-local-llm-controller ，基线 commit `87f23f187aad397f0040d8d192c6d9ad83320f85`。保留目录中的 MIT LICENSE。本地适配包含 KVMem 参数面板、CPU 视觉编码器、MTP、上下文/预算及 DSH 配置同步。该副本并非上游原样发布版本。
- KVMem：https://github.com/kvmem/kvmem-llama.cpp ，下载时遵循其版本对应 LICENSE/第三方条款。本仓库不再分发其二进制或源码。
- DSH Desktop：https://github.com/anywhere-labs/dsh-desktop ，社区桌面壳；Harness：https://github.com/deepseek-ai/deepseek-harness 。各自许可证以固定版本上游为准。
- QQZ GGUF：https://huggingface.co/QQZ2026/Qwen3.8-27B-ZeroRefusal-UD-IQ4_XS-MTP-GGUF 。权重及衍生模型许可遵循对应模型卡和基础模型条款；根目录 MIT 不适用于下载权重。

此仓库是个人部署快照，不代表以上项目官方背书。

## Qwen-Image 2.1 可选扩展

四模型部署另参考 [ISTA-DASLab](https://huggingface.co/ISTA-DASLab/Qwen3.8-27B-GSQ-RCO-GGUF)、[Bucoid](https://huggingface.co/Bucoid/Qwen3.8-27B-Heretic-Ara-16GB-VRAM-IQ4-XS-MTP-GGUF)、[NInfer](https://github.com/Neroued/ninfer) 和 [Ada ternary 适配](https://www.modelscope.cn/models/shensanshu/ninfer-ada-ternary)。只提供来源、校验值、配置及控制器适配，不再分发这些权重或自定义 CUDA 引擎；下载文件遵循各自许可。

- `addons/qwen-image21/image-plugin-overlay` 是对 [shanliuling/dsh-image-gen](https://github.com/shanliuling/dsh-image-gen) 的修改文件，基线 `93528e0d474d4b30c99ffdfa140d70c87c3cef53`，保留该目录的 Apache-2.0 LICENSE。修改包括本地显存协调、提示词改写、参考图传递及高级工作流适配；不是上游原样版本。该目录使用其自身许可证，根目录 MIT 不覆盖其来源代码。
- 安装器从 [ComfyUI](https://github.com/Comfy-Org/ComfyUI) 和 [ComfyUI-GGUF](https://github.com/leejet/ComfyUI-GGUF) 下载固定版本；提交及文件校验值见扩展 `manifest.json`。下载项目遵循各自上游许可证。
- 官方提示词模板从 [QwenLM/Qwen-Image-2.1](https://github.com/QwenLM/Qwen-Image-2.1/tree/main/prompt_rewrite/prompts) 的固定提交下载并校验。本仓库不再分发模板或模型权重，相关许可遵循原始项目及模型卡。
- 高级 API 工作流参考用户提供的 SevnFading 教程与 [RunningHub 工作流](https://www.runninghub.cn/post/2101856561537830914)，按本地 GGUF 和现有节点重建；未收录原始教程、字幕或完整第三方工作流包。超分分支未启用。
