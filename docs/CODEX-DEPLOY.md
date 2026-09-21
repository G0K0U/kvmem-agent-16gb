# 交给朋友的 Codex 部署任务

[English](CODEX-DEPLOY.en.md) | [**简体中文**](CODEX-DEPLOY.md)

将以下文字和仓库地址一起交给 Codex：

> 请阅读 docs/DEPLOYMENT.zh-CN.md 后在这台电脑部署。先只读扫描 GPU/剩余VRAM、RAM、模型服务进程、DSH应用目录和真实DSH_HOME；执行 scripts/Diagnose.ps1 -Stage inventory。不要因为有16GB显存就假设全部组件可同时加载。
>
> 复用已安装DSH时，优先同一应用+独立数据目录；如果我选择集成已有DSH，使用 Configure-Stack.ps1 -IntegrateExisting，先备份并保留其他provider、权限和插件。不要整体覆盖settings.yaml，不要发布我的私有配置。
>
> 先选IQ3 + bootstrap文本档，由唯一控制器启动KVMem。确认/health、/v1/models、短文本、真实工具调用及显存，再开启CPU projector视觉。需要128K时显式切换desktop128并重新验收。遇到OOM停止扩大配置，按手册记录失败阶段；禁止用普通llama.cpp替换KVMem或臆造参数。
>
> 四个模型是可选、串行的。QQZ/Heretic/IQ3用GGUF+KVMem；Bonsai需要docs/BONSAI.md规定的自定义NInfer和成品权重，没有兼容制品时明确报告前置条件缺失，先完成GGUF方案。不能用上游latest或改文件扩展名冒充。
>
> 聊天稳定后，复用可运行的ComfyUI CUDA Python，按固定提交安装Qwen-Image扩展。先使用Q4_K_M、官方INT8编码器、BF16 VAE、单张约1MP基线；编码器CPU，ComfyUI按需lowvram。生成前聊天进程退出，结束后ComfyUI退出再恢复聊天；禁止额外常驻ComfyUI。先测试风景文生图和单张普通参考图编辑，再扩大负载。
>
> 不自动引入LoRA、超分、未验证INT8扩散或编码器试验。不要结束无关进程。每阶段给出已执行命令、模型ID、实际生效参数和验证结果，区分静态测试、作者历史实测和本机新实测。最终提供脱敏的诊断记录与回退位置。
