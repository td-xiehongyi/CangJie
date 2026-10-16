# T7 执行记录

计划：docs/superpowers/plans/2026-10-11-website-verification.md，T7。
授权：用户要求“完成T7”。使用 executing-plans / test-driven-development，最后独立审查。

Ruling: 当前没有Git仓库，沿用现有目录和本记录，不初始化Git、提交或调用依赖Git的阶段脚本；风险为无提交级回退，原文件及原证据保留。
Ruling: T4真实模型与实际双审核未完成，T7开发验证仅使用隔离库的确定性已验证候选，不冒充正式发布；正式端到端闭环仍开放。
Pre-flight: T5 PublishedTemplate由T6 RunExecutor按精确版本重核资格；T7只增加报名样例、映射和迁移验收，复用该接口，不继承工单结论。
Pre-flight: HTTP适配器要求关联字段id/ownerId/intentId/attemptId保持协议名称。报名改业务字段、登录字段和接口路径，保留这些取证关联字段；任意关联字段改名不在本轮已证实能力内。
2026-10-13 11:03:36 +08:00 已在报名适配前冻结四个隔离测试发布记录，见t7-freeze.json。
Ruling: 首次迁移真实运行因BASELINE_MISMATCH失败：宿主初始化协议把记录数硬编码为tickets。新增通用records计数并兼容旧tickets，保持初始化与健康检查双重核对，冲突别名拒绝；风险是宿主接入协议发生补强，因此不把本轮描述为从未修改宿主的纯映射盲迁移。模板/判定/验证集不修改。
Final: fixed 独立审查Important本机证据目录依赖 — 空目录恢复测试RED→GREEN；归档119份原字节证据，恢复不发布、不覆盖冲突。最终全量待命令完成。
Final: Ruling: 独立审查未判定项采用证据边界：仅实测全量结论；真实AI/实际审核保留开放；本地摘要非签名；关联字段协议和受控样例限制保留；回归不是旧系统完备正确性证明。风险均为夸大结论，交付明确排除。
回归额外发现：原有网页分析预算测试偶发未处理EPERM，诊断重复测试捕获state.json原子替换被Windows读锁拒绝，不是模板迁移错误。真实Windows文件锁回归已RED→GREEN，网页API与锁检查5/5通过；持久读锁有限失败且原文件保持，解除后可再次保存。API保存采用与候选保存相同的有限锁重试，保存队列后续可恢复、错误链被处理、关闭时仍释放HTTP服务。保留原全量失败、重复诊断和修复前中断日志；未放宽测试断言、模型预算或超时。
Ruling: 为完成真实全量回归，修复本轮暴露的旧网页状态保存缺陷；范围限于持久化/错误收尾，不改变业务判定和模板。风险为共享网页状态保存行为变化，已加真实文件锁正常/持续阻塞/恢复检查并重新跑完整套件。
第二次完整回归218/220：同类EPERM发生在运行checkpoint，导致replay子项及父项失败；t7-checkpoint-intermittent-failure.log保留。真实文件锁对ArtifactStore再次RED→GREEN，网页状态/运行checkpoint共享有限替换重试，相关6/6通过。最终完整回归重新执行，不把218/220写成通过。

Task T7: complete (development acceptance). Final npm test 221/221, npm run verify -- transfer 11/11, npm run check passed. Windows/API targeted regressions 6/6. 15 frozen sources and 6 preview sources unchanged; 0 formal publications. Actual AI and human approval gates remain open.
