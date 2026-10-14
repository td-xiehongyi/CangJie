# T9 新版界面正式验收

核对日期：2026-10-14。状态：真实候选已通过自动验证及目标试运行，等待实际双审核；T9正式验收仍开放。

当前进展：工单接入与真实项目分析已完成；原真实候选因query字段映射缺失停在试运行，现已修复并原任务恢复，三项判定全部pass。定义和预算未改，本次新增模型调用0。8098已应用宿主/UI补丁，PID33996；最终ZIP重新打包验证、人工双审核、报告/包导出和重开复跑仍开放。详见[字段映射与恢复修复](t9-trial-mapping-hotfix.md)。下文为2026-10-13首次启动记录。

后续进展：使用者已手动配置并确认连接通过；公开API现场核对deepseek-flash、connected、remembered=true、hasKey=true，项目及运行仍为0。见[connection.json](../../output/t9-ui-acceptance/connection.json)。此结果仅证明当前连接成功与记住选项已设置，重开读取、新候选和审核尚未验证。下一步接入该交付目录的samples/ticket；下文未调用模型等描述为首次启动时的证据。

- 当前入口：http://127.0.0.1:8098/?page=settings 。原生后台 PID 7476，进程存活需后续现场复核。
- 从新版交付 ZIP 解压到独立目录 `output/t9-live-ui-53734441`，原始174项文件摘要核对通过，随后独立安装开发者验收资源和锁定生产依赖。普通包未携带原配置、凭据或运行。
- 新版会话、交付ZIP路径及SHA-256：[session.json](../../output/t9-ui-acceptance/session.json)。没有覆盖原交付索引及8097旧候选记录，也未复用旧密钥。
- 首次公开状态：项目0、运行0、负载0、模型名空、hasKey=false；实际HTTP返回的JS/CSS摘要与该交付目录一致。见[startup.json](../../output/t9-ui-acceptance/startup.json)。
- 本轮完整源码构建通过，见[build-native.log](../../output/t9-ui-acceptance/build-native.log)。沙箱首次拒绝仓颉opt.exe，原生构建成功；首次失败日志保留为build.log。
- Node24.19.0、仓颉1.0.5/stdx1.0.5.1、k6 2.3.0现场检查通过，见验收目录environment.json。SDK使用明确记录的本机已安装路径；k6压缩包独立校验、解压和执行。npm ci新增74包，安装审计0漏洞；不代表产品安全审查。
- 实际发现并修复Windows PowerShell解压脚本缺少System.IO.Compression.FileSystem程序集加载：setup-k6.ps1和同模式setup-tools.ps1补显式加载；新版空目录在Windows PowerShell实际运行k6安装成功。仓颉完整下载/安装流程本轮未重跑，使用已安装SDK。说明使用单进程执行策略，不改系统策略。交付说明同步自动账号和重开准备步骤。
- 初次准备目录 `output/t9-live-ui-849be918` 及其记录setup-attempt.json保留，未用作正式验收入口。原 `output/t9-live-9a9bc3ea` 保留，原候选预算和旧进度未重置。

下一步由使用者在8098接入交付目录中的samples/ticket，采用自动测试账号。之后逐步完成自动准备、发送范围确认、真实新候选验证、实际业务确认和开发者技术审核、报告/包导出、重开无模型复跑。

目前仅完成真实模型连接检查，未调用项目分析或候选生成、未签署人工审核，未重跑全量/浏览器/交付自动化测试；既有245/245、8/8及历史交付结果不作为本轮重跑记录。没有提交、推送或外部发布。其他电脑兼容性未验证。T10不在本轮。
