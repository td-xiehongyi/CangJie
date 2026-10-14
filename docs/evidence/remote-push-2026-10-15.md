# 当前源码推送前核验（2026-10-15）

范围：将当前源码业务分析、会话恢复、密钥会话修复及配套文档和测试同步到既有 CangJie/main。未开展下一阶段开发，未调用真实模型，未重新制作正式交付包。

- `npm run check`：沙箱内仓颉 opt.exe 被拒绝执行；沙箱外完整构建通过，包括 contracts、host、样例、reference、仓颉核心和 UI。
- 源码分析 access/session/API 与 model-key-validation 四份专项：38 项中 36 项通过、2 项失败。失败为分析结果意外 paused，以及修改模型配置遇到 MODEL_WORK_ACTIVE。
- 沙箱外独立 API 复测：6 项中 4 项通过、2 项失败，运行配置导入和模型配置切换均遇到 MODEL_WORK_ACTIVE。首轮分析结果 paused 未在该次复测重现。
- 因此不能沿用此前全部测试通过的记录来宣称当前状态全部通过。分析持久状态与后台任务结束时序需要进一步排查，本次没有修改实现来掩盖失败。
- 本次未重跑完整集成或浏览器套件，既有记录仅代表对应历史运行。
- 暂存文件常见私钥、模型 Key、GitHub Token 格式扫描未发现匹配；该扫描不保证排除所有秘密。Markdown 双空格换行保留，忽略该类行尾空格后暂存差异格式检查通过。

本地核验日志：`output/remote-push-check.log`、`output/remote-push-tests.log`、`output/remote-push-api-recheck.log`。运行输出及五份旧自动生成 JSON 证据保留本地，不纳入此次提交。真实模型质量、正式人员审核、跨电脑兼容性及原正式交付/T10仍待验收。
