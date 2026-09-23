# 旗舰配置：Bonsai 2 CRACK PQ2 —— 100+ tok/s 与 256K 上下文

[English](CRACK-FLAGSHIP.md) | [简体中文](CRACK-FLAGSHIP.zh-CN.md)

本仓库目前最快的已验证配置：27B 三值 CRACK 模型，运行在自定义 NInfer 运行时上。2026-09-22 部署于 RTX 4080 16GB（sm_89），Windows，CUDA 13.2 / MSVC 14.44。**部署后，这里的两台 RTX 4080 电脑均以该配置作为日常主力，日常使用中解码速度稳定在 100+ tok/s。** 部署当日的单次严格基线测试（temperature 0、关闭 thinking、输出 256 token）为 98.9–99.1 tok/s；日常 Agent 流量在 MTP 草稿接受率高时更快——基准日志中工具调用类用例约 160 tok/s。

与 [Bonsai](BONSAI.md) 相同，该模型**不经 KVMem**：属于同一类自定义 NInfer 运行时前置条件，走相同的控制器启动契约（B 槽文本模式，后端 `127.0.0.1:18200` 由参数面板管理，保留原有 GPU 生图交接机制——本次未重新执行交接测试）。匹配的自定义 Windows/Ada NInfer 运行时和转换后的 `.ninfer` 权重仍是前置条件；普通 Bonsai GGUF 不能直接交给 `ninfer-serve`。

## 来源与固定版本

- 模型：[dealignai/Bonsai-2-27B-Ternary-CRACK-GGUF](https://huggingface.co/dealignai/Bonsai-2-27B-Ternary-CRACK-GGUF)，revision `3d36486a5fb2a3868116b8f6e768179e2391d28d`；GGUF SHA256 `5b24ea3eebc3e0bccd05fb474eb88b10c57699d71a5db2f29485e3789a70d55d`（下载后已校验）。
- 引擎：[CraneBW/ninfer-ternary-bonsai-ada](https://github.com/CraneBW/ninfer-ternary-bonsai-ada)，commit `ad6cb4645bbfee13d487578682c7b2a53f299e16`，CUDA 13.2.86 / MSVC 14.44，面向 sm_89 构建。
- 制品：`Bonsai2-CRACK-PQ2.ninfer`，8,306,927,628 字节，SHA256 `ea11022e5b275bcf115cde29146106d0f64ed9db83105f7900de3bcdfd00ca84`。

与之前的 Bonsai 制品相同：将 PQ2 GGUF 文本权重转换为 NInfer 制品，借用已有 Qwen3.8 模板的 tokenizer/frontend、视觉塔和 MTP 头。这**不是**模型作者直接发布的 NInfer 完整制品。本地 pack-check 的几何、类型和字节往返检查通过。Windows 构建适配：复用 NVTX 头，FFmpeg shared 依赖，只对需要 CCCL 的 CUDA 源文件启用 MSVC conforming preprocessor（其余大型模板否则编译极慢）。`Build.ps1` 可重建引擎。

小批量三值 MMA 阈值在本构建中默认 32；设置 `NINFER_TERNARY_MMA_MIN_TOKENS=64` 可回到上游阈值。没有单独对阈值做控制变量测量，不能把整体速度收益归因于它。

## 已验证配置

| 参数 | 值 |
|---|---|
| 上下文 / KV 容量 | 262144 / 262144 |
| KV 类型 | `rk4v4-e8`（4-bit） |
| MTP | draft 3 |
| 预填充分块 | 128 |
| 并发 | 1 |
| Host KV / host 状态 / 设备缓存状态 | 512 MiB / 2 / 1 |
| 最大输出 | 16384 |
| 思考预算 | 256 |

上下文容量与单次输出上限是不同参数。262144 四位 KV 分配成功；纯文本启动后引擎报告剩余显存约 1.61 GiB。DSH 模型 ID 为 `Bonsai2-CRACK-PQ2.ninfer`；原版 `Bonsai2-PQ2-MTP.ninfer` 制品通过新引擎兼容性测试，仍可选择。

## 实测（部署当日，单机）

同一台电脑、同一 CRACK 制品、相同 gardening 提示词、temperature 0、关闭 thinking、输出 256 token，每项单次运行——**非普遍速度保证**：

| 配置 | decode tok/s |
|---|---:|
| 原引擎，BF16 KV，8192 上下文，无 MTP | 62.37 |
| 新引擎，BF16 KV，8192 上下文，无 MTP | 63.47 |
| 新引擎，4-bit KV，262144 上下文，MTP 3 | 99.07 |
| DSH 控制器正式端口，新制品 | 98.87 |

最终配置整体提升约 59%——但 KV 类型、MTP 和上下文同时改变，无法独立量化任何单项。预填充：冷启动约 4590 token 约 914 tok/s；重复前缀第二轮命中 4581 token 缓存，首 token 约 305 ms。工具调用与工具结果续答、整数计算、约 4.6K 文本检索均通过。逐用例原始数据见 [crack-flagship-benchmarks.json](../evidence/crack-flagship-benchmarks.json)。

## 边界——依赖标题数字前先读

- 100+ tok/s 是两台 RTX 4080 部署后的日常使用经验；上表为单次短输出实测。两者都不保证长上下文解码始终维持该速度。
- **没有跑满 256K 的准确率或长期稳定性测试。** 262144 可分配、可服务；深层上下文的语义质量与多日稳定性未验证。
- DSH 的 Bonsai 路由仍为**文本模式**——视觉没有接入 DSH。独立测试端口开启视觉后，1200×1200 JPEG（红方块/蓝圆形及位置）识别正确。此前截图中"六张 2048×2048 图片"的说法未测试。现有生图/训练流程未改动。
- 显示名提示：切换后请以 `/v1/models` 返回的 ID `Bonsai2-CRACK-PQ2.ninfer` 确认实际模型，不要依赖显示名——控制器此前曾把所有 Bonsai 制品标成同一名称。

## 回退

只切回原版权重：在 DSH 选择 `Bonsai2-PQ2-MTP.ninfer`。如需连原引擎和原参数一起恢复：在任务空闲时运行回退脚本，它通过控制器请求重启，不直接终止模型进程。任何回退后，等待状态 ready 并核对实际模型 ID。改动前保留一份私有设置备份；设置备份切勿提交到仓库。
