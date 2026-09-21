# 第四个可选模型：Bonsai / NInfer

Bonsai 不使用 KVMem。仓库现在提供其控制器启动契约、文本模式UI限制、显存交接以及32K/128K配置。**运行时前提仍是匹配的自定义 Windows/Ada NInfer 和转换后的 `.ninfer` 权重。** 不能将普通 Bonsai GGUF 直接交给 ninfer-serve，也不能使用上游 latest 的5090/NVFP4命令替代。

作者构建溯源：

- [NInfer](https://github.com/Neroued/ninfer) 基线 `d139d3388c350981dde61b33126ed93eb11a72c2`。
- [Ada ternary补丁来源](https://www.modelscope.cn/models/shensanshu/ninfer-ada-ternary)，版本 `61c391fa662616bd1a6d1f188001dc969765bc4f`，另有本地 Windows/Ada、算术及媒体禁用适配。仅克隆基线加公开补丁不等于作者最终构建。
- CUDA 13.2.86，MSVC 19.44.35228，sm_89，文本路径；最终三元MMA优化未启用。
- 已测 exe SHA256：`8f78cf7da8adfbff5769d938e03c48cb0ac815eec6d3b00523b991c2558bc8b7`。
- 模型 `Bonsai2-PQ2-MTP.ninfer`：8306927628 bytes，SHA256 `05bbbf01090c6f61113b54556daa22ad0b45036a078af6cd6f02a3fde47ad76c`。
- 源GGUF校验：`3907dc1658db1f78a9826bf8d5bcb8dc65db0d466388937af57f2294fae62ec1`；历史模板版本 `3526913004b1cf552cb57b88d6a5c6f5e4a89a70`，SHA256 `eec39564993d6e9c7d5e383382a760f093465c9d163ec9a1bd6b80199514bf3e`。

本包未发布这一自定义引擎的完整构建/制品转换工具链，也未发布二进制、权重或凭据。若朋友没有兼容制品，先部署另外三个 GGUF，**停在 Bonsai 运行时准备阶段**，不能向 Codex 声称“一键四模型全新安装已完成”。配置脚本不自动下载替代模型；它会核对成品权重哈希。编译出的 exe 哈希会随工具链变化，以上值用于识别作者原构建，不能代替功能测试。

已有兼容运行时及制品时，先核对 `ninfer-serve.exe --help` 支持本文参数，退出DSH和其他服务，再配置：

```powershell
.\scripts\Configure-Stack.ps1 `
  -DesktopRoot 'D:\Apps\DSH Desktop Beta' `
  -RuntimeBin 'D:\KVMem\bin' -ModelsDir 'D:\Models\Chat' `
  -DshHome 'D:\ExistingDSHData' -IntegrateExisting `
  -Model bonsai -QwenModel iq3 -Profile bootstrap `
  -NinferBin 'D:\NInfer\build\apps' -BonsaiDir 'D:\Models\Bonsai'
```

槽位A保留Qwen供提示词增强和参考图视觉改写；需要其匹配的mmproj。B槽使用Bonsai文本模式，两者不会常驻并行。先验收文本、工具调用和双向切换，再做生图。Bonsai不应被注册为支持图片输入；图像工具可通过工作区图片路径调用，避免聊天后端先尝试解码图片。

| 参数 | bootstrap | desktop128 |
|---|---|---|
| max-context / kv-capacity | 32768 / 32768 | 131072 / 131072 |
| kv-dtype | int8 | int8 |
| max-concurrency / prefill-chunk | 1 / 128 | 1 / 128 |
| host-kv-mib | 512 | 512 |
| host-state-slots / device-state-slots | 2 / 1 | 2 / 1 |
| default-thinking-budget | 256 | 256 |
| default-max-tokens | 4096 | 131072 |
| MTP | 关闭 | 关闭 |

输出上限不是保证可以同时输入128K再输出128K；输入输出共享上下文容量。作者128K配置完成容量分配及约15K输入/摘要测试，没有满128K语义质量证明；256K曾因显存不足失败。不要在复制配置时自动升级到256K或提高并发。
