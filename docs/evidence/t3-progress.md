# T3 执行记录

范围：只执行计划 T3，已有需求 v0.42/候选设计 v1.7 为依据；T4—T10 不在授权范围。当前目录无 Git 仓库，不初始化、提交、推送或发布。沿用当前工程，无额外工作树。

预检：Node24.19.0/npm11.17.0 可运行；已有 T2 HTTP、环境准备和仓颉调度共用。三类种子及标题更新采用相同声明式语言，标签和缺陷选择仅由验证宿主读取。

Ruling: 针对已由 id/attempt/intent 关联的查询，不能以返回 ownerId 不等于当前账号为由丢弃业务证据，否则权限泄露及所有者改变无法检出；创建仍核对 owner，更新/定向查询交由对应业务断言核对 owner。代价：必须持续覆盖错误对象、旧实验和错误意图的拒绝。

完成：初始缺设施RED见t3-red.log；取证问题的初始9/11见t3-initial.log，定向4/4 GREEN见t3-correlation-green.log；固定答案留出RED→GREEN；独立审查4项Important对应5项回归RED→GREEN；共享记录合同RED→GREEN。最终T3 20/20、全回归137/137、构建通过。参考设施和26场景已核对冻结；主要52阶段全部匹配，六源预览未变，26个副本自有进程均退出。

Final: fixed parameter repair, step-id binding/unsupported trace, contradictory oracle samples, actual mapping provenance — 5 review regressions RED→GREEN; shared ValidationRecord contract RED→GREEN; suite 137/137. No deferred minors.

Ruling: 一套验证含多个HTTP环境，顶层mappingHash汇总实际绑定映射集合，单用例mappingHash/copyId保留T2准备对应，mappingDefinitionHash独立保存公共定义。原因：不能用unbound定义冒充执行映射。代价：T5/T6消费记录时必须区分集合摘要与单项目映射。

本轮T3完成；已同步原路径计划2.27、需求/设计状态及README。未开始T4、未初始化Git/提交/推送/发布；完整产品与模型/真实UI/负载仍未验收。
