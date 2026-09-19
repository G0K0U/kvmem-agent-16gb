# 第三方来源

- `plugins/dsh-local-llm-controller` 源于 https://github.com/Lbunc/dsh-local-llm-controller ，基线 commit `87f23f187aad397f0040d8d192c6d9ad83320f85`。保留目录中的 MIT LICENSE。本地适配包含 KVMem 参数面板、CPU 视觉编码器、MTP、上下文/预算及 DSH 配置同步。该副本并非上游原样发布版本。
- KVMem：https://github.com/kvmem/kvmem-llama.cpp ，下载时遵循其版本对应 LICENSE/第三方条款。本仓库不再分发其二进制或源码。
- DSH Desktop：https://github.com/anywhere-labs/dsh-desktop ，社区桌面壳；Harness：https://github.com/deepseek-ai/deepseek-harness 。各自许可证以固定版本上游为准。
- QQZ GGUF：https://huggingface.co/QQZ2026/Qwen3.8-27B-ZeroRefusal-UD-IQ4_XS-MTP-GGUF 。权重及衍生模型许可遵循对应模型卡和基础模型条款；根目录 MIT 不适用于下载权重。

此仓库是个人部署快照，不代表以上项目官方背书。
