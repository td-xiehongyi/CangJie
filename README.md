# AI 开发网站验证系统

状态：T0—T3、T5—T8开发验收完成；T9开发交付与自动化复现完成，全量242/242、最终专项7/7及构建通过。真实DeepSeek及实际双审核正式发布仍开放，T9正式验收未全项关闭；T10工单对照项目已准备，正式同模型对照待运行。交付路径与限制见[交付检查](docs/evidence/release-check.md)。

## 启动与验收

在本目录运行 `npm run check`，再运行 `npm start`，浏览器打开 `http://127.0.0.1:4317`。四页连接真实本地宿主，正式模板库当前为空，首次模型名称留空。密钥只在本机输入，未勾选记住时只存会话。已有合格模板的执行与包复跑不需要模型。

`npm run verify -- replay` 检查运行记录/验证包/API；`npm run verify -- workbench` 通过本机Edge验收正式页面；`npm run verify -- transfer` 检查报名迁移与冻结证据恢复；`npm run verify -- target-load` 检查固定负载与停止结算；`npm run verify -- release` 检查交付复现；`npm test` 运行完整回归。测试套件逐文件运行，仓颉及隔离网站真实执行。候选生成使用确定性模型服务、审核使用明确测试身份，仅写隔离测试库，不计作真实模型生成或正式业务审核。详见 [T6验收与限制](docs/evidence/workbench.md)、[T5](docs/evidence/registry.md)、[T4真实调用入口](docs/evidence/candidate.md)。T7受控迁移开发验收已完成；宿主通用基线计数与Windows文件替换已补强，不能称作无需适配的盲迁移。原四页预览六源哈希未变。详见 [T7验收与限制](docs/evidence/transfer.md)。

负载入口在已通过的业务报告下方；填写目标率、时长、等待/错误阈值及所选规则比例，确认后运行。已有工作台需重启以加载新代码。详见 [T8验收与限制](docs/evidence/target-load.md)。依赖恢复入口：`powershell -File scripts/setup-k6.ps1`。

交付：`npm run package` 在 `output/delivery` 新建普通运行/源码包与独立开发者验收资源目录，不覆盖已有产物。普通包排除私有答案、候选示例、旧配置和运行记录。按[交付使用说明](docs/delivery-guide.md)在新目录安装依赖和资源后启动；最终交付索引见[交付清单](docs/evidence/t9-delivery.json)，演示和答辩基础见[演示提纲](docs/demo-outline.md)。这些目录不是正式模板发布，也未上传。

T10测试项目与边界见[对照准备记录](docs/evidence/comparison.md)。专项检查：`node --test tests/integration/comparison-fixture.test.mjs`；这不是正式两组成绩，也不计入历史242项回归。

## 当前入口

| 文件 | 用途 |
| --- | --- |
| [需求稿 v0.42](docs/业务与容量验证系统需求与设计讨论稿.md) | 已确认的 R01—R52、首版范围、业务原则及最新四页基准 |
| [候选模板设计 v1.7](docs/superpowers/specs/2026-10-11-candidate-template-lifecycle.md) | 候选生成、独立验证、审核发布和复用机制 |
| [最终实施计划 2.34](docs/superpowers/plans/2026-10-11-website-verification.md) | T9交付已实施；真实模型与正式模板发布待验收；T10工单对照项目已准备，正式同模型对照待运行 |
| [蓝白四页定稿](output/ui-preview-final/index.html) | 当前开发视觉/交互基准，六项缺陷修订已纳入计划；仍为静态演示 |
| [预览启动说明](output/ui-preview-final/README.md) | 本机查看方式与预览限制 |

正式文档分别负责需求、机制和执行，保留原路径，不建立重复的最终版副本。

2026-10-12：按用户后续授权完成 T0；仓颉 1.0.5/stdx 1.0.5.1 放在项目本地，TypeScript 依赖已锁定，真实协议测试通过。k6 未在 PATH 找到，T0时Playwright尚未安装；T6已安装并通过Edge验收，T8已下载并校验项目本地k6 2.3.0且完成实测（不改系统PATH）。最新预览以 [六项修订与复查](output/ui-preview-final/qa/defect-fixes/修订与复查.md) 及同目录截图为准。

## 历史文件

2026-10-12 将 v1、v2、早期覆盖审查和逐步演示共 57 个文件收进 [历史归档](output/history-2026-10-12.zip)，逐文件 SHA-256 与长度核对后移除展开目录。归档内保留原目录、源码、截图和证据，清单见 `_archive-manifest.json`；解压到 `output` 可恢复原路径，恢复前检查是否已有同名文件，避免覆盖。

`output/ui-preview-v3` 和 `output/ui-preview-v4` 是旧预览；因本机服务仍在使用，本次保留其全部文件。当前定稿及其 `qa`、本轮修改前备份也保留。历史证据只说明对应版本的静态界面检查，不代表真实产品功能通过。
