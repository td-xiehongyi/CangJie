# Windows 分支修复与本机验证

日期：2026-10-15。来源：`fix/discovery-analysis-state@9c8b450`；本机原主分支：`d257eb7`。用户授权先修复、完成本机验证、通过后合并主版本。最终修复源码已通过本机完整回归和Edge验收；合并结果见末节。

## 修复范围

- 冻结资源明确使用 LF，覆盖参考实现、夹具、模板和仓颉源文件；未更改 suite-lock 或 T7 冻结摘要。
- Windows 测试使用系统临时目录和目录 junction；迟到观察测试修正为有效的单步断言，仍验证超时后不接收证据。
- 启动器发现 SDK 时先重新编译原生核心；已有核心但缺 SDK 时明确阻断，避免源码更新后静默运行旧核心。
- 保存工作流期间重新连接项目时，若项目对象已替换，重新计算规则和目录后写入当前对象；保留 revision 冲突及环境确认失效检查。
- T7 历史校验仅将两段精确 S4 扩展投影回原始代码后核对旧摘要，不放行其他修改。独立审查的四种内存变异均被拒绝。
- 审核路由专项补齐新增规则校验需要的测试夹具，生产候选/规则/审核保护不变；发现 API 失败断言补充诊断。

- 本机动态TCP范围实测为1024–15000，Edge轨迹明确出现Fetch `bad port`。新增统一回环HTTP端口分配：自动端口从49152–65535选取，只对占用/权限冲突最多重试32次；显式端口保留原语义，无效值仍拒绝。接入宿主、验证/复跑/负载副本和本机测试服务，未修改系统端口配置。端口回归4/4含模拟系统分配6667、真实fetch、冲突、有界失败与非法显式端口红绿检查。
- Edge负载页面验收改为每秒1次、8秒，仍执行8次真实实验、覆盖4条规则并要求零未知及重启后证据保持。旧4次/秒、2秒在本机压测端丢弃4次，产品正确判为unknown；新结果不能当作4次/秒达标。生产预算、负载准入和压力集成断言不变。
- Windows测试临时目录清理对短暂ENOTEMPTY最多重试5次；只作用于已创建的测试目录，不改变产品存储与业务断言。

## 本机环境与证据边界

Windows、Node 24.19.0、npm 11.17.0、仓颉 1.0.5/stdx 1.0.5.1、k6 2.3.0、Edge。使用项目既有工具与离线 npm 缓存；未安装系统软件。S4 原生检查显式设置 `CANGJIE_NATIVE_S4=1`。

隔离 Git worktree 位于 `.codex`，会被产品来源安全规则正确拒绝，因此完整验证使用主目录 `output/branch-review-2026-10-15/source` 下的等字节源码副本，不放宽来源安全规则。浏览器使用 `browser-source` 独立副本。最终248份源码、测试及配置逐字节核对一致。交付测试要求本地 SDK 路径，验证副本通过 junction 指向已安装工具。

第一轮完整测试为429/435；浏览器为33通过、2失败、5未运行。定位出工作流保存回归、旧T7校验缺少S4投影及隔离环境缺少SDK/k6；同时并行执行原生整链与浏览器时发生准备超时。最终采用串行完整回归，保留首轮失败日志，不降低产品预算或业务断言。发现 API 的一次 paused 状态在连续5次独立复测中未复现，最终全套结果仍须记录，不能据此宣称根因已消除。

模型为本机确定性服务、审核为测试身份；原生核心/HTTP/k6/Edge的本机通过不等于真实模型效果、正式人工审核、线上容量或正式交付验收。未外发项目源码或调用付费模型；未推送 GitHub、替换旧交付包或启动 T10。

## 验证结果

- 完整 `npm run check`：通过。
- 迟到观察原生解释器回归：66/66。
- 启动器与设置专项：9/9。
- 工作流与T7修复回归：18/18。
- 端口修复前完整自动回归：443/443，0失败、0跳过，约710秒；包括原生S4、D8整链与新目录交付复现。最终端口修复后完整回归447/447，0失败、0跳过，约717秒。
- Edge工作台测试套件：40/40通过，约3.1分钟；其中4项为API/SSR断言，其余为浏览器交互。

日志根目录：`output/branch-review-2026-10-15/`。首轮：`fix-local-full-test.log`、`fix-browser.log`；专项：`interpreter-fix-green.log`、`launcher-settings-green.log`、`workflow-transfer-green.log`；端口修复前完整通过：`fix-final-full-test.log`；端口专项：`http-ports-green.log`、`http-port-invalid-red.log`；浏览器两次失败与定位：`fix-final-browser.log`、`browser-ports-load-green.log`；最终浏览器：`fix-final-browser-ports.log`；最终完整回归：`fix-final-full-ports.log`（447/447通过）。冻结资源Git导出核对：`frozen-export-check.log`。

## 主版本保护与合并

已完成：修复提交34b8310dd10bb6ae5e6aef3f66b34d9e11ef9d5c包含25份明确修复/证据文件；本机main由d257eb7快进到该提交，保留远程7个提交历史。合并前路径检查无冲突；未执行reset、clean或stash，未推送。

合并后主目录源码与该提交一致，npm run check通过，启动器/端口12项冒烟通过；三份suite-lock共25项冻结摘要全部匹配。原5份未提交证据及5份主版本运行数据的SHA-256全部保持一致，运行数据文件数量未变。证据：main-after-merge-check.log、main-after-merge-smoke.log、main-frozen-check.log、merge-preservation-result.json。冒烟首次命令遗漏experimental-test-module-mocks参数而失败，按既有套件参数重跑12/12，原命令日志保留main-smoke-missing-flag.log。

随后仅更新README、主版本说明、快速开始和本记录/计划的本机状态；无进一步产品代码变化。未重启既有用户会话，未发起真实模型请求。双击Shell与系统默认浏览器打开未人工验收；正常入口仍为Start-CangJie.cmd或npm run start:oneclick。
