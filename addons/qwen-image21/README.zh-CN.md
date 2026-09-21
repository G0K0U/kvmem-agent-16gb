# Qwen-Image 2.1 生图扩展：搭配 KVMem＋DSH 使用

[English / 完整参数与安装说明](README.md)

**这一整套生图配置可以和本仓库的 KVMem＋DSH 配置搭配使用**（也就是你所说的 KVMan＋DSH）。沿用 DSH 对话入口和本地模型控制器，通过顺序使用显存运行聊天与生图，不要求两个模型同时常驻显存。

```text
DSH 中提出绘图/编辑需求
  → 本地 Qwen 按官方模板增强提示词（编辑时读取有序参考图）
  → 卸载聊天模型
  → 本地 ComfyUI + 原有 Qwen-Image 2.1 Q4_K_M 出图
  → 退出生图进程
  → 恢复原聊天模型、文本/视觉模式和参数，继续回复
```

## 功能与差异

- 文生图、单图编辑、多图参考。接口最多 16 张，真实测试覆盖 1、2 张。
- 自动解析官方 `rewritten_prompt`、`wh_ratio`、`ratio_follow`，保持参考图顺序；不会把整段 JSON 直接传给图像模型。
- 继续使用 Q4_K_M 主权重、Int8 文本编码器、2.1 VAE。默认 40 步、CFG 1、Euler/simple、约 1 百万像素，QwenImage21Cache 为 auto/default。
- 提示词由已有的本地 Qwen 聊天权重改写，**不是**教程另行下载的专用增强权重；效果不保证与教程逐字一致。
- 原始 25 步基础工作流保留。SeedVR2/VOSR2 超分未启用，需要另外的权重。
- 本地聊天只接收生成结果文字，图片仍在 DSH 中展示；后续编辑可以从工具展示元数据恢复图片引用。

## 安装

先部署本仓库的 KVMem＋DSH。需要已有可正常工作的 ComfyUI CUDA Python、Node.js 24、Git 和 pnpm 11.7；不是在裸 Python 上一键安装全部 CUDA 依赖。

准备三个权重，脚本按 [manifest.json](manifest.json) 校验 SHA-256：

1. `qwen-image-2.1-Q4_K_M.gguf`
2. `qwen3vl_8b_int8_convrot.safetensors`
3. `qwen_image_2.1_vae_bf16.safetensors`

完全退出 DSH 后，在仓库根目录运行：

```powershell
.\addons\qwen-image21\Install.ps1 `
  -PythonExe 'D:\ComfyUI\python_embeded\python.exe' `
  -WeightsDir 'D:\Models\QwenImage21'
```

默认使用本仓库的 `local/dsh-home` 和 `local/qwen-image21`。已有其他 DSH 部署时，可显式指定 `-DesktopRoot`、`-DshHome`、`-ImageRoot`，见英文说明完整示例。权重可以平铺在 WeightsDir，或按 diffusion_models/text_encoders/vae 三个子目录存放。脚本会复制权重，原件不删除；额外副本约 15GB。

脚本获取固定版本的 ComfyUI、GGUF 节点、dsh-image-gen，应用源码适配并构建，备份设置后注册插件和工作流。专用路径写入选定 DSH 数据目录下的 `qwen-image21.json`，不会写死作者的盘符或用户名。已有修改的源码目录会被拒绝覆盖，请选择新的运行目录。

安装后仍用原来的启动器启动 DSH，确保 `DSH_HOME` 相同。标准仓库部署使用 `scripts/Start.ps1`。不要额外手动启动占用 8191 的 ComfyUI。

## 使用

- 文生图：直接描述主体、风格、文字与画幅，比如“生成成年探险家站在山间木桥上的二次元插画，晨光，横向 3:2”。
- 图生图：上传图片并说明修改要求，或明确提供**任务工作区内**的图片路径。`edit_image` 自动选择 Advanced I2I，无需手动切换。
- 多图：按顺序提供 `source_paths` 或 `source_attachment_ids`，在提示词中对应“图1、图2”。

编辑增强需要 Qwen 对应的视觉投影文件。当前模型不是 Qwen 时使用槽位 A 的 Qwen，完成后恢复原槽位。若调用工具之前聊天后端就无法解码上传图片，请使用工作区图片路径。CPU 图像编码会增加耗时；外部直接调用聊天 HTTP 端口的请求不受 DSH 调度保护。

## 实测范围

原桌面上已完成进阶文生图、双图编辑，以及由 Bonsai 发起、临时使用 Qwen 改写的单图编辑；三项均实际出图、恢复模型并继续回复。基础工作流此前通过 Heretic、IQ3、QQZ、Bonsai 四模型测试；没有重复验证 IQ3/QQZ 的进阶流程。取消恢复有单元测试覆盖，但未实测采样中点击取消。

**Bonsai/NInfer 来自作者另行部署的后端，不由此扩展安装。** 仓库发布版控制器保持现有 GGUF/KVMem 范围；已有自定义 NInfer 控制器时不要直接覆盖。迁移后的安装脚本经过语法、配置合并和控制器测试，尚未在第二台干净 CUDA 机器上完整重装。

见[脱敏验证记录](../../evidence/qwen-image21-validation.json)。仅发布配置、源码适配、测试和说明，不上传权重、个人设置、生成图片或聊天记录。

控制器与配置测试通过 35 项，工作流适配和参考图专项测试通过 44 项。扩展运行上游全套测试为 350/352：一项仍要求拒绝所有多图 ComfyUI 编辑，与新增行为冲突；另一项是 Windows 目录链接保存测试返回 `EEXIST`。因此不声称上游全套测试通过。

回退基础生图时选择 `Qwen-Image 2.1 Q4_K_M`。完全禁用时先退出 DSH，再移除生图插件，并将 `qwen-image21.json` 的 `enabled` 设为 `false`；需要时另行恢复设置备份。
