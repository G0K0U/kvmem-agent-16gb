[English](README.md) | [**简体中文**](README.zh-CN.md)

# 16GB 显存本地 Agent 栈 — DSH Desktop + KVMem (llama.cpp)

Windows 上的可复现部署快照：桌面 Agent 宿主（DSH Desktop）通过本地参数面板驱动 KVMem llama.cpp 服务。**这套栈本身与模型无关**——双 GGUF 模型槽位，上下文、MTP 和 KV 预算等启动参数按组全量可编辑——**但本仓库默认附带并验证了一个固定模型**：QQZ 27B IQ4_XS MTP 量化版，针对 16GB 显存 / 32GB 内存的机型调优。

**真实验证案例：RTX 4080 16GB + 32GB RAM，64K 配置——编程 Agent 任务（单文件 HTML，SVG 鹈鹕骑自行车动画）完成 10 次模型调用，加权生成速度 32.05 token/s。** 该会话实际峰值上下文约 27K token；这不是"填满 64K 后恒定 32 token/s"的证明。全部测试在日常桌面环境下进行：后台始终开着浏览器、编辑器等正常使用的软件；仅关闭 ComfyUI、游戏等 GPU 重载。方法、数字与边界见[成功案例](docs/CASE-STUDY.md)。

本仓库提供该会话使用的文本/编程 Agent 链路。为了保持案例参数，配置仍加载 CPU 视觉编码器；这不代表视觉 Agent 已稳定。报错较多的 Computer Use 插件不随本仓库安装。

## 架构与固定版本

```text
DSH Desktop → 本地参数面板管理模型进程
           → OpenAI-compatible API 127.0.0.1:18200/v1
           → KVMem CUDA → GGUF（语言模型 GPU / 视觉编码器 CPU）
```

| 组件 | 固定版本 / 来源 |
|---|---|
| QQZ（默认模型） | [IQ4_XS V3 Final MTP](https://huggingface.co/QQZ2026/Qwen3.8-27B-ZeroRefusal-UD-IQ4_XS-MTP-GGUF)，revision `e45b6a3a3c137c11df9da4a79cfae82fdd7faaa3` |
| KVMem | [v0.16.0-rc2](https://github.com/kvmem/kvmem-llama.cpp/releases/tag/v0.16.0-rc2)，Windows CUDA 13.2.86 |
| DSH Desktop | [2.0.12-beta.1](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.12-beta.1)，社区桌面客户端 |
| DeepSeek Harness | 桌面版内置 `0.1.6-alpha.2` |
| 参数面板 | [Lbunc/dsh-local-llm-controller](https://github.com/Lbunc/dsh-local-llm-controller)，基于 `87f23f187aad397f0040d8d192c6d9ad83320f85` 的本地 KVMem 适配版 `2.0.4-kvmem.1` |

这是版本快照，不追踪 latest。下载地址与 SHA256 在 [assets.json](config/assets.json)。仓库不分发模型权重和上游二进制。

## 哪些是通用的，哪些是固定的

| 通用——可换用其他模型 | 本快照中固定 |
|---|---|
| 双模型槽位（A/B）；每个槽位可指向任意 GGUF 文件夹，自动识别 `mmproj`，同一时间只运行一个模型进程 | `assets.json` 固定 QQZ IQ4_XS V3 模型 + F16 视觉投影，`Download.ps1` 一条命令带 SHA256 校验 |
| 八组启动参数全量可编辑（2 槽位 × 文本/视觉 × fast/long） | `settings.template.json` 预设按 27B / 66 层模型调优：64K、MTP2、q5_0 KV、预算 32K |
| 模型显示名由 GGUF 文件名派生，可在模型页重命名 | 成功案例数字仅在 QQZ 模型上测得 |
| `serverExe` 可配置（`llama-kvmem-server.exe`；Linux/macOS 为 `llama-server`） | DSH Desktop 与 DeepSeek Harness 版本固定 |

面板在应用配置时按如下包络校验：上下文 ∈ {64K, 128K, 192K, 256K}；`--kvmem-budget` ∈ {8K … 48K}（8K 步进）；`--kvmem-gen-reserve` ∈ {4K, 8K, 16K}；预算 + 预留 ≤ 上下文；MTP 草稿数 1–4；`-ngl` ≥ 66（保持完整 GPU offload）。该包络对应 16GB 显存上的 27B 级 MTP GGUF。其他模型可通过同样的槽位加载，但包络之外的内容不在本仓库测试范围内，且 MTP 预设假定模型为 MTP-enabled GGUF。

## 安装

需要 Windows x64、与上述 CUDA 运行时匹配的 NVIDIA 驱动、16GB NVIDIA 显存、32GB RAM、Node.js 24（原环境 24.19.0）、PowerShell、Git 和 curl。模型约 14.25GB，视觉编码器约 0.93GB；另需运行时、安装包和缓存空间。模型运行时日常后台软件（浏览器、编辑器、聊天）可以保持开启——案例数字就是在该条件下测得的；关闭 ComfyUI、游戏等 GPU 重载即可。

1. 克隆本仓库并进入目录。在 PowerShell 运行：

   ```powershell
   .\scripts\Download.ps1 -Models
   ```

   不加 `-Models` 只下载运行时和桌面安装包。每个文件会校验 SHA256；中断留下的 `.part` 下次会重新下载。

2. 运行 `downloads` 中的 DSH Desktop 安装程序。解压 KVMem ZIP，找到包含 `llama-kvmem-server.exe` 的 `bin` 目录。GGUF 可以保留在 `downloads` 中。已有相同版本和模型时可以直接复用，无需重复下载。

3. 首次生成独立配置并安装面板插件。按实际目录替换以下示例：

   ```powershell
   .\scripts\Configure.ps1 `
     -DesktopRoot 'D:\Apps\DSH Desktop Beta' `
     -RuntimeBin 'D:\Models\kvmem\bin' `
     -ModelsDir "$PWD\downloads" `
     -NodeExe 'node'
   ```

   `DesktopRoot` 必须含 `DSH Desktop Beta.exe` 与 `resources/app/lib/desktop-cli.js`。安装目录可通过快捷方式的"打开文件所在位置"找到。安装脚本调用桌面专用 CLI 的 `plugin --profile desktop add ... --ignore-scripts`，不要改用另一套全局 dsh。

   数据写入本仓库被 Git 忽略的 `local/dsh-home`，工作目录为 `local/workspace`。不会覆盖已有 DSH 用户目录。重复运行会拒绝覆盖；插件安装中断时，可手动设置 `DSH_HOME` 为这个独立目录，再重试上述 desktop-cli 插件安装命令。

4. 完全退出其他 DSH Desktop 和占用 18200/43189 端口的服务，再启动：

   ```powershell
   .\scripts\Start.ps1
   .\scripts\Health.ps1
   ```

   模型首次加载需要等待。健康接口返回正常后，在 DSH 选择 `QQZ + KVMem 64K / MTP2`。参数面板负责启动和停止 KVMem，不要同时运行另一份 llama-server 启动器。桌面启动禁用 Electron GPU 加速，模型 CUDA 计算仍启用。

## 日常使用与参数面板

在 DSH 设置中打开 Local LLM Controller / QQZ-KVMem 卡片。默认 A 槽、vision 模式、fast 参数组为 **64K / MTP2**。CPU 视觉编码器保留在这个模式中。选择上下文档位、MTP 草稿数和 KV 预算后，点击"应用并重启"；等待后端恢复健康，检查模型列表中的上下文是否同步，再开始新任务。先结束正在运行的 Agent 请求。

| 参数 | 默认值 | 含义 |
|---|---:|---|
| `-c` | 65536 | 逻辑上下文上限，不是实际已用 token |
| `--kvmem-budget` | 32768 | KVMem token 检索预算，不是 MB |
| `--kvmem-gen-reserve` | 8192 | 生成预留 |
| `--spec-draft-n-max` | 2 | MTP 草稿数（不是负数 -2） |
| `-ctk` / `-ctv` | q5_0 | KV 量化 |
| `-b` | 256 | batch |
| `-ngl` | 999 | 请求尽可能完整 GPU offload |

配置还启用 `draft-mtp`、MTP replay、思考预算 4096。DSH 的 High 映射为模型模板接受的 **xhigh**，防止 `Unexpected reasoning effort high`。low/medium 保持原值。独立启动参数的 medium 是默认值，DSH 请求可覆盖。

先用"在工作目录创建一个单文件 HTML，并用 SVG 实现鹈鹕骑自行车动画"进行编程验收。默认 Workspace Write 权限保留 DSH 审批行为，可在界面按需要选择权限模式；本仓库不自动代答审批。

关闭时先停止任务，在面板停止模型，再正常退出桌面程序。备份 `local/dsh-home` 可保存设置和会话，但不要将它提交到 GitHub。

## 换用其他模型

槽位机制与模型无关；固定默认模型只是便利，不是限制。

- **交互式换模型：** 把任意 GGUF（可选附 `mmproj-*.gguf`）放进一个文件夹，在卡片中将当前槽位的模型文件夹指向它，选择该文件，然后"应用并重启"。GGUF 与 mmproj 在文件夹内自动识别；显示名由文件名派生，可在模型页重命名。同一时间只运行一个槽位——切换前先停止当前模型（两者共享同一份显存预算）。
- **修改固定默认模型（从零可复现）：** 编辑 `config/assets.json` 的 `model`/`vision` 条目（URL + SHA256）和 `config/settings.template.json` 中 A 槽的 `file`/`mmproj` 字段，然后在新位置重新运行 `Download.ps1 -Models` 和 `Configure.ps1`。
- **其他模型调参提示：** MTP 相关旗标（`--spec-type draft-mtp`、`--spec-draft-n-max`、`--kvmem-mtp-state replay`）要求模型为 MTP-enabled GGUF（QQZ V3、Unsloth MTP 版等）。KV 量化以保真换显存——q5_0 是本仓库验证过的中间档；q8_0 更占显存，q4_0 更省。预算与预留都是 token 数，不是 MB。调小 `-b` 可释放计算缓冲显存，但会损失部分预填充速度。保持 `-ngl 999` 完整 GPU offload。
- **边界：** 128K 是可选档位；192K/256K 未作为稳定的日常档位验证。换了显卡/内存后整个包络都会变化——请重新实测，不要假定案例数字可直接迁移。

## 稳定性边界

- 64K 是保守默认档位。128K 是可选配置，192K/256K 不作为已验证的日常稳定档位。
- 某次压力测试成功到 155,539 输入 token，但可用 RAM/VRAM 接近耗尽，并出现过 KVMem block/replay 错误；不是长期 Agent 可靠性保证。
- KVMem 历史 KV 使用系统内存是框架机制。语言模型层 GPU offload 与 KV 内存存储是两回事；Windows 仍可能发生共享显存/内存迁移。
- 视觉解析、截图理解、通用桌面点击仍有已知故障。Computer Use 的非 JSON 输出、审批模式和反复观察问题不属于此稳定默认链路。
- 切换上下文/预算可能导致内存不足。发生启动错误时恢复 64K / 32768 / MTP2，查看面板日志；不要重复启动更多模型进程。

## 验证与许可证

插件测试：

```powershell
node --test plugins/dsh-local-llm-controller/test/logic.test.mjs plugins/dsh-local-llm-controller/test/kvmem.test.mjs
```

发布检查与实际验证边界见 [VALIDATION.md](docs/VALIDATION.md)。新机器完整安装不等于已经复测，本仓库不将脚本检查描述为端到端稳定性测试。

参数面板保留原 MIT 许可证；本仓库新增脚本与文档采用 MIT。各上游模型、运行时和桌面客户端受其自身许可证约束，见 [第三方说明](THIRD_PARTY_NOTICES.md)。
