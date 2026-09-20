[English](README.md) | [**简体中文**](README.zh-CN.md)

<p align="center">
  <img src="assets/linkedin/architecture-16gb.png" alt="16GB 显存本地 Agent 栈:DSH Desktop → 参数面板 → KVMem 服务 → GGUF,含 GPU/RAM 内存布局" width="620">
</p>

# 27B 本地编程 Agent,跑在 16GB 显存上

> 一个可部署、可复现的 Windows 本地 Agent 栈,面向 **16GB 显存 + 32GB 内存的消费级硬件档位**。

**一个仓库。一次部署。完全本地。**

在单张消费级 GPU 上运行 27B 编程 Agent:

**DSH Desktop → 参数面板 → KVMem(llama.cpp 分支)→ GGUF**

语言模型完整 GPU offload,长上下文 KV 缓存驻留系统内存——16GB 显存因此仍能胜任长上下文编程与 Agent 任务。两个模型槽位接受**任意 GGUF**,每个启动参数——上下文、MTP 草稿数、KV 预算——都能在面板中编辑。

**验证环境**

| | |
|---|---|
| **GPU** | RTX 4080 — 16GB 显存 |
| **内存** | 32GB |
| **模型** | Qwen3.8 27B 社区 IQ4_XS MTP 量化 |
| **日常预设** | 64K 上下文 / MTP2 |
| **平台** | Windows |

## 在真实桌面上实测

| | 结果 |
|---|---:|
| 真实 10 次调用编程 Agent 会话 | **加权 32.05 tok/s** |
| 长上下文解码 | **约 20K 至 155K 输入保持 14–20 tok/s** |
| 实用日常上下文档位 | **64K** |
| MTP 推测解码 | **草稿 2,实测会话零 replay 错误** |

以上数字在日常桌面环境下测得——浏览器、编辑器、聊天软件全程后台开启——而非静默的基准测试机。

> **32.05 tok/s 是会话加权吞吐,不等于"155K 上下文按 32 tok/s 解码"。** 该会话实际峰值上下文约 27K token。方法、数字与边界见[成功案例](docs/CASE-STUDY.md)。

<p align="center">
  <img src="assets/linkedin/capacity-curve-16gb.png" alt="从 20K 到 155K 输入 token,解码速度保持在 14–20 tok/s" width="420">
</p>

## 快速开始

需要 Windows x64、与固定 CUDA 运行时匹配的 NVIDIA 驱动、**16GB 显存 + 32GB 内存**、Node.js 24(原环境 24.19.0)、PowerShell、Git 和 curl。模型约 14.25GB,视觉编码器约 0.93GB。模型运行时日常后台软件(浏览器、编辑器、聊天)可以保持开启——上面的数字就是在该条件下测得的;关闭 ComfyUI、游戏等 GPU 重载即可。

**三条命令。唯一需要交互的步骤是 DSH Desktop 安装程序。**

```powershell
.\scripts\Download.ps1 -Models
```

下载 KVMem 运行时、DSH Desktop 安装包、模型和视觉编码器。每个文件都对照固定 SHA256 校验;中断留下的 `.part` 下次会重新下载。

运行一次 `downloads\` 中的 DSH Desktop 安装程序——这是唯一的手动步骤。

```powershell
.\scripts\Deploy.ps1
```

解压 KVMem 运行时,定位 DSH Desktop 安装(依次尝试:`-DesktopRoot` 参数 → 已有 `local/launch.json` → 注册表 → 标准安装路径 → 开始菜单快捷方式;装在自定义位置时传 `-DesktopRoot`),在 Git 忽略的 `local/dsh-home` 中生成独立配置,通过桌面 CLI 安装面板插件,启动整套栈并等待模型 API 报告健康(首次模型加载可能需要几分钟)。

然后打开 DSH Desktop,选择内置的 **64K / MTP2** 预设。

> 模型权重与上游二进制均从原始来源下载,并对照 [assets.json](config/assets.json) 中的固定哈希校验。本仓库不分发它们。

<details>
<summary><strong>手动部署(替代 Deploy.ps1)</strong></summary>

```powershell
.\scripts\Configure.ps1 `
  -DesktopRoot 'D:\Apps\DSH Desktop Beta' `
  -RuntimeBin 'D:\Models\kvmem\bin' `
  -ModelsDir "$PWD\downloads" `
  -NodeExe 'node'
```

`DesktopRoot` 必须含 `DSH Desktop Beta.exe` 与 `resources/app/lib/desktop-cli.js`(可通过快捷方式的"打开文件所在位置"找到)。安装脚本调用桌面专用 CLI 的 `plugin --profile desktop add ... --ignore-scripts`,不要改用另一套全局 dsh。数据写入 Git 忽略的 `local/dsh-home`,工作目录为 `local/workspace`;不会覆盖已有 DSH 用户目录,重复运行会拒绝覆盖。插件安装中断时,手动设置 `DSH_HOME` 为这个独立目录再重试 desktop-cli 插件命令。完全退出其他 DSH Desktop 和占用 18200/43189 端口的服务,再运行 `.\scripts\Start.ps1` 与 `.\scripts\Health.ps1`。

</details>

## 为什么做这个

16GB 显存 + 32GB 内存是本地 AI 现实的消费级硬件档位,但装下模型只是问题的一半:长上下文 Agent 负载还需要内存放 KV 缓存、工具、运行时进程,以及桌面本身。

KVMem 改变了内存划分:

**GPU(16GB)**

- 27B 语言模型,完整 offload
- 热 KV 检索窗口
- CUDA 推理

**系统内存(32GB)**

- 完整历史 KV 缓存
- 长上下文状态
- 验证配置中的 CPU 侧视觉编码器

这不是一个新的推理引擎。本仓库把现有开源组件整合为一个**可复现的 Windows 本地 Agent 系统**:部署脚本、参数管理、固定版本、验证证据与成文的失败边界。

## 架构与固定版本

```text
DSH Desktop → 本地参数面板管理模型进程
           → OpenAI-compatible API 127.0.0.1:18200/v1
           → KVMem CUDA → GGUF(语言模型 GPU / 视觉编码器 CPU)
```

| 组件 | 固定版本 / 来源 |
|---|---|
| QQZ(默认模型) | [IQ4_XS V3 Final MTP](https://huggingface.co/QQZ2026/Qwen3.8-27B-ZeroRefusal-UD-IQ4_XS-MTP-GGUF),revision `e45b6a3a3c137c11df9da4a79cfae82fdd7faaa3` |
| KVMem | [v0.16.0-rc2](https://github.com/kvmem/kvmem-llama.cpp/releases/tag/v0.16.0-rc2),Windows CUDA 13.2.86 |
| DSH Desktop | [2.0.12-beta.1](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.12-beta.1),社区桌面客户端 |
| DeepSeek Harness | 桌面版内置 `0.1.6-alpha.2` |
| 参数面板 | [Lbunc/dsh-local-llm-controller](https://github.com/Lbunc/dsh-local-llm-controller),基于 `87f23f187aad397f0040d8d192c6d9ad83320f85` 的本地 KVMem 适配版 `2.0.4-kvmem.1` |

这些是固定版本,不追踪 latest。下载地址与 SHA256 在 [assets.json](config/assets.json)。仓库不分发模型权重和上游二进制。

## 哪些是通用的,哪些是固定的

| 通用——可换用其他模型 | 本仓库中固定 |
|---|---|
| 双模型槽位(A/B);每个槽位可指向任意 GGUF 文件夹,自动识别 `mmproj`,同一时间只运行一个模型进程 | `assets.json` 固定 QQZ IQ4_XS V3 模型 + F16 视觉投影,`Download.ps1` 一条命令带 SHA256 校验 |
| 八组启动参数全量可编辑(2 槽位 × 文本/视觉 × fast/long) | `settings.template.json` 预设按 27B / 66 层模型调优:64K、MTP2、q5_0 KV、预算 32K |
| 模型显示名由 GGUF 文件名派生,可在模型页重命名 | 实测数字仅在 QQZ 模型上取得 |
| `serverExe` 可配置(`llama-kvmem-server.exe`;Linux/macOS 为 `llama-server`) | DSH Desktop 与 DeepSeek Harness 版本固定 |

面板在应用配置时按如下包络校验:上下文 ∈ {64K, 128K, 192K, 256K};`--kvmem-budget` ∈ {8K … 48K}(8K 步进);`--kvmem-gen-reserve` ∈ {4K, 8K, 16K};预算 + 预留 ≤ 上下文;MTP 草稿数 1–4;`-ngl` ≥ 66(保持完整 GPU offload)。该包络对应 16GB 显存上的 27B 级 MTP GGUF。其他模型可通过同样的槽位加载,但包络之外的内容不在本仓库测试范围内,且 MTP 预设假定模型为 MTP-enabled GGUF。

## 日常使用与参数面板

在 DSH 设置中打开 Local LLM Controller / QQZ-KVMem 卡片。默认 A 槽、vision 模式、fast 参数组为 **64K / MTP2**。CPU 视觉编码器保留在这个模式中。选择上下文档位、MTP 草稿数和 KV 预算后,点击"应用并重启";等待后端恢复健康,检查模型列表中的上下文是否同步,再开始新任务。先结束正在运行的 Agent 请求。

| 参数 | 默认值 | 含义 |
|---|---:|---|
| `-c` | 65536 | 逻辑上下文上限,不是实际已用 token |
| `--kvmem-budget` | 32768 | KVMem token 检索预算,不是 MB |
| `--kvmem-gen-reserve` | 8192 | 生成预留 |
| `--spec-draft-n-max` | 2 | MTP 草稿数(不是负数 -2) |
| `-ctk` / `-ctv` | q5_0 | KV 量化 |
| `-b` | 256 | batch |
| `-ngl` | 999 | 请求尽可能完整 GPU offload |

配置还启用 `draft-mtp`、MTP replay、思考预算 4096。DSH 的 High 映射为模型模板接受的 **xhigh**,防止 `Unexpected reasoning effort high`。low/medium 保持原值。独立启动参数的 medium 是默认值,DSH 请求可覆盖。

先用"在工作目录创建一个单文件 HTML,并用 SVG 实现鹈鹕骑自行车动画"进行编程验收。默认 Workspace Write 权限保留 DSH 审批行为,可在界面按需要选择权限模式;本仓库不自动代答审批。

关闭时先停止任务,在面板停止模型,再正常退出桌面程序。备份 `local/dsh-home` 可保存设置和会话,但不要将它提交到 GitHub。

## 换用其他模型

槽位机制与模型无关;固定默认模型只是便利,不是限制。

- **交互式换模型:** 把任意 GGUF(可选附 `mmproj-*.gguf`)放进一个文件夹,在卡片中将当前槽位的模型文件夹指向它,选择该文件,然后"应用并重启"。GGUF 与 mmproj 在文件夹内自动识别;显示名由文件名派生,可在模型页重命名。同一时间只运行一个槽位——切换前先停止当前模型(两者共享同一份显存预算)。
- **修改固定默认模型(从零可复现):** 编辑 `config/assets.json` 的 `model`/`vision` 条目(URL + SHA256)和 `config/settings.template.json` 中 A 槽的 `file`/`mmproj` 字段,然后在新位置重新运行 `Download.ps1 -Models` 和 `Configure.ps1`。
- **其他模型调参提示:** MTP 相关旗标(`--spec-type draft-mtp`、`--spec-draft-n-max`、`--kvmem-mtp-state replay`)要求模型为 MTP-enabled GGUF(QQZ V3、Unsloth MTP 版等)。KV 量化以保真换显存——q5_0 是本仓库验证过的中间档;q8_0 更占显存,q4_0 更省。预算与预留都是 token 数,不是 MB。调小 `-b` 可释放计算缓冲显存,但会损失部分预填充速度。保持 `-ngl 999` 完整 GPU offload。
- **边界:** 128K 是可选档位;192K/256K 未作为稳定的日常档位验证。换了显卡/内存后整个包络都会变化——请重新实测,不要假定文中数字可直接迁移。

## 稳定性边界

- 64K 是保守默认档位。128K 是可选配置,192K/256K 不作为已验证的日常稳定档位。
- 某次压力测试成功到 155,539 输入 token,但可用 RAM/VRAM 接近耗尽,并出现过 KVMem block/replay 错误;不是长期 Agent 可靠性保证。
- KVMem 历史 KV 使用系统内存是框架机制。语言模型层 GPU offload 与 KV 内存存储是两回事;Windows 仍可能发生共享显存/内存迁移。
- 视觉解析、截图理解、通用桌面点击仍有已知故障。Computer Use 的非 JSON 输出、审批模式和反复观察问题不属于此稳定默认链路。
- 切换上下文/预算可能导致内存不足。发生启动错误时恢复 64K / 32768 / MTP2,查看面板日志;不要重复启动更多模型进程。

## 已修复:压缩回放失败

长会话在上下文压缩时曾出现 `This turn failed "multimodal query replay failed or cancelled"` 并直接中断。根因(已通过源码溯源并在真实环境复现):KVMem 服务端的 query replay 不做任何槽位安置,而检索选择按预算从新到旧截断,因此任何未缓存跨度超过预算的请求——大体积工具结果,或把整个前导区域作为一个请求发出去的压缩摘要调用——都会在深层上下文失败;同时 DSH 的压缩路径没有恢复手段。

已发布修复(仅改 DSH 侧补丁,不动服务端/模型/配置):[patches/compaction-replay-fix](patches/compaction-replay-fix) —— 分段 map-reduce 摘要器(小请求、浅层断开前缀缓存,绝不触碰深层驻留 KV)+ 回放失败自愈(压缩后重试,而不是会话死亡)。一条哈希校验的脚本即可安装,附带 10 项回归测试。已在 128K 档实测:深层上下文压缩成功提交,压缩后 Agent 继续执行 `read` 与 shell 工具调用。针对 KVMem 回放路径本身的服务端流式修复已做出原型但未随本补丁发布——该方案需要上游对 MTP 草稿镜像做出决策。

## 验证与许可证

插件测试:

```powershell
node --test plugins/dsh-local-llm-controller/test/logic.test.mjs plugins/dsh-local-llm-controller/test/kvmem.test.mjs
```

发布检查与实际验证边界见 [VALIDATION.md](docs/VALIDATION.md)。新机器完整安装不等于已经复测,本仓库不将脚本检查描述为端到端稳定性测试。

参数面板保留原 MIT 许可证;本仓库新增脚本与文档采用 MIT。各上游模型、运行时和桌面客户端受其自身许可证约束,见 [第三方说明](THIRD_PARTY_NOTICES.md)。
