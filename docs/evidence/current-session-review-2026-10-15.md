# 当前会话代码审查与文档核对

> 后续状态（2026-10-15）：R1/R2已按用户授权在当前会话修复并补开发回归，见[修复证据](review-fixes-2026-10-15.md)。下文的“未修复”和“本轮未修改”描述审查提交13cfc0b时的事实，保留为历史记录，不是当前修复状态。

日期：2026-10-15。审查对象：`td-xiehongyi/CangJie`，产品代码基线 `525380686cda2c270c6fb691395c77eb8953453c`，分支 `fix/discovery-analysis-state`。

本轮由当前会话直接阅读、执行检查和修改文档，没有启动或调用子智能体。范围为源码分析状态/读取、规则持久化/确认/编译、负载准入与打包路径/资源校验，以及用户入口文档；不是全仓库逐行安全审计。本轮未修改产品逻辑，未修复下述代码问题。

## 结论

S1—S5开发主线已实现，不能据此认定正式交付完成。发现一个已复现的P2功能问题及一个P3交付元数据问题；本轮仅记录代码问题、修正文档口径。没有在本次检查中证实绕过过期规则执行或越权读取的路径，但这不是“没有安全漏洞”的证明。

### R1 / P2：新增范围内文件未使正在运行的分析及时停止（已复现，未修复）

- 位置：`apps/host/src/discovery/service.ts:60,74,81,93,101`。
- 原因：启动时调用`currentDiscovery`重建范围；后续循环只遍历旧快照已有文件。运行期间新增文件不在旧列表中，结果检查也只检查已有引用，仍可发出下一次模型请求并保存completed。
- 复现：确定性本机provider第一次请求时添加`src/new-business.ts`，返回旧文件读取动作；第二次返回带旧文件有效引用的结果。读取公开视图前，直接返回值和持久记录均为completed；公开读取才得到stale且referencesValid=false。
- 本次观测：`requests=2, returned=completed, persisted=completed, publicView=stale, publicReferencesValid=false`。这证明后台状态与当前可用性不同步，以及可能发生不必要的后续模型调用；本次没有付费调用。
- 有效防线：公开读取会重建范围，后续确认/编译校验仍可拒绝过期来源。本复现没有证明过期规则能执行，也没有发送新文件正文。
- 建议修复：处理模型响应和下一次外发之前复核当前范围文件集合/摘要/相关索引缺口；失效时持久化明确stale并停止后续请求，不能只改返回视图。已发出的网络请求无法撤销，应说明观测与取消时点，而非承诺绝对实时。
- 修复验收：在第一次请求期间新增文件后，后续请求不发出，保存状态不可标当前有效completed；同时覆盖新增/删除/改名和最终响应返回前变化，保留历史正文，既有暂停/预算/恢复回归继续通过。

可复现脚本：[review-midrun-source-addition.mjs](review-midrun-source-addition.mjs)。该脚本只用于修复前13cfc0b产品基线，断言旧错误行为；不要在修复后版本把它当功能通过测试。修复后回归位于tests/integration/discovery-live-source.test.mjs。在修复前基线的仓库根目录、Linux Node24已构建宿主环境运行：

```sh
CANGJIE_TEST_MUTEX=1 node --experimental-test-module-mocks --test docs/evidence/review-midrun-source-addition.mjs
```

[复现日志](current-session-repro-2026-10-15.log)的1/1表示成功复现当前错误行为，**不表示修复或正式验收通过**。脚本仅建立和清理隔离合成目录，使用本机确定性服务与明确测试互斥替身，未纳入功能通过总数。修复后该复现断言应调整为正确行为回归。

### R2 / P3：生成交付清单的“verified”版本为固定历史值（静态证据确认，未修改生成器）

- 位置：`scripts/package.mjs`的`buildDelivery`中`manifest.dependencies`，固定写入Node24.19.0/npm11.17.0 verified。
- 本轮环境实际为Linux Node24.19.0/npm11.9.0，生成器没有探测npm实际版本。“verified”不能理解为本包本次构建环境的自动核验结果。
- 影响：交付者可能误认环境来源，难以准确复现；未证实影响产品执行判定。
- 本轮已在交付指南明确标为历史标签，并要求记录实际环境。建议后续将支持版本约束与构建环境实测分成字段，不能在未探测时生成“本次已核验”声明。

## 本轮直接检查

- 只读GitHub检查：开发分支头仍为5253806；main仍为d257eb7；171个累计变更路径的本地正文与远端Git blob摘要一致。
- 重新执行`npm run build:contracts`、`build:host`、`build:sample`、`check:reference`、`build:ui`，均退出0。UI包含TypeScript noEmit与Vite构建。
- 以下专项本轮重跑41/41、0失败、0跳过：[完整日志](current-session-check-2026-10-15.log)。组成：reuse11、runner1、UI逻辑/SSR18、package10、delivery-chain1。

```sh
CANGJIE_TEST_MUTEX=1 node --experimental-test-module-mocks --test --test-concurrency=1 \
  tests/integration/discovery-reuse.test.mjs \
  tests/unit/verify-reuse-delivery-runner.test.mjs \
  tests/unit/discovered-rule-ui.test.mjs \
  tests/integration/discovery-package.test.mjs \
  tests/integration/discovery-delivery-chain.test.mjs
```

- OS互斥与部分仓颉核心是测试替身，UI检查不是浏览器交互；完整交付链使用确定性本机模型服务与合成审核身份。41项不覆盖R1新增文件的运行中场景，所以通过数与发现问题并不矛盾。
- GitHub commit statuses与check-runs本次查询均为空，不能认定CI通过。
- 未重跑已知缺Windows SDK的完整check/test，不把历史受阻命令算本次运行；未执行真实模型、实际k6、原生仓颉、浏览器或实际人员审核。

## 文档更正范围

README、主版本说明、总体T计划、S阶段计划、源码分析设计、交付指南与开发交付证据，明确当前/历史、云端/Windows、代码同步/正式发布。新增[文档书写约定](../DOCUMENTATION_RULES.md)。历史通过日志未覆盖，T10成绩未填写，未将缺口改成已完成。

文档分支更新不会自动使本地旧HEAD变成新提交。此次云端工作树仍以历史d257eb7为Git基线，累计内容通过连接器同步；该本地版本管理整理问题与远端文件已发布是两个事实。未reset、clean或覆盖用户已有修改。

## 开放状态

优先修复R1并加回归，随后按用户安排补原生Windows与真实模型验收。R2需生成器修改才能彻底消除元数据歧义。正式人员审核、真实业务修复复测、实际负载、正式运行包与T10对照仍开放；当前规则编译桥仅覆盖已审查的工单关闭语义。
