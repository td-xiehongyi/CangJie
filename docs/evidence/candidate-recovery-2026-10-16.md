# 05方案准备失败修复与真实复验（2026-10-16）

基于本机main@3ffa550的未提交修改；保留此前02、03、05调整及用户现场。

## 失败原因

1. 旧save-rule候选的三次输出都通过JSON/基础格式检查，但混入标题修改步骤、使用未约定的参数名或断言ID。独立验证要求与公开执行接口一致的步骤/角色序列和断言集合，而生成请求没有完整提供这些要求，因此出现观察轨迹不支持、对照判定不匹配。旧任务最终被正确拒绝。
2. API一直重新打开已拒绝任务，任务本身不会重置修订次数；05又禁用了按钮，没有明确的新任务入口。
3. 新版示例增加了独立demo启动器，原运行检查扫描所有脚本，将不会由测试入口执行的启动器当成运行依赖，造成TARGET_PROFILE_GAP。
4. 当前项目仍保存着拉取main之前的运行指纹。源码新增演示页面等内容后，准备被CONDITIONS_CHANGED_RECONNECT_REQUIRED正确阻断；本轮经核对重新接入同一项目、重新准备隔离环境，并沿用原已确认的提交保存预期。
5. 真实复验首次返回将owner角色填入requiredCapabilities，误走能力缺口等待。该字段缺少明确的操作枚举，需要将角色/表达式混填识别为模型格式错误。

## 修复

- 为四项基础检查提供公开的参数名、断言ID及操作/角色顺序；明确同一检查内保持依赖。候选基础检查提前拒绝格式不符，独立验证逻辑及其私有案例/判定保持不变。请求不包含完整模板、表达式答案、私有案例值或预期判定。
- requiredCapabilities公开schema限定为操作ID；已知角色或表达式误填按output错误进入最多两次自动修订。真正未知操作仍按能力缺口阻断，不替换或忽略需求。
- API要求精确restartCandidateId及已拒绝状态才可新建任务；默认恢复已拒绝任务明确报错。旧候选文件、预算和历史保留，新任务仍使用原有限预算。同步预留阻止同项目并发派发，过期ID不能替换新的任务。
- 按规则公开已拒绝候选摘要，解决A失败后切到B、再回A无法找到恢复入口的问题。05先展示新任务预算，允许取消，明确确认后才派发；发送授权、运行条件及业务确认继续校验。
- 运行检查覆盖已声明启动/初始化入口及其静态依赖；源码全集仍参与来源哈希、链接检查和复制。动态/缺失/越界依赖拒绝；Node模块仅支持已核对的fs、fs/promises、path、url、crypto、sqlite以及Express，其他模块明确给出缺口。createRequire、Worker、vm、cluster、node:test、inspector等反例均阻断；非法argv保持配置缺口。
- 准备表单随环境指纹和目标任务重建，避免显示上次条件的错误。未增加依赖、修改被测业务源码、提高预算或放宽准入。

## 验证

| 范围 | 结果 |
| --- | --- |
| host/UI构建 | 通过 |
| 全部单元检查 | 82/82 |
| 候选、任务恢复、工作流、运行范围集成 | 57/57 |
| 接入、真实核心HTTP执行、宿主状态回归 | 43/43 |
| Edge恢复/自然流程/方案准备 | 12/12，含1280/390宽度；最终恢复2项再次通过 |
| 独立代码复核 | 恢复ID、动态加载闭包及非法argv发现已修复，最终无新增重要问题 |

上述分组与重跑记录不累加成全套成绩。候选集成的凭据测试在受限环境报CREDENTIAL_STORE_UNAVAILABLE后，已在可访问Windows凭据管理器的环境完整重跑通过；仅使用合成临时凭据。

日志、红绿记录与隔离测试截图位于`output/candidate-recovery-20261016/`。接入测试会改写两份T2证据，本轮预先备份并按原始字节恢复，SHA-256核对一致，保留原有脏修改。

## 真实项目结果

- 当前工作台：4317，PID35792；同一项目920b080a-f60c-4b1f-9ff1-fe706a6ce074。
- 原失败任务c6accb71-9885-4641-a3ad-47b0347d1e4b的3次调用/10915 token及全部记录保留；state.json SHA-256仍为2f932e86d3f1a8c62d60204d5baf253b69b25c5c0650cbdf5a6acb438f4530f5。
- 新任务17ba024b-0bdd-4005-8ee4-699e9fc3fbc4使用当前已授权的verification.json范围和deepseek-flash连接，累计2次调用/6812 token；中途修复角色字段后继续同一任务，预算起点未重置。
- 最终ready_for_review / REVIEW_REQUIRED，独立12项对照的static、coverage、observation、http、admitted门槛均为true。当前项目试运行完成，saved-title有证据且通过。
- 8份分析JSON哈希未变，真实分析6流程/3建议及原预算保留；原1个历史正式运行ID与状态未变。没有新正式检查、负载、审核签署、发布或Git推送。页面停在05，可进入09核对并审核。
- 可复读的精简现场证明：`output/candidate-recovery-20261016/live-proof.json`，不含密钥。

## 复现与边界

```powershell
npm run build:host
npm run build:ui
node --experimental-test-module-mocks --test tests/unit/*.test.mjs
node --experimental-test-module-mocks --test tests/integration/candidate.test.mjs tests/integration/candidate-restart.test.mjs tests/integration/workflow.test.mjs tests/integration/runtime-source-scope.test.mjs
node --experimental-test-module-mocks --test tests/integration/access.test.mjs tests/integration/access-core.test.mjs tests/integration/workbench-api.test.mjs tests/integration/workbench-state.test.mjs
npx playwright test tests/e2e/candidate-recovery.spec.ts tests/e2e/natural-workflow.spec.ts tests/e2e/plan-preparation.spec.ts --output=output/candidate-recovery-20261016/browser-results-regression --reporter=list
```

新任务最多8次模型调用、2次自动修订，累计token/时限及发送授权仍生效。有限自动修订不保证任意模型输出都合格；未知业务能力仍须开发和独立验证。运行支持检查不是恶意代码沙箱或网络隔离承诺。

本轮未重跑全套npm test、其他真实业务、正式人员审核或T8负载验收。当前结果是“方案准备完成、待人工审核”，不能等同正式业务验收通过。未提交、推送或发布。
