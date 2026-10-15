# CangJie v1.2 交互优化：实现与开发检查

日期：2026-10-15。Windows / Node 24.19.0 / Playwright 1.64.0 / 本机 Edge；手动观察另用 Codex 内嵌浏览器。
基线：`feat/workflow-v12@6947bd12836c20b27cad2abd29d35686509c56aa` 加现有未提交工作区。用户明确“实施”后开发，未提交、推送或合并。

## 实现结果

| 问题 | 已实现行为 |
| --- | --- |
| 02展开后错误与下一步被淹没 | 状态/预算/真实错误先呈现，范围与材料有独立标题、返回入口；展开定位标题，关闭保留草稿；模型接收方/名称变化后清除旧预览和同意，要求重新核对；发送正文单独查看，确认和调用明确分开 |
| 05/06/10重复03可编辑表单 | 显示当前业务与已选检查摘要，编辑返回03；方案生成按钮明确标注调用模型 |
| 07—09证据与审核层级混杂 | 分阶段标题与结果，09以准入状态、缺口和审核为主，完整证据进详情；0次对照不再以绿色暗示通过 |
| 04/10/12准备取消缺乏闭环 | 打开准备与执行分别命名；取消保留输入并返回准备入口；无自动模型、执行或复测 |
| 11已有历史却提示没有结果 | 明确要求选择历史运行；结论和覆盖范围在导出之前；合并重复导出入口 |
| 12重复完整报告 | 原运行摘要、变化确认和复测准备独立呈现，返回11查看报告；新旧记录通过parentRunId关联 |
| 详情遮挡和返回焦点 | 原生模态详情在窄屏占完整阅读宽度，背景不可误操作；关闭与Esc返回触发按钮；避免嵌套对话框 |
| 窄屏导航占据首屏 | 默认展示当前步骤与“全部步骤”，按需打开01—12，选中后收起 |
| 设置保存与模型调用混淆 | “保存到本机”与“保存并调用模型检查连接”分开；显示未保存状态，返回按钮标明步骤，草稿保留 |

现有视觉、业务规则、接口语义、数据、预算与准入门槛保留。TRUNCATED_OUTPUT仅增加解释、保留诊断码及累积预算说明。运行代码未以自动确认、隐藏错误或放宽断言换取通过。

## 修改文件

前端：`App.tsx`、`ProjectView.tsx`、`VerifyView.tsx`、`ReportView.tsx`、`SettingsView.tsx`、`api/client.ts`、`styles.css`；组件 `BusinessDiscovery`、`CandidateEvidence`、`CandidateReviewCard`、`JourneyDetails`、`PreparationCard`、`TargetLoadCard`、`TestGoals`、`WorkflowJourney`，新增 `DetailPanel`。均位于 `apps/ui/src/`。

测试：新增 `tests/unit/workflow-ux.test.mjs`、`tests/e2e/workflow-ux.spec.ts`；更新编号导航、分析、审核、自然流程、会话恢复、工作台与负载相关测试定位，以及 `workflow-view-boundaries` / `discovered-rule-ui` 的文案断言。原始资格、并发冲突、无自动请求等断言保留。`tests/support/discovery.mjs`允许指定独立测试输出目录。

文档：`docs/WORKFLOW_V12.md`及本记录。原有host修复、接口测试改动、5份历史JSON证据和运行记录未由本任务写入；测试输出统一放在本任务目录。

## 已执行检查

所有命令从 `C:\Users\xie\Desktop\Project` 执行。模型返回只使用loopback确定性服务，审核使用fixture身份，测试项目使用隔离数据；不代表真实模型或正式人工审核。

- `npm run build:ui`：TypeScript与Vite构建通过。
- `node --experimental-test-module-mocks --test tests/unit/workflow-ux.test.mjs tests/unit/discovered-rule-ui.test.mjs tests/unit/workflow-journey.test.mjs tests/unit/workflow-view-boundaries.test.mjs`：30/30。
- `node --test tests/browser/workflow-v12.test.mjs`：1/1。覆盖提示词草稿往返/收起、正文详情Esc焦点、目标保存刷新、可选12、当前步骤重复点击后继续导航、模型变更使旧同意失效、无自动分派；390/800/1280/1920px及100%/125%/150% CSS内容缩放不产生横向溢出。
- Playwright专项：`business-discovery candidate-review natural-workflow session-recovery workflow-ux`，21/21。覆盖完整材料预览与同意、结果引用、暂停、失败恢复、并发冲突、设置往返、准备展开、审核保存/失效、运行、报告键盘标签、导出、结束、取消和显式复测。
- 新增焦点/复测2项复跑属于上述21项的子集，不累加为不同用例。
- 实际4317仅查看项目、展开证据/范围、切换步骤、模型设置往返和关闭详情；未恢复真实分析、发布方案或运行负载。保留现有错误状态。

工作台补充回归 `workbench`：7/7，覆盖手动/自动账号准备、实际隔离运行、验证包加载复测、真实错误、双重审核、精确版本停用与失败/未知结果阻断负载。与上述21项为不同用例，共28项Playwright用例；导航脚本1项独立统计。测试中实际执行的是本机隔离样例，不代表用户项目或生产负载验收。

最后的导航、模型变更同意失效和取消焦点修订分别通过导航脚本、工作台7项及焦点2项复跑。修改过时文案定位时保留原资格断言；03业务确认改为返回03核对，新增更换服务后的显式发送确认。格式检查通过。

## 截图与日志

独立证据目录：[本轮输出](../../output/ux-workflow-v12-20261015-01a13f78/)。[原审查与方案](../../output/ux-workflow-v12-20261015-01a13f78/审查与交互方案.md)。

| 场景 | 修改前 | 修改后 |
| --- | --- | --- |
| 02错误/分析 | [前](../../output/ux-workflow-v12-20261015-01a13f78/02-analysis-failed.jpg) | [后](../../output/ux-workflow-v12-20261015-01a13f78/after-02-error.jpg) |
| 09审核阻断 | [前](../../output/ux-workflow-v12-20261015-01a13f78/09-review-blocked.jpg) | [后](../../output/ux-workflow-v12-20261015-01a13f78/after-09-blocked.jpg) |
| 11未选运行 | [前](../../output/ux-workflow-v12-20261015-01a13f78/11-unselected-run.jpg) | [后](../../output/ux-workflow-v12-20261015-01a13f78/after-11-unselected.jpg) |
| 12可选复测 | [前](../../output/ux-workflow-v12-20261015-01a13f78/12-optional.jpg) | [后](../../output/ux-workflow-v12-20261015-01a13f78/after-12-optional.jpg) |
| 800px详情 | [前](../../output/ux-workflow-v12-20261015-01a13f78/14-narrow-details.jpg) | [后](../../output/ux-workflow-v12-20261015-01a13f78/after-narrow-details.jpg) |
| 800px导航/分析 | [前](../../output/ux-workflow-v12-20261015-01a13f78/15-narrow-analysis.jpg) | [后](../../output/ux-workflow-v12-20261015-01a13f78/after-narrow-analysis.jpg) |

日志：`build-final.log`、`unit-final.log`、`navigation-final.log`、`browser-final.log`、`browser-21.json`、`focus-final.log`、`workbench-final.log`。自动截图在`automated/`，旧输出目录未覆盖。本轮截图不是同一瞬间的性能基准；历史`04-ready.jpg`不作为正确页面证据，使用`04-ready-settled.jpg`。

## 仍未验证

- 浏览器原生125%/150%缩放：内嵌浏览器快捷键未改变viewport/DPR，当前证据只有CSS内容缩放，不能替代原生浏览器缩放验收。
- 真实源码外发、付费模型效果、TRUNCATED_OUTPUT恢复、正式人员审核、真实目标负载、真实修复后业务复测。
- 全产品Windows原生完整回归、完整读屏/全键盘、手机真机、旧发行包；本次仅运行与UX修改有关的开发检查。
- `target-load.spec.ts`同步了新按钮和分区定位，未运行其中真实k6负载；负载输入/百分数/准入由无负载的隔离浏览器测试检查。

本轮结果为界面实现和指定开发检查，不是正式验收完成；以上待验事项继续开放。
