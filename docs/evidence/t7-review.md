# T7 独立只读审查

2026-10-13，独立子代理 review_t7；按 executing-plans 要求只读审查，没有更改工作区或执行全量测试。

发现1项Important，无Critical/Minor：初版transfer测试依赖t7-freeze.json内本机绝对注册库路径，资格证据仍依赖旧.local-data目录；缺目录时无法恢复且freeze入口拒绝覆盖。

修复：保存119个原始发布/资格证据文件的可携带快照，恢复到项目相对路径；完整预检路径、摘要和已有文件，冲突拒绝覆盖，保留原始发布身份与时间，不调用publish。独立空目录恢复、重复恢复、冲突保留、摘要篡改及路径越界测试已执行RED→GREEN，见t7-fixture-red.log/t7-fixture-green.log。最终全量结果以t7-summary.json为准。修复没有再派第二轮审查。

审查核对15项冻结源摘要一致，新项目实际执行而非复用旧判定；正常、两种精确字段缺陷、缺证据及不同业务规则拒绝均有检查；records/tickets基线兼容两处一致、冲突不能通过；版本文件逐字核对且未重新发布。

审查留给主执行者的判定：

- 最终全量状态由当前实际命令输出核对，不能用历史7/7替代新增测试。
- 真实AI、实际人工审核和正式发布不属于本次已证实成果，门槛保持开放。
- 本地时间戳/摘要不是外部可信签名，不能据此宣称防止整个工作区被改写。
- 不主张任意第三方接入、任意关联字段重命名或完全无需宿主补强的盲迁移。
- 旧系统只做相关接口审查及完整回归，不声称已经穷尽证明全部正确性。

以上边界均保留在交付说明；没有搁置待修的重要问题。

## 全量回归追加发现

独立审查之后，全量回归在原有“scope changes retain project secrets; analysis budget survives retries”测试出现一次失败并耗尽运行器总时限。详细重复诊断捕获Windows对state.json替换的EPERM；见t7-api-intermittent-failure.log和t7-api-repetition.log。真实Windows读锁测试复现相同400/EPERM，见t7-state-lock-red.log；采用与候选持久化相同的有界重试并处理保存队列、异步错误收尾及关闭释放后，相关API及锁检查5/5通过，见t7-state-lock-green.log。长期锁拒绝、原字节保留、解除后恢复都被覆盖。该追加修复没有再次派独立审查；证据为回归测试和最终完整套件。

后续完整回归218/220：同类EPERM出现在运行checkpoint，replay子项及父项失败。再次以真实Windows读锁复现ArtifactStore失败，见t7-checkpoint-lock-red.log；网页状态与checkpoint改为共用 `artifacts/replace.ts` 的有限替换重试，相关API/锁检查最终6/6通过。原失败记录保留为t7-checkpoint-intermittent-failure.log。最终完整套件以t7-summary.json为准。
