# T7 冻结模板迁移到报名网站

日期：2026-10-13。范围：本机 Windows / Node 24 / Express 5 / SQLite / HTTP JSON 合成数据。用户授权“完成T7”，不进入T8。

## 证据与结论边界

四个模板在报名适配前 **2026-10-13 11:03:36 +08:00** 冻结，见 [冻结记录](t7-freeze.json)。包含三类种子、新增字段保持候选、完整PublishedTemplate、ruleHash、candidateHash、解释器版本、验证集摘要和15个冻结源文件的SHA-256。每次迁移验收先逐项核对冻结摘要，再检查精确版本资格。

这些是经过真实仓颉、独立HTTP对照和工单副本试运行的**确定性测试候选**，仅在隔离测试库由明确测试身份发布。迁移前完成测试前置准备；迁移阶段不调用模型、不修改模板/规则/判定、不重新发布，也不复用工单项目的业务通过结论。真实DeepSeek候选生成及实际人工双审核正式发布仍未完成；本轮只证明固定模板的受控迁移。

## 项目映射与测试约定

报名主流程包括提交、查询及编辑报名资料，无支付或限额争抢。测试业务约定与映射保存在 [报名说明](../../samples/registration/README.md) 和 [verification.json](../../samples/registration/verification.json)。这是开发验收身份的业务确认；真实接入仍需要用户确认具体业务规则和数据。

| 抽象项 | 工单 | 报名 |
| --- | --- | --- |
| 登录 | POST /login，username/password | POST /sessions，account/passphrase |
| Token、身份 | token、/me.id | session.access、/participant.participant.key |
| 创建/查询 | /tickets | /enrollments |
| 编辑 | PATCH /tickets/:id | PUT /enrollments/:id/profile |
| title、priority | title、priority | displayName、track |
| 查询列表/计数 | items、total | entries、page.count |
| 完整性 | hasMore、complete | page.more、page.exhaustive |

关联字段 id/ownerId/intentId/attemptId 保留现有取证协议名称。执行器尚不支持它们任意改名；不把这次结果外推为任意网站可接入。报名创建者保有回执访问权，ownerId表示业务归属人；编辑显示姓名必须保持track及ownerId。保持规则只是字段相等关系，不把报名组别解释成工单优先级。

## 实际验收

入口：`npm run verify -- transfer`。测试自动从 `tests/fixtures/t7-frozen-evidence.json` 恢复119个原始发布/准入证据文件到项目相对路径，再逐版本核验资格；已有同名文件必须字节相同，否则拒绝覆盖。可独立运行 `node scripts/t7-fixture.mjs restore`。恢复不调用模型或发布API，冻结版本及发布时间保持不变。空目录恢复、幂等、冲突保留、篡改及越界拒绝均有测试；这不是T9完整应用交付验收。`scripts/t7-freeze.mjs` 是原始冻结生成入口，已有冻结记录时拒绝覆盖，不能用重新冻结掩盖变化。

- 正常报名：三类种子及新增字段保持模板均执行真实HTTP动作，并产生报名独立副本、运行、观察和证据；预期六条业务断言全部通过。
- 组别误重置：仅 `unchanged-priority` 失败，姓名更新及归属保持通过。
- 归属人误改：仅 `unchanged-owner` 失败，其余两条通过。
- 取证缺字段：`unchanged-priority` 给出 `inconclusive`，不继承工单的成功结论。
- 规则不同：若报名编辑按业务规则应重置组别，则无模板匹配；强行引用原模板在执行前被 `RULE_VERSION_MISMATCH` 阻止。
- 初始化计数错误或新旧计数字段冲突：`BASELINE_MISMATCH`，没有业务HTTP动作。
- 迁移前后PublishedTemplate文件逐字节一致，仍有资格，没有新增发布版本。包导出含报名的固定模板、映射、运行记录和HTTP证据，测试密码不进入包。

缺陷变体只在评估专用源码副本中构造；预期标签留在集成测试，RunExecutor与模型不接收预设缺陷答案。报名参与了适配和调试，不称为未见项目或独立盲测。只有这两个自建样例的受控结果，第三方网站未验证。

## 失败与人工帮助

1. [缺失实现RED](t7-red.log)：先验证报名入口尚未存在，随后实现。
2. [首次迁移失败](t7-baseline-red.log)：宿主基线检查写死 `tickets`，报名被正确阻断。修复为通用 `records` 计数，保留旧tickets兼容，冲突别名拒绝；初始化和健康检查都核对计数。**宿主接入协议有补强，不能把本轮当作完全无需修改宿主的纯映射盲迁移。** 模板、规则、解释器和验证集未改。
3. 人工工作：开发者编写受控样例/映射与正常业务约定、定位基线协议问题、构造评估副本、审查证据；用户只授权本阶段，没有被记作真实业务审核者。
4. 本机受限执行环境曾拒绝仓颉opt.exe，获执行权限后编译并验收；这是环境权限问题，不计作业务缺陷检出。

5. 独立审查发现初版依赖原本机证据目录，已补可携带快照和无重新发布的恢复入口；缺失实现RED与恢复GREEN分别见 `t7-fixture-red.log`、`t7-fixture-green.log`。
6. 全量回归暴露原有网页状态及运行checkpoint的Windows读锁EPERM，分别以真实文件锁复现后，共用有限替换重试，并修复保存队列恢复及错误收尾；相关6项通过，原失败和诊断日志保留，未放宽测试。模板或报名判定无变更；最终全量使用即时详细报告，失败详情不再延后到进程退出。

最终结果：**T7专项11/11、完整回归221/221、网页API及真实文件锁6/6、完整构建通过**。见 [机器摘要](t7-summary.json)、[独立审查与修复](t7-review.md)、[全量日志](t7-all-tests.log)、[构建日志](t7-check.log)。本轮T7开发验收完成，真实模型/实际人工双审核的正式闭环继续开放；T8—T10未开始。
