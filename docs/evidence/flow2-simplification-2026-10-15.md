# 流程二恢复与交互精简

日期：2026-10-15。分支：feat/workflow-v12。已实施并加载到本机4317，未提交、推送或真实调用模型。全量回归未全绿。

## 本次变化

- 恢复资格由服务端计算并在恢复接口重复核验。检查时间、次数、完整编码请求加输出预留的token预算、源码累计量、来源和接收方；请求构建预检不预占预算、不调用网络。耗尽后给出当前原因和有效下一步。
- 02主路径为材料摘要/可选关注重点 → 一次本地检查 → 明确同意发送 → 业务草稿。范围编辑折叠，检查后隐藏编辑区；不要求单独保存、重新索引、预览、勾选同义同意。
- 草稿自动保存于当前浏览器，失败提示及刷新保护保留；干净缓存采用服务器范围，脏范围保留旧修订号，防止覆盖其他页面修改。模型变化清除材料确认，实际发送仍绑定快照/范围/模型/提示词/文件摘要。
- 02不再显示04岔路、重复的03页头入口或项目规则版本库。建议的“去03核对这项业务”合并聚焦与导航，03优先呈现对应项；来源事实、文档/测试预期及AI推断仍区分，人工确认未自动化。
- 当前失败原因置前；历史诊断和技术预算移入详情。无结果时只说明读取与调用记录已保存，不虚称已有业务草稿。

## 验证

| 检查 | 结果与边界 |
| --- | --- |
| 新增宿主恢复专项 | 7/7；先红后绿，覆盖五类耗尽、暂时中断及完整输入预留；核对记录不变、没有网络请求 |
| 浏览器相关回归 | 17/17，包含02完整链路、来源失效、暂停/恢复、冲突、03人工确认、既有运行/报告等；使用隔离确定性服务 |
| 单元相关回归 | 29/29，涵盖状态竞态、编号边界、规则和设置呈现 |
| 编号导航冒烟 | 1/1，草稿、模型变化后重新检查材料、详情焦点、目标保存及不自动调用 |
| 最终UI修订复验 | 默认材料/过期状态2项、成功草稿及03承接宽窄屏2项、范围冲突1项均通过；包含在相应功能覆盖中，不当作额外独立总数 |
| 构建 | contracts、host、样例、reference、仓颉核心和UI构建完成；UI最终构建通过 |
| 格式 | git diff --check通过（存在仓库既有换行转换提示） |
| 独立静态审查 | 发现的旧干净草稿覆盖、请求预算估算、建议目标丢失均修正，复查无Important/Critical |
| 完整npm test | 457项，453通过、4失败；不是全量通过。首次沙箱拒绝本机opt.exe，获准沙箱外运行后得到该结果 |

完整回归失败记录：

1. `old_record_excluded from current intent/attempt evidence`：STARTUP_OR_BASELINE_FAILED；定向复跑通过，未确认一次性启动失败的根因。
2. `T9 fresh delivery performs candidate, report, actual k6 and process-restart replay`：重开复测观察到interrupted/HOST_EXITED_BEFORE_TERMINAL；定向复跑仍失败。失败在交付runner第67行。当前state读取存储再覆盖active，存在终态切换窗口的嫌疑，未修复、未下最终根因结论。
3. `incomplete target evidence pauses and resumes the same candidate without a model call`：已暂停元素存在但隐藏；旧测试从默认verify页进入，未迁移编号06试运行操作位置。本次未修改此测试。
4. `actual settings save-only handler persists without making a model connection request`：测试转译临时模块未包含SettingsView依赖的workflowJourney，ERR_MODULE_NOT_FOUND。本次未修改此测试。

相关入口：[全量日志](../../output/flow2-implementation-20261015/full-suite.log)、[失败复查](../../output/flow2-implementation-20261015/failure-recheck.log)、[浏览器](../../output/flow2-implementation-20261015/browser.log)、[单元](../../output/flow2-implementation-20261015/unit.log)、[最终UI](../../output/flow2-implementation-20261015/final-browser.log)、[导航](../../output/flow2-implementation-20261015/navigation.log)。以上三项尚未解决，不据此宣称全产品验收完成。

## 本机实际加载与保护

已核对原4317进程32216确为scripts/workbench.mjs；检查无运行任务且密钥remembered后，关闭空闲会话并重启为PID39912（后续需实时复核）。主版本入口及数据目录沿用main-version.json。

重启前后两个项目的分析ID、修订号、budget和reads摘要一致，记住的密钥仍可用。当前工单会话确认为deadline不可恢复；现场新页面不再显示继续按钮。未对真实会话点击发送或恢复。服务重启清除了运行条件的本次会话资格，后续实际运行仍需04重新准备。

旧工作区修改前副本位于`output/flow2-implementation-20261015/before`。五份原脏历史证据按修改前字节恢复并校验，测试生成内容另存generated-evidence；摘要见[preserved-evidence.json](../../output/flow2-implementation-20261015/preserved-evidence.json)。没有重置Git或覆盖其他并发修改。

![精简后的预算耗尽状态（隔离浏览器测试）](../../output/flow2-implementation-20261015/exhausted.png)
![材料确认页（隔离浏览器测试）](../../output/flow2-implementation-20261015/preview-1280.png)

真实模型输出质量、正式人员审核、全产品原生验收仍未完成；当前改造不改变这些既有边界。
