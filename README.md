# QQZ + KVMem + DSH：32GB RAM / 16GB 显存本地 Agent

Windows 上的可复现部署快照：QQZ 27B IQ4_XS + KVMem + DSH Desktop，附带可编辑上下文、MTP 和 KV 预算的参数面板。

**真实案例：RTX 4080 16GB + 32GB RAM，64K 配置下完成 HTML/SVG 编程 Agent 任务，10 次模型调用加权生成速度 32.05 token/s。** 实际最大上下文约 27K；这不是“填满 64K 后全程 32 token/s”的证明。详情及脱敏数字见 [成功案例](docs/CASE-STUDY.md)。

本仓库默认提供已使用的文本/编程 Agent 链路。为了保持案例参数，配置仍加载 CPU 视觉编码器；这不代表视觉 Agent 已稳定。报错较多的 Computer Use 插件不随本仓库安装。

## 架构与固定版本

```text
DSH Desktop → 本地参数面板管理模型进程
           → OpenAI-compatible API 127.0.0.1:18200/v1
           → KVMem CUDA → QQZ GGUF（语言模型 GPU / 视觉编码器 CPU）
```

| 组件 | 固定版本 / 来源 |
|---|---|
| QQZ | [IQ4_XS V3 Final MTP](https://huggingface.co/QQZ2026/Qwen3.8-27B-ZeroRefusal-UD-IQ4_XS-MTP-GGUF)，revision `e45b6a3a3c137c11df9da4a79cfae82fdd7faaa3` |
| KVMem | [v0.16.0-rc2](https://github.com/kvmem/kvmem-llama.cpp/releases/tag/v0.16.0-rc2)，Windows CUDA 13.2.86 |
| DSH Desktop | [2.0.12-beta.1](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.12-beta.1)，社区桌面客户端 |
| DeepSeek Harness | 桌面版内置 `0.1.6-alpha.2` |
| 参数面板 | [Lbunc/dsh-local-llm-controller](https://github.com/Lbunc/dsh-local-llm-controller)，基于 `87f23f187aad397f0040d8d192c6d9ad83320f85` 的本地 KVMem 适配版 `2.0.4-kvmem.1` |

这是版本快照，不追踪 latest。下载地址与 SHA256 在 [assets.json](config/assets.json)。仓库不分发模型权重和上游二进制。

## 安装

需要 Windows x64、支持上述 CUDA 运行时的 NVIDIA 驱动、16GB NVIDIA 显存、32GB RAM、Node.js 24（原环境 24.19.0）、PowerShell、Git 和 curl。模型约 14.25GB，视觉编码器约 0.93GB；另需运行时、安装包和缓存空间。测试期间关闭 ComfyUI 和其他大型 GPU 软件。

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

   `DesktopRoot` 必须含 `DSH Desktop Beta.exe` 与 `resources/app/lib/desktop-cli.js`。安装目录可通过快捷方式的“打开文件所在位置”找到。安装脚本调用桌面专用 CLI 的 `plugin --profile desktop add ... --ignore-scripts`，不要改用另一套全局 dsh。

   数据写入本仓库被 Git 忽略的 `local/dsh-home`，工作目录为 `local/workspace`。不会覆盖已有 DSH 用户目录。重复运行会拒绝覆盖；插件安装中断时，可手动设置 `DSH_HOME` 为这个独立目录，再重试上述 desktop-cli 插件安装命令。

4. 完全退出其他 DSH Desktop 和占用 18200/43189 端口的服务，再启动：

   ```powershell
   .\scripts\Start.ps1
   .\scripts\Health.ps1
   ```

   模型首次加载需要等待。健康接口返回正常后，在 DSH 选择 `QQZ + KVMem 64K / MTP2`。参数面板负责启动和停止 KVMem，不要同时运行另一份 llama-server 启动器。桌面启动禁用 Electron GPU 加速，模型 CUDA 计算仍启用。

## 日常使用与参数面板

在 DSH 设置中打开 Local LLM Controller / QQZ-KVMem 卡片。默认 A 槽、vision 模式、fast 参数组为 **64K / MTP2**。CPU 视觉编码器保留在这个模式中。选择上下文档位、MTP 草稿数和 KV 预算后，点击“应用并重启”；等待后端恢复健康，检查模型列表中的上下文是否同步，再开始新任务。先结束正在运行的 Agent 请求。

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

先用“在工作目录创建一个单文件 HTML，并用 SVG 实现鹈鹕骑自行车动画”进行编程验收。默认 Workspace Write 权限保留 DSH 审批行为，可在界面按需要选择权限模式；本仓库不自动代答审批。

关闭时先停止任务，在面板停止模型，再正常退出桌面程序。备份 `local/dsh-home` 可保存设置和会话，但不要将它提交到 GitHub。

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
