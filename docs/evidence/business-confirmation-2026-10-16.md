# 03业务确认与05契约管理核验（2026-10-16）

基于main@3ffa550的本机未提交修改。保留此前02分析截断/格式恢复修复和原有用户文件。

同日后续：05原候选阻断已修复并完成真实方案准备复验，当前状态以[后续核验](candidate-recovery-2026-10-16.md)为准；下文保留本阶段当时的证据。

## 实现

- 03先显示中文业务名称和“检查这项业务”；仅勾选的建议展开预期表单，关键问题及来源按需展开。保存后展示已确认业务，不再重复原建议。基础检查及测试目标折叠，既有选择不重置。
- 03不展示契约绑定、准备状态、版本选择、历史和纠正记录。这些集中在05同一业务卡，保留能力缺口导出及原方案准备流程。
- 03和05使用同一组件实例，切页不丢草稿；多页修订冲突时读取较新的规则库并保留本页输入，须再次明确确认。
- 已有英文业务标签在界面中文显示，原始分析与来源不改写；后续完整项目分析明确要求业务名称、流程标题及说明使用中文。未知英文名称显示不同编号的中文占位，仍可查看来源。
- 关闭契约同时要求明确的工单关闭业务名称及精确的已确认关闭预期，标题修改和其他实体关闭均被拒绝。05绑定只保留原预期、追加待确认版本，不能把自由业务预期替换为关闭预期。保存、重确认、选择、编译及执行读取入口均保留校验；旧历史不删除。

## 验证

| 范围 | 结果 |
| --- | --- |
| contracts、host、UI构建 | 通过 |
| 全部单元检查 | 79/79 |
| 项目规则、规则API、准备能力、动态编译/执行相关集成 | 42/42 |
| Edge：分析、业务确认、版本/契约与方案准备 | 21/21（17项页面交互，4项API/SSR等） |
| 独立代码复核 | 两项发现修复，最终无新增重要问题 |
| 当前4317实看 | 03显示3项中文选择，无展开的契约/版本/重复目标表单；05仍诚实显示原候选修订上限阻断 |

浏览器覆盖1280/390宽度，勾选后保存、来源和未决问题、03/05往返保留输入、两类修订冲突、未保存修改阻止确认、历史查阅、标题业务无关闭契约、关闭绑定不替换预期。测试截图和日志位于`output/business-confirmation-20261016/`，截图为隔离测试数据。

运行核对：工作台重启后PID3416、4317正常响应；2个项目、1个历史运行、规则修订/版本、现有分析预算和8份分析JSON的SHA-256均与重启前一致。记住的模型密钥仍可用，未输出密钥。当前真实草稿仍为6流程/3建议、1次调用/15155 token。本轮没有额外真实模型调用或替用户保存业务规则，浏览器留在03。

## 范围与限制

- 运行集成使用明确的隔离状态工单夹具，排除会启动子进程的demo启动器，符合原保守运行检查；未放宽产品的源码/环境策略。候选端到端集成含测试专用核心模型及本机假服务，不代表真实模型或原生核心正式验收。
- 未进行全套`npm test`、真实模型中文质量、正式人员审核或业务/负载验收；原T8性能问题和真实项目已有候选阻断保持开放。关闭能力仍只支持已冻结的完整预期，其他业务显示能力缺口。
- 未提交、推送或发布。重启清除了本次会话的临时运行凭据，正式执行前仍须在04重新准备。

复现命令：

```powershell
npm run build:contracts
npm run build:host
npm run build:sample
npm run check:reference
npm run build:ui
node --experimental-test-module-mocks --test tests/unit/*.test.mjs
node --experimental-test-module-mocks --test tests/integration/project-rules.test.mjs tests/integration/project-rules-api.test.mjs tests/integration/rule-readiness.test.mjs tests/integration/discovered-rule-execution.test.mjs tests/integration/discovered-rule-api.test.mjs
npx playwright test tests/e2e/project-rules.spec.ts tests/e2e/business-discovery.spec.ts tests/e2e/plan-preparation.spec.ts --output=output/business-confirmation-20261016/browser-results --reporter=list
```
