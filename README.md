# 鉴实 网站业务与容量验证工作台

鉴实 帮助个人开发者从网站源码梳理业务、确认预期，并取得可复查、可复跑的正确性与目标负载证据。支持范围以已核对的 Node.js 24、Express 5、HTTP/JSON 与 SQLite 项目为主；源码分析可先于运行环境准备。

更新：2026-10-17。产品代码基线为 `main@ceb8d95`，本轮仅整理文档，未修改产品代码。产品仍为开发预览，正式人工交付验收与 T10 两组对照尚未完成。

## 启动

首次在项目根目录安装依赖：

```powershell
npm ci --ignore-scripts
npm run start:oneclick
```

需要 Node.js 24.x。也可双击根目录 `Start-JianShi.cmd`；入口核对依赖、重新构建后启动；原 `Start-CangJie.cmd` 保留兼容。已构建的开发目录可用 `npm start`。默认地址为 **http://127.0.0.1:4317**，以控制台实际显示为准；运行期间保留控制台，Ctrl+C 停止后台。

本目录由 [main-version.json](main-version.json) 指定启动端口和现有数据目录，`main-2026-10-14` 是配置标识，不是发行版本。API Key 仅在本机页面输入；勾选记住后存入 Windows 凭据管理器，不写入 JSON。缺 SDK/原生核心时的限制见[快速开始](docs/QUICK_START.md)。

## 使用顺序

**01导入 → 02分析或自行填写 → 03确认业务 → 04准备运行条件 → 05选择或生成方案 → 09审核 → 10执行 → 11结果与导出。**

06—08是05内的创建、独立验证和试运行进度，无需分别切页。已有有效方案可复用其精确版本证据；12为主动启用的修复复测分支，未启用不阻塞结束。点击导航只查看内容，不自动调用模型或执行检查。

AI建议须人工核对；规则已保存不等于具备执行能力。完整分析仅发送预览后明确同意的允许文本，正文总量上限64 KiB，超限拒绝、不自动分批。新增动态规则执行目前仅支持已审查的工单关闭语义。详见[当前操作流程](docs/WORKFLOW_V12.md)。

## 文档入口

| 目的 | 入口 |
| --- | --- |
| 安装、启动、模型设置和数据目录 | [快速开始](docs/QUICK_START.md) |
| 各步骤操作、阻断处理和保存边界 | [当前流程](docs/WORKFLOW_V12.md) |
| 按界面执行并记录正式人工验收 | [人工验收指南](docs/MAIN_MANUAL_ACCEPTANCE.md) |
| 运行三个可交互样例 | [样例说明](samples/README.md) |
| 新目录交付与演示材料 | [交付指南](docs/delivery-guide.md)、[演示提纲](docs/demo-outline.md) |
| 已确认需求与核心机制 | [需求稿](docs/业务与容量验证系统需求与设计讨论稿.md)、[候选契约](docs/superpowers/specs/2026-10-11-candidate-template-lifecycle.md)、[源码分析设计](docs/superpowers/specs/2026-10-14-code-grounded-business-discovery.md) |
| 架构目标和未关闭实施要求 | [架构设计](docs/superpowers/specs/2026-10-14-extensible-verification-architecture.md)、[首版计划](docs/superpowers/plans/2026-10-11-website-verification.md)、[源码分析计划](docs/superpowers/plans/2026-10-14-code-grounded-business-discovery.md)、[v1.2计划](docs/superpowers/plans/2026-10-15-workflow-v12.md) |
| 证据口径与历史记录 | [文档约定](docs/DOCUMENTATION_RULES.md)、[证据索引](docs/evidence/README.md) |

## 已有验证与开放事项

2026-10-17提交前记录：完整构建、单元92/92、相关Edge27/27、编号导航1/1、目标负载集成16/16及分析至导出重开专项通过。各组范围有重叠，不累加为总数；专项包含确定性模型和测试审核身份。完整 `npm test` 触及900秒外层上限，未取得全量通过结论。见[提交核验记录](docs/evidence/remote-push-2026-10-17.md)。

真实模型候选复验及本机短时目标负载已有单独记录；这些结果不代表任意项目质量、实际人员双审核或正式交付已通过。全套回归、全浏览器、完整键盘/读屏与原生窗口人工验收、生产或更高/长时负载、其他电脑兼容性及T10仍按各自要求保留开放状态。历史失败证据不覆盖、不删改。

开发验证入口为 `npm run check`、`npm test` 和 `npm run verify -- <专项>`；运行前阅读[证据索引](docs/evidence/README.md)，部分测试会改写生成JSON，须备份并恢复既有证据。本轮文档整理没有重跑产品功能测试。

`npm run package` 要求真实原生核心并在 `output/delivery` 新建交付，不覆盖旧包；源码开发包不代替正式运行包。旧预览、既有ZIP和运行数据继续保留，历史预览不作为当前操作说明。
