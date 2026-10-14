# 源码分析状态时序修复（2026-10-14 UTC）

基线：`d257eb7f73a30800e799d3e3cd4b649f41747881`；本地分支：`fix/discovery-analysis-state`。范围仅状态修复、回归及过时文档同步。验证时尚未提交或推送；未调用真实模型、读取真实密钥、外发源码、代替人工审核或进入S3。

[推送前核验](remote-push-2026-10-15.md)的38项2失败/API6项2失败，以及[历史S2证据](discovery-analysis.md)的298/298、Edge29/29均保留原文。当前结果不能由历史计数替代。

## 根因与最小修复

1. `getDiscovery`先读持久化running，再异步校验引用。该间隙任务可能完成并从jobs删除。原代码用旧running和新的“无活动任务”判断，把已完成分析显示为孤儿paused。
2. `run`先保存completed/partial等终态，`DiscoveryStore.exclusive`随后异步释放Windows互斥。原API在释放期间已显示终态，设置/运行配置导入却仍被`MODEL_WORK_ACTIVE`阻止。
3. 同源恢复窗口：explicit resume注册job后，首次running检查点尚未落盘，旧partial/paused也不应成为对外终态。

`discovery/service.ts`增加私有一致性检视：读前后全局任务生命周期epoch改变时重读（注册及删除递增，覆盖无任务→完整任务→无任务的ABA）；活跃任务终态对外仍显示running，直到互斥释放并清理任务。引用失效仍保留`referencesValid:false`及原因。completed/stale的幂等run内部检视排除自身遮罩，保持真实终态返回、不追加调用；其promise仍等互斥释放后结算。未改变模型预算、发送授权、引用校验、互斥实现或Windows安全边界。

## 回归先红后绿

新增`tests/unit/discovery-state-race.test.mjs`用可控Promise屏障固定时序，不靠睡眠撞概率。仅替换OS互斥；真实文件写入、模型编排、源码校验和API仍执行原产品代码，模型服务仅127.0.0.1确定性响应。

- 捕获旧running后，明确等待任务完成，再放行读取：旧实现返回paused，修后返回当前partial和修订号。
- 终态落盘后明确阻止互斥释放：持久化为partial但公开为running；放行后才显示partial且active=false。
- API同一窗口：释放前保留忙保护；观察到真正终态后立即改模型配置及导入运行配置成功，调用数不变。
- 恢复注册后阻止首次读取：修补前返回旧partial，修后公开running。
- completed幂等run保持completed及修订号，不新增模型请求。
- GET开始时无任务，在读取间隙任务完整开始并结束、两端均无任务：审查补充ABA回归先红（paused≠partial），改为生命周期epoch后返回真正partial，避免仅比较任务句柄遗漏变化。

首3项原实现均按预期失败；恢复窗口新增后先4/5、再5/5。独立审查发现新Node旗标使runner的`args[0]==='--test'`失效，会将全套上限误降为5分钟；新增`verify-discovery-runner.test.mjs`先红（300000≠900000），再改为`args.includes('--test')`。ABA回归先红再修后7/7；新回归已纳入verify discovery/all，并提供`npm run test:discovery-state`；全套仍15分钟上限。

## 本轮实际验证

环境：Linux x64，Node24.19.0，npm11.9.0；按锁文件`npm ci --ignore-scripts --no-audit --no-fund`安装。锁文件仅官方npm registry，已检查安装脚本；未运行可选fsevents安装脚本。未修改锁文件。

全部构建/测试在隔离副本执行，未覆盖原历史输出。源码access夹具依赖预建`output/s1-source`，在隔离副本准备后执行；这是测试前置条件，不是产品修复。

| 命令/检查 | 实际结果 | 证据日志 |
| --- | --- | --- |
| `npm run build:contracts`、`build:host`、`build:sample`、`check:reference` | 通过 | `check-final.log`、专项构建输出 |
| `npm run build:ui` | TypeScript及Vite通过 | `ui-build-final.log` |
| `npm run test:discovery-state` | 7/7：6项状态、1项runner | `state-final.log` |
| 原生Linux直接session/API | 22项：1通过、21失败；失败因Windows互斥缺失 | `baseline-linux.log` |
| 原实现session/API，明确OS互斥替身 | 实际重现意外paused | `baseline-mocked-lock.log` |
| access/session/API/model-key四份专项，明确OS互斥替身 | 38/38通过，不是原生Windows通过 | `focused-final.log` |
| `npm run check` | 到核心构建失败：缺`cjc.exe` | `check-final.log` |
| `npm test` | 到核心构建失败：缺`cjc.exe`，未进入正式全套 | `all-official-final.log` |
| 直接全JS诊断，不替换原集成的OS依赖 | 非正式、未完成：观察109通过/139失败后停在Windows锁测试；已终止，退出130，无最终总计 | `all-direct-linux.log`、全部139项名称在`all-direct-failure-names.txt` |
| Linux Chromium源码分析6项UI尝试 | 6项均在浏览器启动时失败，未验证页面：socket Operation not permitted及crashpad失败；未规避限制 | `ui-discovery-linux.log` |

直接全JS诊断主要错误为核心exe缺失、Core client closed、CANDIDATE_LOCK_UNAVAILABLE、powershell.exe缺失、CREDENTIAL_STORE_UNAVAILABLE；还观察到candidate recovery timed out、缺SUMMARY.md及后续断言失败。全部失败名称与日志保留，不能把这些归作已通过或据此排除其他问题。Windows锁测试在Linux启动PowerShell失败后留下未结算清理，停止不适配的平台诊断，未修改这些历史测试。Node模块替身旗标为实验功能，运行会有相应警告。

正式check/test与四份专项均在最终epoch修复后重跑；Linux直接全JS诊断和UI启动尝试在此前版本进行，仅记录平台限制，不能作为最终全套结果。

本轮日志和隔离辅助文件另存`cangjie-state-fix-evidence`证据目录，包含red/green、原生失败、诊断名单、平台探测和Linux浏览器配置；不写回原历史证据目录。`git diff --check`通过；源码工作树仅含本轮代码、测试、文档和运行入口改动，无测试输出污染。

## 原生Windows续验停止点

需取得Windows工作区授权并使用正常Windows Node24、项目本地仓颉/stdx、PowerShell、k6及Edge；本轮没有将Linux替身结果当作这些平台验收。

在新隔离副本恢复官方锁定依赖，并先准备夹具输出目录：

1. `npm ci`；`New-Item -ItemType Directory -Force output/s1-source | Out-Null`
2. `npm run check`、`npm run test:discovery-state`
3. `node --test --test-concurrency=1 tests/integration/discovery-access.test.mjs tests/integration/discovery-session.test.mjs tests/integration/discovery-api.test.mjs tests/integration/model-key-validation.test.mjs`（不加载OS互斥替身）
4. `npm run verify -- discovery`、`npm test`、`npm run verify -- workbench`（原生Edge）；确认新增回归被执行，真实Windows跨进程互斥/状态锁、候选/业务执行与完整UI仍有效。
5. 任一失败保留日志并停止验收，不用重复运行掩盖失败。完整检查通过后才安排真实候选与源码分析效果验收。

## 后续真实验收的最小前置

本轮不发起真实调用。须重新确认实际服务/模型、调用及费用上限、候选项目与具体公开材料、源码目录摘要及按需片段范围，明确排除Key、账号、数据库与私有独立答案。现有两份受控订单/会员夹具及预算清单可以作核对起点，但历史合成输出不证明模型理解质量。Key只在获授权的本机安全入口使用。真实候选仍需实际独立验证及正式人员双审核；不能以测试身份替代。上述验收完成后再推进S3，S4/S5及原正式交付/T10仍开放。
