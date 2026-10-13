# T3 独立验证设施与种子验收

日期：2026-10-13。范围：计划 T3；模型生成、候选审核发布、真实产品 UI、验证包和负载仍在 T4—T10。

最终验证：`npm run verify -- validation-harness` 20/20；`npm test` 137/137；`npm run check`通过。四组主要结果的26个HTTP副本共70份原始交换证据均可读取且不含测试密码/Token，52个自有进程退出标记均为stopped；最新预览六源文件哈希未变。汇总见 [验收摘要](t3-summary.json)。

## 验证内容

三类种子位于 `templates/`，与生成候选使用同一受约束语言和真实仓颉解释器：保存结果、重复提交、权限隔离。每类包含正常、业务缺陷和证据不足场景，每场景再有一份生成器不可见的参数/对象/身份变体。标题更新另有正常、优先级重置、所有者改变和证据不足四种场景及其变体。标题更新定义在 `tests/fixtures/title-update.json`，仅用于验收验证设施，不是 T4 模型生成成果或正式发布模板。

合计26个固定场景，分别执行观察验证和完整 HTTP 链，共52个用例阶段。正常对照逐断言通过；缺陷必须命中指定断言，标题、优先级、所有者的其他断言仍核对；证据不足逐断言为 inconclusive。恒真、恒假、仅看成功状态、固定所有者和优先级等错误候选被拒绝。崩溃或超时记录验证未完成，不能计为业务缺陷检出。

依据来自已确认需求、计划 T3 和候选设计 v1.7 的字段保持规则；预期结果是独立固定值，不从候选输出计算。参考服务业务行为独立实现，不复用工单样例的业务代码；仅复用已有合成账号和基线初始化合同。它是专用验证设施，不是实际外部依赖的模拟接入。`tests/reference/suite-manifest.json` 保存规则、标签、行为和版本，`suite-lock.json` 固定服务、映射、观察数据和清单的 SHA-256；变化后要求重新核对。变体没有发送给模型，本轮尚无模型调用；不能将固定回归对照宣称为真实模型的未见评估或任意规则正确性证明。反复用于修订后的留出集必须更新，才能再次标为未见评估。

## 入口与接口

```powershell
npm run verify -- validation-harness
npm test
npm run check
```

`loadValidationSuite(ruleId)` 只加载四项已冻结规则，无可信参考的规则返回 `UNSUPPORTED_RULE`；修改加载后的标签、规则或对照配置返回 `SUITE_CHANGED`，源文件哈希变化返回 `REFERENCE_CHANGED_REVIEW_REQUIRED`。

`validateAgainstSuite(candidate, suite)` 输出与共享 `ValidationRecord` 合同一致的记录。静态校验、对照覆盖、观察和 HTTP 全部满足时 `gateResults.admitted=true`，仅表示本对照集技术检查通过；不进入正式模板库、不代替审核和项目试运行。候选始终只能使用受约束原语，不能访问标签、答案文件、服务缺陷选择或任意代码。T4 的模型上下文筛选仍待实现。

样本按经核对的操作顺序和 actorRef 绑定，不依赖候选自行命名的 stepId；等价步骤重命名可通过。未支持的操作轨迹保留不完整验证记录，不能抛异常后遗失整个验证任务。套件只替换候选已声明的参数，不能替候选补齐缺失输入。每阶段保存实际代入参数后的 `effectiveCandidateHash`。

HTTP 阶段通过 T2 的独立副本、旧进程隔离、合成数据基线、身份核对、执行和取证接口，最终查询不直读数据库。每个用例独立准备；同一用例的重复提交或更新步骤之间不复位。原始请求/响应证据、身份与对象关联、分页完整性保留；密码和 Token 清理与过滤沿用 T2。

定向查询绑定了对象 ID 与 attempt 后，返回另一所有者的对象应交给业务断言处理；否则权限泄露会被吞成未知。创建仍核对所有者，更新核对对象/attempt/intent，查询继续拒绝错误对象和旧实验；身份由 `/me` 核对。未定向查询仍保留账号归属核对。

## 追溯与证据

记录包含候选、规则、解释器版本、对照集摘要和结果；`mappingDefinitionHash` 是公共映射定义，`cases[].mappingHash` 是该用例绑定测试副本后的实际映射摘要，`cases[].copyId` 指向对应 T2 准备与证据。顶层 `mappingHash` 汇总按用例顺序排列的 `{caseId,copyId,mappingHash}`，不能将它当作任一单独项目映射。

- `validation:<uuid>`：`.local-data/validation/<uuid>-record.json`，包括失败/不完整记录。
- `observation:<runId>:<stepId>`：`.local-data/validation/<runId>.json`，保存交给真实仓颉的观察与返回状态。
- `reference:<copyId>:<hash>.json`：`.local-data/projects/<copyId>/evidence/<hash>.json`，可通过 `readReferenceEvidence` 读取已过滤的 HTTP 交换；同目录 `events.jsonl` 保存准备、复位、身份和映射摘要。
- [主要四组实际结果](t3-result.json)、[T3 验证日志](t3-green.log)、[完整回归](t3-all-tests.log)、[构建](t3-check.log)、[预览源文件核对](t3-preview-baseline.json)。

本轮未接入模型、未审核发布、未执行负载，最新四页仍为静态预览。
