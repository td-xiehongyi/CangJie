# AI 开发网站验证系统

## 当前主版本（2026-10-14）

用户已确定本目录当前版本为主要使用与开发版本，标识 `main-2026-10-14`。默认运行 `npm start`，打开 **http://127.0.0.1:4317**；使用当前已有项目、模型设置、检查选择和候选，启动选择见 [main-version.json](main-version.json)。旧8097/8098验收副本与旧ZIP保留为历史参考。完整约定见[主版本说明](docs/MAIN_VERSION.md)。

最近Edge完整20/20、宿主/UI构建通过，真实候选试运行三项通过，等待实际双重审核；正式业务/负载、导出重开、交付更新及T10仍开放。主版本确认不替代这些验收。历史交付路径与限制见[交付检查](docs/evidence/release-check.md)。

## 自然操作流程（2026-10-14）

当前源码采用统一五步主线，检查选择按项目/流程保存；设置返回原任务，审核先看证据，运行完成后查看结果。多标签冲突与未保存材料均有保护。负载区明确区分记录表现和判断达标。实现与验收见[自然操作流程](docs/evidence/natural-workflow.md)。已有工作台需重启加载；8098验收副本和旧ZIP不会自动更新。

文件夹选择的隐藏桌面等待问题已修复，页面支持取消后粘贴路径；真实Windows选择/取消及Edge16/16通过，见[修复记录](docs/evidence/folder-picker-hotfix.md)。

## 交互更新（2026-10-13）

当前源码已改为分步准备界面，默认自动生成两个测试用户并验证登录；手动账号保留，AI 分析可选，报告优先展示结论。已有工作台需重启加载新宿主；旧交付包不会自动更新。范围与验证见[交互改版验收](docs/evidence/ui-refresh.md)。

## 启动与验收

需要重新构建时先运行 `npm run check`，再运行 `npm start`，浏览器打开 `http://127.0.0.1:4317`。当前主版本恢复已有数据；全新交付目录首次启动为空，模型名称需由使用者填写。密钥只在本机输入，未勾选记住时只存会话。已有合格模板的执行与包复跑不需要模型。

`CANGJIE_TEST_MUTEX=1 npm run test:discovered-rule` 在Linux明示OS锁/核心测试模型口径下检查S4受控链（不计原生验收）；`npm run test:project-rules` 单独检查S3规则、能力和身份事务（原生Windows规则库锁；Linux显式测试替身口径见证据）；`npm run test:discovery-state` 单独检查源码分析状态时序和回归接入，不依赖仓颉核心；`npm run verify -- discovery` 在完整工具链下运行源码专项。`npm run verify -- replay` 检查运行记录/验证包/API；`npm run verify -- workbench` 通过本机Edge验收正式页面；`npm run verify -- transfer` 检查报名迁移与冻结证据恢复；`npm run verify -- target-load` 检查固定负载与停止结算；`npm run verify -- release` 检查交付复现；`npm test` 运行完整回归。测试套件逐文件运行，仓颉及隔离网站真实执行。候选生成使用确定性模型服务、审核使用明确测试身份，仅写隔离测试库，不计作真实模型生成或正式业务审核。详见 [T6验收与限制](docs/evidence/workbench.md)、[T5](docs/evidence/registry.md)、[T4真实调用入口](docs/evidence/candidate.md)。T7受控迁移开发验收已完成；宿主通用基线计数与Windows文件替换已补强，不能称作无需适配的盲迁移。原四页预览六源哈希未变。详见 [T7验收与限制](docs/evidence/transfer.md)。

负载入口在已通过的业务报告下方；填写目标率、时长、等待/错误阈值及所选规则比例，确认后运行。已有工作台需重启以加载新代码。详见 [T8验收与限制](docs/evidence/target-load.md)。依赖恢复入口：`powershell -File scripts/setup-k6.ps1`。

交付：`npm run package` 仍要求真实原生核心exe，在 `output/delivery` 新建普通运行/源码包与独立开发者验收资源目录，不覆盖已有产物。普通包排除私有答案、候选示例、旧配置和运行记录。按[交付使用说明](docs/delivery-guide.md)在新目录安装依赖和资源后启动；最终交付索引见[交付清单](docs/evidence/t9-delivery.json)，演示和答辩基础见[演示提纲](docs/demo-outline.md)。这些目录不是正式模板发布，也未上传。缺核心时可运行`node scripts/package.mjs --source-only`生成明确未构建核心的源码开发交付与独立资源；不能以此替代正式Windows执行包。

T10测试项目与边界见[对照准备记录](docs/evidence/comparison.md)。专项检查：`node --test tests/integration/comparison-fixture.test.mjs`；这不是正式两组成绩，也不计入历史242项回归。

## 当前入口

2026-10-14 新增方向已确认：优先从源码分析业务并推荐项目特有检查。S1/D1源码索引与受控读取、S2/D2—D3分析会话及API/UI已实现，并有历史离线开发验收；真实候选与源码分析效果仍待验收。推送前曾出现专项36/38、API复测4/6。此次状态修复新增7项回归通过，四份专项在明确OS互斥替身的Linux隔离测试中38/38；原生Windows完整构建/集成/Edge仍须续验，不能沿用历史全绿结论。详情见[本轮状态修复与限制](docs/evidence/discovery-state-fix-2026-10-14.md)、[业务分析与推荐历史证据](docs/evidence/discovery-analysis.md)和[推送前核验](docs/evidence/remote-push-2026-10-15.md)。

用户于2026-10-14明确允许暂时跳过正式验收并继续后续开发。S3/D4—D5已实现项目规则确认、不可变版本与纠正记录、精确版本草稿选择、四类准备状态和受认证API/UI；新增开发回归及独立代码审查见[项目规则证据](docs/evidence/project-rules.md)。S3只保存规则与说明缺口，不执行或发布新规则；S4/D6已开发受控合成工单关闭性质的精确版本编译、独立验证桥、真实本机HTTP与同环境包复跑；独立审查通过，新增开发检查61/61、旧隔离回归65/65，原生仓颉及正式审核仍未验证，详见[新规则开发证据](docs/evidence/discovered-rule-execution.md)。S5/D7—D8已开发实现来源保守失效、不可变纠正追加、精确负载复核、v1兼容与安全分包；最终独立代码审查通过，无未修阻断项。开发范围与延期清单见[复用与交付证据](docs/evidence/discovery-release.md)。原生Windows完整续验、浏览器交互、真实模型效果、正式人员审核及原业务/负载、交付/T10均保持延期未验证，真实调用仍需确认实际范围。

| 文件 | 用途 |
| --- | --- |
| [需求稿 v0.44](docs/业务与容量验证系统需求与设计讨论稿.md) | R01—R52既有边界与R53—R60源码业务分析主线；S1/S2与S3规则准备已实现；S4受控开发链已实现；S5复用/交付开发实现 |
| [总体架构](docs/superpowers/specs/2026-10-14-extensible-verification-architecture.md) | 源码分析、项目规则、检查执行与证据的模块边界及用户流程 |
| [源码业务分析设计](docs/superpowers/specs/2026-10-14-code-grounded-business-discovery.md) | 按需读源码、业务概览、项目特有检查与能力缺口 |
| [新增分阶段计划 v1.7](docs/superpowers/plans/2026-10-14-code-grounded-business-discovery.md) | S1—S5、D1—D8任务与验收停止点；S1—S5开发链已实现，原生/真实模型/人员与正式交付验收延期未验证 |
| [候选模板设计 v1.7](docs/superpowers/specs/2026-10-11-candidate-template-lifecycle.md) | 候选生成、独立验证、审核发布和复用机制 |
| [最终实施计划 2.34](docs/superpowers/plans/2026-10-11-website-verification.md) | T9交付已实施；真实模型与正式模板发布待验收；T10工单对照项目已准备，正式同模型对照待运行 |
| [蓝白四页定稿](output/ui-preview-final/index.html) | 历史视觉参考；当前交互以正式工作台与交互改版验收为准 |
| [预览启动说明](output/ui-preview-final/README.md) | 本机查看方式与预览限制 |

正式文档分别负责需求、机制和执行，保留原路径，不建立重复的最终版副本。

2026-10-12：按用户后续授权完成 T0；仓颉 1.0.5/stdx 1.0.5.1 放在项目本地，TypeScript 依赖已锁定，真实协议测试通过。k6 未在 PATH 找到，T0时Playwright尚未安装；T6已安装并通过Edge验收，T8已下载并校验项目本地k6 2.3.0且完成实测（不改系统PATH）。最新预览以 [六项修订与复查](output/ui-preview-final/qa/defect-fixes/修订与复查.md) 及同目录截图为准。

## 历史文件

2026-10-12 将 v1、v2、早期覆盖审查和逐步演示共 57 个文件收进 [历史归档](output/history-2026-10-12.zip)，逐文件 SHA-256 与长度核对后移除展开目录。归档内保留原目录、源码、截图和证据，清单见 `_archive-manifest.json`；解压到 `output` 可恢复原路径，恢复前检查是否已有同名文件，避免覆盖。

`output/ui-preview-v3` 和 `output/ui-preview-v4` 是旧预览；因本机服务仍在使用，本次保留其全部文件。当前定稿及其 `qa`、本轮修改前备份也保留。历史证据只说明对应版本的静态界面检查，不代表真实产品功能通过。
