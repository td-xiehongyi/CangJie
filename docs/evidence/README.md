# CangJie 证据与历史文件索引

更新：2026-10-17。当前源码包含四阶段导航、第二阶段结果闭环，以及第三阶段提前支持提示和示例体验；真实新手试用待实际参与者执行。提交核验见下表，实际提交及推送状态以Git为准；此前文档清理基线main@7581aae。各轮产品验证范围分别记录，正式人工验收按[验收指南](../MAIN_MANUAL_ACCEPTANCE.md)另行执行。

各证据页保留产生时的源码、环境、日期、身份和结果；“未提交”“未推送”“延期”等历史表述不能当作当前状态。不同日期的通过数不累加、不互相覆盖。保存原始失败和日志，不将测试审核身份当实际人员签署。

## 当前开发证据

| 内容 | 入口与范围 |
| --- | --- |
| 新手流程前三阶段提交核验 | [提交范围与核验](novice-flow-push-2026-10-17.md)：分项构建与隔离核心编译、单元104、API专项5通过；常规整体构建的默认核心输出受限，未记为全命令通过；本机历史、生成JSON及output不提交 |
| 提前支持与示例第三阶段 | [实施与验证](novice-entry-2026-10-17.md)：宿主/UI构建、单元104、相关集成37、Edge13通过；独立练习副本真实失败→修复→复测，原历史保留；[真实新手任务](../NOVICE_TRIAL.md)待实际参与者执行 |
| 问题—修复—复测第二阶段 | [实施与验证](result-repair-retest-2026-10-17.md)：宿主/UI构建、单元104、相关集成24、Edge20通过；隔离样例真实失败→修改业务源码→原规则复测通过，主历史与原证据保留；不等于外部模型或正式人员验收 |
| 四阶段导航第一阶段 | [实施与验证](four-stage-navigation-2026-10-17.md)：UI构建、单元94、相关集成21、Edge51及旧编号专项1通过；真实新手与正式验收待进行 |
| 2026-10-17源码与提交前核验 | [提交核验](remote-push-2026-10-17.md)：构建、单元92、相关Edge27、导航1、负载集成16及专项；完整npm test触及900秒上限，未全量通过 |
| 02分析入口与格式恢复 | [双入口与短引用](analysis-entry-2026-10-16.md)、[已保存响应恢复](discovery-envelope-2026-10-17.md) |
| 03确认与选择 | [业务预期和契约](business-confirmation-2026-10-16.md)、[中文预填](business-ai-prefill-2026-10-16.md)、[空检查阻断](check-selection-2026-10-17.md) |
| 05方案准备 | [05—08合并](plan-preparation-2026-10-16.md)、[候选新任务与真实复验](candidate-recovery-2026-10-16.md) |
| 09审核至执行 | [隔离测试审核及执行链](review-execution-2026-10-16.md)，不能代替原项目实际人员审核 |
| 10目标负载 | [短时真实k6及原目标复测](target-load-2026-10-16.md)：保留旧失败；不外推生产、更高负载或耐久 |
| 启动、模型与样例 | [启动与设置](launcher-settings-2026-10-15.md)、[模型与原生目录修复](model-reliability-2026-10-16.md)、[样例网站](sample-websites-2026-10-16.md) |
| 历史Windows续验 | [Windows验证](windows-validation-2026-10-15.md)、[v12回归](regression-main-2026-10-15.md)，仅证明当时范围 |

真实模型已有局部候选复验，不等于完整业务质量验收。实际人员双审核、正式新目录交付、真实修复后复测、完整键盘/读屏与原生窗口、全套/全浏览器最终通过及T10仍按各自要求取得证据。

## 专题证据与开放验收

| 阶段 | 专题入口 |
| --- | --- |
| T0环境与协议 | [环境](environment.md)、[JSONL协议](protocol-v1.md) |
| T1解释器 | [核心合同与语言](interpreter.md) |
| T2项目接入 | [HTTP与独立数据库](access.md) |
| T3独立验证 | [验证设施](validation-harness.md) |
| T4候选 | [模型与候选准入](candidate.md) |
| T5方案库 | [审核、匹配和停用](registry.md) |
| T6工作台 | [报告、执行与无模型复跑](workbench.md) |
| T7迁移 | [冻结模板迁移](transfer.md) |
| T8负载 | [原目标负载证据](target-load.md)、[后续修复与复测](target-load-2026-10-16.md) |
| T9正式交付仍开放 | [交付检查](release-check.md)、[执行记录](t9-progress.md)、[审查](t9-review.md) |
| T10两组对照未完成 | [对照方案与前置条件](comparison.md)、[准备记录](t10-progress.md) |
| S1—S5源码分析与受控执行 | [受控读取](discovery-source.md)、[分析](discovery-analysis.md)、[规则](project-rules.md)、[执行](discovered-rule-execution.md)、[开发交付](discovery-release.md) |

其余修复、审查和专题页仍保留原位；本文提供入口，不把旧快照改成当前验收结论。

## 阶段进度与审查归档

2026-10-17将以下15份T0—T8记录移入archive。只修正搬移后的文档链接；原日志、数值、日期、工程决定及JSON不改。正文里的本机绝对路径、旧文件名和停止点均按当时快照理解。

| 阶段 | 原文入口 |
| --- | --- |
| T0 | [进度](archive/t0-progress.md) |
| T1 | [进度](archive/t1-progress.md) |
| T2 | [进度](archive/t2-progress.md) |
| T3 | [进度](archive/t3-progress.md)、[审查](archive/t3-review.md) |
| T4 | [进度](archive/t4-progress.md)、[审查](archive/t4-review.md) |
| T5 | [进度](archive/t5-progress.md)、[审查](archive/t5-review.md) |
| T6 | [进度](archive/t6-progress.md)、[审查](archive/t6-review.md) |
| T7 | [进度](archive/t7-progress.md)、[审查](archive/t7-review.md) |
| T8 | [进度](archive/t8-progress.md)、[审查](archive/t8-review.md) |

## 已合并删除文档的历史原文

以下链接固定到清理前Git提交ceb8d95236cd6c85bc245fd9a08f0112b20a4e99。即使当前路径已删除，历史原文仍可按该提交回查。离线时在项目根目录执行`git show ceb8d95:<原仓库路径>`；不要用恢复旧文件覆盖当前指南。

| 原仓库路径与历史原文 | 当前承接位置 |
| --- | --- |
| [docs/MAIN_VERSION.md](https://github.com/td-xiehongyi/CangJie/blob/ceb8d95236cd6c85bc245fd9a08f0112b20a4e99/docs/MAIN_VERSION.md) | [快速开始的主版本与数据目录](../QUICK_START.md#主版本与数据目录)及根README当前状态 |
| [docs/superpowers/specs/2026-10-14-natural-workflow-design.md](https://github.com/td-xiehongyi/CangJie/blob/ceb8d95236cd6c85bc245fd9a08f0112b20a4e99/docs/superpowers/specs/2026-10-14-natural-workflow-design.md) | [当前流程](../WORKFLOW_V12.md)的操作保护/交互标准及[人工验收指南](../MAIN_MANUAL_ACCEPTANCE.md) |
| [docs/superpowers/plans/2026-10-14-natural-workflow.md](https://github.com/td-xiehongyi/CangJie/blob/ceb8d95236cd6c85bc245fd9a08f0112b20a4e99/docs/superpowers/plans/2026-10-14-natural-workflow.md) | 有效约束合并进当前流程；原完成成绩仍见[natural-workflow](natural-workflow.md) |
| [docs/superpowers/plans/2026-10-15-windows-validation-merge.md](https://github.com/td-xiehongyi/CangJie/blob/ceb8d95236cd6c85bc245fd9a08f0112b20a4e99/docs/superpowers/plans/2026-10-15-windows-validation-merge.md) | [Windows历史验证](windows-validation-2026-10-15.md) |
| [docs/superpowers/plans/2026-10-15-flow2-simplification.md](https://github.com/td-xiehongyi/CangJie/blob/ceb8d95236cd6c85bc245fd9a08f0112b20a4e99/docs/superpowers/plans/2026-10-15-flow2-simplification.md) | [流程二历史证据](flow2-simplification-2026-10-15.md)及[后续回归](regression-main-2026-10-15.md) |

main-version-baseline.json等冻结记录仍引用旧文件路径，保持原字节；它们记录当时文件集合，不能按当前工作区删除状态重算历史摘要。旧output备份及原审查报告也按当时提交解释，不批量重写或去重。

## 依赖与本轮清理边界

保留所有历史日志、机器JSON、冻结套件、样例/夹具README和T9/T10材料。t7-freeze.json是迁移/负载测试输入，t9-latest.json被交付启动检查读取；打包器仍读取delivery-guide.md、demo-outline.md和release-check.md。

产品测试可能改写既有t2/t3/t8/t9生成JSON，运行前备份、生成新结果后按原字节恢复；不能为文档清理直接运行会覆盖证据的全套测试。新旧测试身份、真实模型与正式人员审核分别记录。

本轮校验摘要保存在本机`output/documentation-cleanup-20261017/`；它仅证明文档引用、迁移和保留范围，不是产品验收。未触碰139份output重复副本、旧预览服务、交付ZIP或运行数据，也未启动下一阶段开发。

2026-10-17清理核验：删除2份已完成临时计划、合并后删除3份旧说明，归档15份记录；README由119行精简为49行，docs内Markdown由89份减为85份。93份当前文档的377个本地链接/锚点通过，git diff --check通过；828份受保护文件中817份字节相同，11份历史文档仅修改链接目标，原正文和成绩一致。打包与测试输入保留，运行/测试代码无本轮修改。详细基线、迁移映射及verification.json在上述本机目录，原5份生成JSON修改保持任务开始时的字节。
