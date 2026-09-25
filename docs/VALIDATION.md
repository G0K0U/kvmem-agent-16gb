# 发布检查

2026-09-20 在原 Windows 部署机器上执行；未重新进行模型压力测试，也未中断正在使用的模型服务。

- 参数面板逻辑与 KVMem 参数测试：11 项通过，0 失败。
- PowerShell 脚本语法检查通过。
- 独立 `local/dsh-home` 配置生成及桌面 CLI 插件安装成功，未改动原 DSH_HOME。
- 发布文件采用白名单整理；未加入会话、凭据、机器专用路径、模型权重或运行时二进制。

这次验证没有启动第二个 GPU 模型实例，没有在空白机器上完整安装，也没有新增 GUI 操作或长上下文稳定性结论。自动下载脚本的网络下载/完整校验流程未重新执行；校验清单来自已核对的上游发布资产和模型版本。

11 项插件单元测试不能替代 DSH 整体端到端测试。参数面板迁移、长上下文、视觉输入仍应按 README 中的边界使用。

## 2026-09-25 追加：性能案例来源调整

旧 QQZ/rc2 性能 benchmark 已从当前 README、案例文档及其专用 evidence/图表资产中移除。默认 GSQ 的主要性能案例改为引用上游 issue [kvmem/kvmem-llama.cpp#47](https://github.com/kvmem/kvmem-llama.cpp/issues/47) 的第三方社区实测。

该社区案例由外部用户提交，本仓库没有在本轮重新执行其 rc3、Q5_K-MIX projector 或 9×K/V 矩阵测试。因此 README 将其标注为 community validation，而不是仓库维护者自己的 benchmark。

## 2026-09-20 追加:Deploy.ps1 一键编排脚本

新增 `scripts/Deploy.ps1`,编排既有已验证步骤:调用 `Download.ps1`(SHA256 校验不变)、解压 KVMem ZIP 到 `runtime/`、按"参数 → `local/launch.json` → 注册表 → 标准路径 → 开始菜单快捷方式"顺序探测 DSH 安装、跳过或调用 `Configure.ps1`、调用 `Start.ps1` 并轮询 `/health`(最长 360 秒)。

实际验证:PowerShell 语法解析通过;DSH 安装探测在原机器上验证了 `launch.json` 分支(命中 `F:\AI\DSHDesktop\application`,exe 与 desktop-cli.js 均存在),注册表分支确认不误报;其余探测分支(注册表/标准路径/快捷方式)仅经逻辑审查,未在多台机器实测。

未验证:完整 `Deploy.ps1` 端到端流程未重新执行(避免中断当时正在使用的模型服务),空白机器完整安装仍未进行。脚本失败时会给出明确错误与手动回退路径;手动部署流程(`Configure.ps1` 直调)保持原样可用。


## 2026-09-20 追加:compaction-replay-fix(压缩回放失败修复)

问题:长会话在上下文压缩时报 `multimodal query replay failed or cancelled` 并中断。溯源:错误字符串来自 KVMem 服务端二进制(`kvmem-llama.cpp` v0.16.0-rc2,`tools/kvmem-multimodal-server.h`),在 `query_replay` 路径中,回放不做槽位安置而检索选择按预算从新到旧截断,未缓存跨度超过预算时首个回放分块即失败(`block N has no GPU slot`);DSH 侧压缩摘要把整个前导区域作为单个巨型请求发送,且请求错误恢复不识别该错误。

修复(`patches/compaction-replay-fix/`,仅 DSH 侧):分段 map-reduce 摘要器(>16K 估计 token 时按 ≤8K 分段,每个分段请求以合成 `[compaction segment i/N]` 标记在浅层断开前缀缓存,不触碰深层驻留 KV;不再携带工具 schema),reduce 合并分段笔记输出标准检查点;`query replay failed or cancelled` 类失败现按上下文溢出处理(压缩后重试)。用户取消语义不变。

验证(RTX 4080 16GB / 128K / KV32K / reserve8K / MTP2,同一 headless 工作负载五个 ~100KB 文件读取):

- 基线(原 DSH + 原服务端):复现失败,turn 1 step 2 报错,服务端日志 correlated(`block 82 has no GPU slot`,`mandatory_trim kept=255 dropped=200`,回滚)。
- 补丁 DSH + 原服务端(端口 18201 与生产 18200 各一轮):从回放错误中恢复(回滚+重试),压缩成功提交(会话日志含 `compacted-summary`),上下文从 ~110K 降至 ~14.7K;压缩后 Agent 继续执行 10 次 `read` 与 2 次 `pwsh` 工具调用并给出正确汇总。
- 回归测试 10/10 通过(`test/compaction-chunk.test.mjs`:小区域保持单请求、分段请求尺寸上界、工具对不跨段拆分、取消、图像输出拒绝、错误传播、自愈路径、普通错误与用户取消不受影响)。

未验证/边界:服务端 C++ 流式修复(在 `prepare_ubatches` 中做回放槽位安置与回收)已原型化但**未随本补丁发布**——中途回收后 MTP 草稿(`common_speculative_process`)失败,需要上游对草稿镜像不变式做出决策;补丁保持哈希校验锁定 0.1.6-alpha.2,上游升级后需重新推导。192K/256K、视觉内容压缩、多实例并发未测。本修复不改变任何 KVMem 启动参数、模型或上下文配置。
