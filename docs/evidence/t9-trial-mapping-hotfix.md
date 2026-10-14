# T9 目标试运行字段映射与恢复修复

核对日期：2026-10-14。状态：当前真实候选已恢复到ready_for_review，等待实际业务确认和开发者技术审核；T9正式验收仍开放。

## 现场原因

候选`bc36d74c-9cde-4090-aa69-9db0d096ef84`已通过static/coverage/observation/http/admitted五项门槛；目标试运行实际执行完成，但优先级和所有者断言为MISSING_VALUE。原始查询证据包含priority=high及ownerId，项目resultBindings.query却只提取id/title/items。缺的是规范化字段映射，不是模型连接或后台仍在执行。原始记录见[blocked-candidate.json](../../output/t9-ui-acceptance/blocked-candidate.json)。

后端持久状态合法地停在validating/awaiting_trial，页面却只显示“验证中”并按validating禁用按钮，无法继续。

## 最小修复

- 工单样例公开配置补齐query.priority与query.ownerId，网站业务源码不变。当前验收实例的样例文件保持原样，通过项目接入API保存显式字段映射；重新核对独立合成环境，来源源码摘要不变。
- 对无后台任务且phase=awaiting_trial的候选，公开工作台状态显示paused；保留候选持久准入状态。界面解释证据不足，同规则显示“继续原方案的试运行”。未放宽未知、证据或准入门槛。
- 新增target-trial-recovery.test.mjs并接入candidate/all入口；相关入口在浏览器恢复检查前构建UI，避免依赖旧dist。
- 当前8098实例备份后应用宿主/UI补丁并重启，PID33996；备份位置见[session.json](../../output/t9-ui-acceptance/session.json)。实际页面资源摘要与新构建一致。原ZIP、交付索引、8097旧会话保留；当前实例为带补丁验收目录，最终交付ZIP尚需重新打包验证。

## 实际验证

- 回归先失败：样例缺字段、公开状态仍是validating，见[recovery-red.log](../../output/t9-ui-acceptance/recovery-red.log)。最终恢复/自动账号/接入API回归6/6，见[recovery-green.log](../../output/t9-ui-acceptance/recovery-green.log)。中间测试自身的公开字段、选择器和异步结束等待问题已修正，失败日志保留。
- 隔离Edge实际显示已暂停及可用继续按钮；修正映射后通过该按钮恢复同一候选，达到等待双重审核，候选ID/预算保持，模型替身只收到首次生成的1次请求。截图见output/t9-ui-acceptance/screenshots/trial-paused.png及trial-recovered.png。
- 宿主TypeScript、UI TypeScript/Vite构建、脚本语法与当前修复范围格式检查通过。本轮未重跑完整回归或完整交付专项。
- 当前真实候选由已调用DeepSeek生成的原定义继续本地目标试运行；未重新生成或篡改候选，未读出API Key值。候选ID、定义、预算保持：calls=1、tokens=3070、revisionIndex=0，本次新增模型调用0。
- 三项实际判定均pass：updated-title、unchanged-priority、unchanged-owner；项目试运行completed=true/conclusive=true，候选ready_for_review。详细记录含来源/映射摘要及证据引用：[recovered-candidate.json](../../output/t9-ui-acceptance/recovered-candidate.json)。旧失败试运行证据保留，没有改写为通过。

下一步：使用者刷新8098，打开“查看验证证据与审核”/“检查方案审核”，逐项检查本版适用条件和证据后完成实际双审核；尚未发布模板、运行正式业务报告、导出或重开验证包复跑。已记住配置的引用在重启后存在，不等于本轮再次实际解析密钥或调用连接已通过。未提交、推送或外部发布；其他电脑兼容性未验证。
