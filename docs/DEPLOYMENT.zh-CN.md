# 16GB 显存完整部署手册：KVMem + DSH + Qwen-Image 2.1

[English](DEPLOYMENT.md) | [**简体中文**](DEPLOYMENT.zh-CN.md)

本手册是交给另一台电脑或 Codex 的主入口。仓库名中的 KVMem（有时口头写作 KVMan）是 llama.cpp 分支；Bonsai 使用另一套 NInfer 后端。**四个可选聊天模型意味着四选一，不是四个服务同时驻留。聊天和生图也必须串行使用 GPU。**

同为 RTX 4080 16GB / 32GB RAM 不代表剩余资源相同。作者桌面在 2026-09-21 的一次只读检查中，Heretic 128K 已加载时整卡约占用 15.4 GiB，余量很小。这不是模型独占显存值，也不是朋友的 OOM 根因证明。先记录朋友机器的进程、空闲显存和失败阶段，再改参数。

## 1. 版本与文件

| 组件 | 本包基线 | 说明 |
|---|---|---|
| 系统 | Windows x64，RTX 4080 16GB，32GB RAM | RAM、虚拟内存和 VRAM 分别核查 |
| 部署 shell | PowerShell 7，Node.js 24，Git，pnpm 11.7 | 用 `pwsh`，不是直接把示例粘贴进 cmd |
| DSH Desktop | 2.0.12-beta.1 | 安装器 SHA256 见 `config/assets.json` |
| KVMem | v0.16.0-rc2 Windows CUDA 13.2.86 | 必须 `llama-kvmem-server.exe`，不能换普通 llama-server |
| 聊天模型 | IQ3 / QQZ / Heretic / Bonsai | 文件、固定下载地址、哈希见 `config/chat-models.json` |
| ComfyUI / GGUF 节点 / 生图插件 | 固定 Git 提交 | 见 `addons/qwen-image21/manifest.json` |
| 图像模型基线 | Qwen-Image 2.1 Q4_K_M | 4.60 GB 扩散权重 + INT8 编码器 + BF16 VAE |

先打开 PowerShell 7，进入仓库根目录；保持此目录到部署结束。下文 `D:\Apps`、`D:\Models` 等是示例，需要替换为本机真实路径。不要复制作者电脑盘符。

```powershell
git clone https://github.com/G0K0U/kvmem-agent-16gb.git
Set-Location kvmem-agent-16gb
node --version
pnpm --version
nvidia-smi
.\scripts\Diagnose.ps1 -Stage inventory
```

诊断默认保存到被 Git 忽略的 `local/diagnostic.json`，只记录设备、显存、内存、服务进程名/PID和端口，不导出凭据、聊天或完整命令行。此时不启动任何模型。保留系统管理的页面文件并确保磁盘空间；页面文件不能代替 GPU 显存。

## 2. 先下载一个聊天模型和 KVMem

初次部署建议 IQ3，以较小权重先验证流程。已有权重可以放入自己的 ModelsDir，无需重复下载；配置时仍校验 SHA256。

```powershell
.\scripts\Download.ps1
.\scripts\Download-ChatModel.ps1 -Model iq3 -Vision -Destination 'D:\Models\Chat'
Expand-Archive -LiteralPath '.\downloads\kvmem-v0.16.0-rc2-windows-x86_64-cuda13.2.86.zip' -DestinationPath '.\runtime'
Get-ChildItem .\runtime -Recurse -Filter llama-kvmem-server.exe
```

`Download.ps1` 默认只下载固定 KVMem 压缩包与 DSH 安装器。若没有 DSH，运行下载的安装器；若已有兼容 DSH，复用程序目录。**不要启动独立 KVMem 脚本后再启动 DSH 控制器。**

复制上一步服务器所在的 `bin` 目录作为 RuntimeBin。只有 KVMem 使用本包检索参数；普通 llama.cpp 不理解这些参数，也不能因为接口相同就视为同一后端。

## 3A. 路径 A：已有 DSH 程序，独立数据目录（首次复现优先）

这不需要再安装一个 DSH。复用程序，但将此仓库的数据放在 `local/dsh-home`，避免把旧插件和参数混进基线。

正常退出 DSH，包括托盘进程，并结束其他模型服务。脚本不会强杀进程。

```powershell
.\scripts\Configure-Stack.ps1 `
  -DesktopRoot 'D:\Apps\DSH Desktop Beta' `
  -RuntimeBin 'D:\Repos\kvmem-agent-16gb\runtime\kvmem-v0.16.0-rc2-windows-x86_64-cuda13.2.86\bin' `
  -ModelsDir 'D:\Models\Chat' -Model iq3 -Profile bootstrap
```

先用默认文本模式。脚本只配置和注册控制器，不启动服务。配置内容是：本地 API `127.0.0.1:18200`、单个活动槽位、共享 provider `qqz-kvmem`、空服务端 API key和本地客户端占位 Authorization。已有权限设置不会放宽。

## 3B. 路径 B：合并到电脑现有 DSH（保留原任务和插件）

先确认**真正的 DSH 数据目录**。程序目录 `resources/app`、Electron 缓存 `%APPDATA%` 和 DSH_HOME 不是一回事。查看现有启动脚本的 `DSH_HOME`；没有设置时根据该版本 DSH 的实际文件位置确认，不要盲猜 `.dsh` 或 `.dsh-beta`。目标中应存在当前使用的 `settings.yaml` 和 `profiles/desktop`。

退出 DSH 后：

```powershell
.\scripts\Configure-Stack.ps1 `
  -DesktopRoot 'D:\Apps\DSH Desktop Beta' `
  -RuntimeBin 'D:\KVMem\bin' -ModelsDir 'D:\Models\Chat' `
  -DshHome 'D:\ExistingDSHData' -IntegrateExisting `
  -Model iq3 -Profile bootstrap
```

脚本会在该 DSH_HOME 的 `backups/stack-时间戳` 中备份设置、根补丁及 desktop profile 顶层注册文件，然后：

- 替换 `local-llm` 为所选模型的配置；这一命名空间的旧参数在备份中保留。
- 合并 `llm-pi-ai.providers.qqz-kvmem`，保留其他 provider、凭据引用、权限、MCP、图片工作流和其他设置。
- 将新任务默认模型改为所选本地模型；注册仓库控制器。
- 写入本仓库 `local/launch.json`，让后续 Start.ps1 使用同一 DSH_HOME。

已有自定义控制器插件源码请另外备份；元数据备份不是源码备份。旧 provider 若也指向相同本地服务，不要开另一套常驻启动器。旧聊天任务可能保留原模型选择，切换后新建任务验收。

与此版本 API 不兼容的 DSH 不应强行套用补丁。可以复用旧应用的原环境，另用固定版程序和独立 DSH_HOME 做对照；同一时刻只开一个 Desktop 实例。

## 4. 首次启动与验收

```powershell
.\scripts\Diagnose.ps1 -Stage before-chat
.\scripts\Start.ps1
# 等待面板显示 ready，再运行：
.\scripts\Diagnose.ps1 -Stage chat-ready
Invoke-RestMethod http://127.0.0.1:18200/v1/models
Invoke-RestMethod http://127.0.0.1:18200/props
```

Start.ps1 使用 `--disable-gpu` 启动 Electron，以减少界面占用；控制器拥有模型进程。启动前检查已有模型/ComfyUI进程、端口及空闲显存。12000 MiB 空闲只是保守的预检阈值，**通过并不保证峰值能装下**。多 GPU 用户先明确目标 GPU；此脚本面向单卡，逐卡检查，不能把另一块卡的空闲量当作当前卡余量。

新建任务，先测试简单算术，再让模型读写工作区里的一个小文本文件。不要第一轮就输入 100K 文本、整目录或大量图片。验证 `/v1/models` 返回期望文件名，不仅是 `/health` 返回 200。保存 `nvidia-smi` 的空闲、加载后、首次请求峰值、请求结束四个时点。

通过后，退出 DSH，用同一 Configure-Stack 命令加 `-IntegrateExisting -Vision` 重新配置；重启，用一张小尺寸非敏感图片验证视觉。控制器应注入 `--no-mmproj-offload --image-max-tokens 512`。若视觉 projector 上 GPU，将挤占聊天显存。

## 5. 四个可选模型与两档参数

| 选择 | 后端 / 权重体积 | 首次验证档 bootstrap | 作者桌面档 desktop128 |
|---|---|---|---|
| iq3 | KVMem，约 11.29 GiB | 64K / Q5 KV / MTP1 | 128K / Q5 KV / MTP2 |
| qqz | KVMem，约 13.27 GiB | 同上，显存余量更小 | 同上 |
| heretic | KVMem，约 13.35 GiB | 同上，显存余量更小 | 同上 |
| bonsai | 自定义 NInfer，约 7.74 GiB | 32K INT8 KV，MTP关闭，仅文本 | 128K INT8 KV，MTP关闭，仅文本 |

前三者的具体参数由 `scripts/stack-config.mjs` 生成，避免手抄遗漏：

| 参数 | bootstrap | desktop128 |
|---|---:|---:|
| `-c` 逻辑上下文 | 65536 | 131072 |
| `--kvmem-budget` 检索预算 | 8192 | 24576 |
| `--kvmem-gen-reserve` / `-n` | 4096 | 16384 |
| `-b` | 128 | 256 |
| `-ctk` / `-ctv` | q5_0 / q5_0 | q5_0 / q5_0 |
| MTP draft / KV | 1 / f16 | 2 / f16 |
| `-ngl` | 999 | 999 |
| 视觉编码器 | CPU，512 image tokens | CPU，512 image tokens |

bootstrap 是此次新增的低预算验收档，已做参数测试，未在朋友电脑上做完整推理验证；desktop128 来自作者实测配置，不是所有 16GB 环境的保证。逻辑上下文不等于 GPU KV 预算；只降低 `-c` 而不调整检索/生成预算，不一定解决 OOM。小预算也更不适合巨大未缓存输入和摘要重放，应在短任务通过后再扩大。

切换 QQZ/Heretic：先下载对应文件，再退出 DSH，使用相同配置命令加 `-Model qqz` 或 `-Model heretic` 和 `-IntegrateExisting`。如要恢复作者 128K 档，显式加 `-Profile desktop128`。每次只改一项并复测。三个 GGUF 共用槽位 A 的文件选择；不是创建四个并发槽位。面板直接换文件后还需“添加到模型列表”，以同步模型 ID；配置脚本会自动完成这些字段。

第五个旗舰配置是 bonsai 路径的扩展而非替代：`Bonsai2-CRACK-PQ2.ninfer` 运行在 CraneBW/ninfer-ternary-bonsai-ada 引擎上，以 4-bit KV + MTP draft 3 分配 262144/262144，这里两台 RTX 4080 日常使用稳定 100+ tok/s。它需要更新的引擎构建和自行转换的制品；来源、实测与回退见 [CRACK-FLAGSHIP.zh-CN.md](CRACK-FLAGSHIP.zh-CN.md)。脚本的 `-Model` 可选值仍为上述四个；旗舰配置通过把 B 槽指向新制品与新引擎来手动完成。

Bonsai 配置和运行时前提见 [BONSAI.md](BONSAI.md)。本次发布已包含 NInfer 控制器适配，但没有把作者的自定义 CUDA 二进制伪装成上游通用安装包。

## 6. 插件与长会话补丁

只需本仓库 `plugins/dsh-local-llm-controller`，以及生图步骤构建的 `dsh-image-gen`。不需要为每个模型装一套 DSH、独立 provider 或常驻视觉服务。

长会话可能触发 `multimodal query replay failed or cancelled`；这不能一概判为 OOM。仓库有固定版本摘要补丁：

```powershell
# 退出 DSH 后，只对匹配哈希的应用版本安装：
.\patches\compaction-replay-fix\Install.ps1 -DshAppRoot 'D:\Apps\DSH Desktop Beta\resources\app'
```

哈希不匹配时停止，按 [补丁说明](../patches/compaction-replay-fix/README.md) 核查版本，不可删掉校验硬覆盖。初次验收先单任务，关闭自动并发子代理；控制器会拒绝在其他任务推理时接管显存。

## 7. Qwen-Image 2.1、ComfyUI 和开源工作流

聊天验收通过后再部署本节。本包复现之前已验证的 **Q4_K_M + 官方 INT8 编码器 + BF16 VAE**。作者机器之后的其他编码器/INT8扩散/LoRA试验不并入这个排错基线，不能假设所有最新本地试验都与此包等同。

准备一个已有、可运行的 ComfyUI CUDA Python 环境（例如官方 Windows portable 的 python_embeded）。本插件安装器不是裸 Python 的完整 CUDA 安装器。用这一个解释器验证：

```powershell
& 'D:\ComfyUI_windows_portable\python_embeded\python.exe' -s -c 'import torch, gguf, safetensors, aiohttp, scipy, transformers, sentencepiece; print(torch.__version__, torch.version.cuda, torch.cuda.is_available())'
```

缺模块就先修复该 ComfyUI Python 环境。不要把依赖装到系统 Python，也不要为解决缺包盲目升级 Torch/CUDA。作者环境为 Torch 2.13 / CUDA 13.0；KVMem 自带 CUDA 13.2 运行库是另一条依赖链。显卡驱动需分别支持它们。上游安装入口：[ComfyUI](https://github.com/Comfy-Org/ComfyUI)。

准备这三个模型，来源、校验值在 [扩展清单](../addons/qwen-image21/manifest.json)：

```text
ImageRoot/models/diffusion_models/qwen-image-2.1-Q4_K_M.gguf
ImageRoot/models/text_encoders/qwen3vl_8b_int8_convrot.safetensors
ImageRoot/models/vae/qwen_image_2.1_vae_bf16.safetensors
```

退出 DSH 和其他 ComfyUI；使用同一 DSH_HOME：

```powershell
.\addons\qwen-image21\Install.ps1 `
  -PythonExe 'D:\ComfyUI_windows_portable\python_embeded\python.exe' `
  -WeightsDir 'D:\Models\ImageDownloads' `
  -DesktopRoot 'D:\Apps\DSH Desktop Beta' `
  -DshHome 'D:\ExistingDSHData' `
  -ImageRoot 'D:\ImageRuntime'
```

独立数据目录方案的 DshHome 换成本仓库 `local/dsh-home` 的绝对路径。权重可平铺在 WeightsDir 或按三类目录放置。脚本校验后复制，不删除原件；预留约15GB副本及源码、依赖、输出空间。已有相同布局可令 WeightsDir 为 ImageRoot/models 原地复用。安装器拒绝覆盖已修改源码目录；重配已有环境用 Configure.mjs，详见[扩展说明](../addons/qwen-image21/README.zh-CN.md)。

工作流来源：[Qwen官方提示词](https://github.com/QwenLM/Qwen-Image-2.1/tree/main/prompt_rewrite/prompts)、[ComfyUI-GGUF](https://github.com/leejet/ComfyUI-GGUF)、[dsh-image-gen](https://github.com/shanliuling/dsh-image-gen)、[SevnFading工作流参考](https://www.runninghub.cn/post/2101856561537830914)。本地可执行 API 图已随仓库提供，无需让 Codex解析教程布局并猜节点。

| 工作流 | 用途 | 基线 |
|---|---|---|
| Qwen-Image 2.1 Q4_K_M | 基础文生图 | 25步 |
| Qwen-Image 2.1 Advanced T2I | 提示词增强文生图 | 40步，CFG1，Euler/simple，约1MP |
| Qwen-Image 2.1 Advanced I2I | 单/多参考图编辑 | 同上，图像顺序固定 |

CLIPLoader 必须 `type=qwen_image, device=cpu`；模型扩散使用 UnetLoaderGGUF。先保持 batch_size=1、单图约1024边长。缓存节点在已测图中为 auto/default，不能臆造 CPU/int8 枚举；需要更改时先查该固定 ComfyUI 的 `/object_info`。不启用超分、SeedVR2/VOSR2或额外 LoRA，以免叠加显存变量。

实际顺序：聊天模型改写 → 聊天进程退出 → 启动专用 ComfyUI（8191、lowvram）→ 生图 → ComfyUI退出 → 恢复原聊天模型/槽位/预设。**不要手动常驻启动这个 ComfyUI，也不要从已有 ComfyUI页面旁路运行另一份图。** 进程停止失败时控制器不重载聊天模型。

重启 DSH，新建任务：先生成一张风景图，再用一张普通参考图做水彩编辑，最后询问简单问题验证聊天恢复。检查8191在生图期间监听、结束后释放。图片卡片出现、工具返回成功、最终聊天回复完成，三者都要验收。取消路径目前有单元测试覆盖，未声称实机采样中取消验证。

## 8. 爆显存按发生阶段排查

| 阶段/现象 | 先查 | 处理顺序 |
|---|---|---|
| 尚未加载就空闲很少 | 其他 llama/Ollama/ComfyUI、浏览器、GPU应用 | 正常退出占用者，重新采集 inventory；不强杀未知进程 |
| 聊天加载时 OOM | runtime是否KVMem，实际命令行，Q5 KV，MTP，预算，projector | 退 bootstrap；优先IQ3；文本模式；仍失败记录日志，停止升级 |
| 大输入或摘要才失败 | CUDA错误 vs replay错误，未缓存输入规模，RAM | 小输入复现，核对摘要补丁；不要把重放错误当CUDA OOM |
| 生图启动时 OOM | 聊天进程是否真正消失，另一个ComfyUI是否常驻 | 修复显存交接；不要同时运行聊天和扩散 |
| 编码参考图时 OOM | CLIPLoader是否CPU，RAM余量、参考图数 | 单参考图、小尺寸；检查系统RAM/页面文件 |
| 采样/VAE阶段 OOM | 输出尺寸、batch、超分、额外节点 | batch1、先512/768，再1024；保持lowvram；定位具体报错节点 |
| 生图后聊天恢复 OOM | ComfyUI进程/8191残留、其他GPU程序新启动 | 先确认扩散释放，再正常重试聊天 |
| Bonsai启动失败 | 是否错误上游5090构建，KV容量/concurrency，256K | 使用匹配自定义构建，32K/单并发；不套KVMem参数 |

调低图像尺寸应同时修改有效 workflow/调用尺寸；Advanced 自动改写可能回到约1MP，低尺寸排错优先选基础图并确认实际队列参数。`nvidia-smi` 单次快照可能漏掉峰值。记录失败的节点/服务日志与 GPU 采样时间，不能仅凭“同配置”判断。

朋友反馈时提供：仓库commit、DSH/KVMem/ComfyUI版本、选择的模型/profile、是否独立DSH_HOME、诊断JSON、失败阶段和最后30行报错。**不要上传 settings.yaml、API密钥、聊天、图片或完整环境变量。** 本仓库不替未知机器保证16GB内必然成功。

## 9. 回退、测试与交给 Codex

修改前退出 DSH。需要回退时，把 `backups/stack-时间戳/settings.yaml` 复制回同一 DSH_HOME；若插件注册也变动，恢复同次备份的 profile 顶层文件并按原插件来源重新注册。不要删除原 sessions 或 node_modules 来“清空修复”。生图禁用需移除生图插件并设置 `qwen-image21.json` 的 enabled=false。摘要补丁使用其专用 Rollback.ps1。原模型权重始终保留。

```powershell
node --test plugins/dsh-local-llm-controller/test/*.test.mjs addons/qwen-image21/test/*.test.mjs scripts/test/*.test.mjs
```

测试范围见 [部署验证记录](../evidence/deployment-pack-validation.json)。这次发布没有重启作者正在使用的模型，没有冒充已在朋友电脑复现 OOM。Bonsai和原生CUDA环境仍有单独前置条件。

交给 Codex 的任务模板见 [CODEX-DEPLOY.md](CODEX-DEPLOY.md)。源码压缩包与直接 git clone 内容一致；下载压缩包后也请保留模型哈希核验和阶段验收，不要直接并行运行所有脚本。
