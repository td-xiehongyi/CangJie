# 业务分析短引用与02双入口核验

日期：2026-10-16（Asia/Shanghai）。基线：main@3ffa550。本轮修改尚未提交或推送。

## 用户真实响应的格式兼容与本地恢复（同日后续，当前结论）

用户操作新分析后，deepseek-flash已返回完整JSON，原TRUNCATED_OUTPUT没有再次出现，但保存为INVALID_DISCOVERY_OUTPUT。读取已保存响应确认：3项建议均缺少preconditions/exceptions/stateChanges，另有一项预期把verification.json误标project_test。本轮未再次调用外部模型。

- 完整来源与结构先校验；缺失的可选业务边界留空并明确“未提供”，不补造业务事实。来源类型不符的预期保留原文为待确认问题，并标明来源问题，从有效预期中移除，不能授予执行资格。原始模型响应保留。
- 输出提示词在正式结构内列出边界字段，并要求中文业务说明及正确来源类型。旧英文响应不擅自翻译或改写。
- 已保存且能在本机校验的结果可在任务超时后显式恢复，不调用模型、不需要密钥、不重置预算；源码、版本和接收方变化仍阻断。真正的新请求仍受原预算约束。
- 独立审查复现并纠正8000字符边界：待确认问题保留原文，来源提示独立放limitations；提示不拼接无长度上限的flow名称，归一化后再次完整校验。新增回归先红后绿。
- 本轮host/UI构建通过，最终77/77单元；相关分析集成42/42通过，最终格式/长度/本地恢复3项复查通过；真实Edge业务分析7/7通过，包括无Key且过期的本地恢复，计数有重叠不相加。源码变化时恢复阻断也已验证。
- 主版本重启为PID7516。已通过当前页面“恢复已保存的业务草稿（不调用模型）”恢复真实工单分析1508a84f-9ccf-4680-8c85-953642b105b5：status=completed，6条流程、3项建议；调用仍为1次、tokens仍为15155，完整预算和原始audit摘要与恢复前一致。结果含3条边界缺失警示、1条来源待确认警示；页面已实看“业务草稿已生成”。
- 证据：output/analysis-entry-20261016/format-recovery-before.json、format-recovery-result.json、unit-format-recovery-final.log、integration-format-recovery.log、format-recovery-browser/。真实响应完成及本机兼容已验证，不等同于业务分析正确、任意项目覆盖或正式验收。

以下为首轮短引用与入口调整历史记录。

## 问题与修复

本机工单项目原分析记录返回TRUNCATED_OUTPUT：调用1次、9个完整文件、源码21334字节，服务报告输出长度限制，尚无业务草稿。单次输出上限6000 token；完整SourceRef包含多个长哈希，原协议要求在概览、流程、事实、预期、风险和建议中重复它们。未保存原始截断正文，不能确定其中每部分实际占比。

- 全文件分析改为输出sourceRefs整数编号，宿主按本次实际reads还原完整引用，再做原有结构、来源一致性、文件版本和预期来源类型检查。
- 保留旧完整引用兼容。越界、负数、小数编号和缺失结果拒绝；确认状态不能由模型提升。残缺JSON仍拒绝，不自动重试或提高累计预算。
- 同一合成业务草稿输出1122字节，完整引用格式2683字节，减少约58%；这是协议样例测量，不是实际模型token或费用测量。
- 02仅显示“AI读取项目分析”和“自行填写业务”。AI入口默认读取整个项目允许文本及自身测试，去除范围、排除项和提示词表单；本地读取后保留一次明确发送确认和可展开文件清单。
- 手动入口保存skipAnalysis并跳转03，展开业务说明。03确认要检查的业务和目标，05选择或生成检查方案。原03选择与05方案机制复用，未新增任意自由业务执行能力。
- 发送确认继续绑定快照、范围、文件摘要和模型；另一标签更新项目后，旧预览不能发送。输入超限提示改为导入独立子项目或手动填写。

## 当前证据

- 新短引用/非法引用/双入口3项测试先失败，实施后通过。
- contracts/host/UI基线构建通过；最终host及UI构建通过。核心源码未修改，沿用同日拉取后的原生核心构建。
- 最终全部单元/组件76/76通过，日志：output/analysis-entry-20261016/unit.log。
- 分析会话/API/恢复/实时来源/模型可靠性相关集成55/55通过；最终补缺失result守卫后的2项解码专项复查通过，计数有重叠，不相加。
- 编号流程真实Edge检查1/1通过，覆盖手动填写、目标保存、无自动调用、焦点和390/800/1280/1920宽度及内容缩放。
- 最终Playwright真实Edge10/10通过：分析6、方案准备1、会话恢复3。覆盖1280/390宽度、短引用展开、项目测试默认纳入、两标签过期确认、暂停/手动恢复。第一次6/7，失败是两标签测试未等第一标签读取完成；补齐实际准备完成等待后重跑通过，原失败追踪保留。
- 独立代码审查未发现新阻断/重要问题。测试均用合成数据、本机模型服务或fetch模拟，无真实外部模型请求。
- 4317安全重启为PID11644，首页200，认证状态正常，stderr为空。重启前后项目ID、分析ID/revision/预算、候选ID、运行ID及记住密钥可用性一致。浏览器已读取本机工单项目的新02双入口。

主要复现命令：

```powershell
npm run build:host
npm run build:ui
node --experimental-test-module-mocks --test tests/unit/*.test.mjs
node --experimental-test-module-mocks --test --test-concurrency=1 tests/integration/discovery-session.test.mjs tests/integration/discovery-api.test.mjs tests/integration/discovery-recovery.test.mjs tests/integration/discovery-live-source.test.mjs tests/integration/model-reliability.test.mjs
node --test tests/browser/workflow-v12.test.mjs
npx playwright test tests/e2e/business-discovery.spec.ts tests/e2e/plan-preparation.spec.ts tests/e2e/session-recovery.spec.ts --reporter=list --output=output/analysis-entry-20261016/playwright-final
```

## 限制与未验

- 没有重新调用真实deepseek-flash，真实模型是否仍输出超长尚待用户确认发送后验证；短引用减少截断诱因，不能保证任意业务量都在6000输出token内完成。
- 正文64 KiB、请求96 KiB上限保留；不能分析任意大小仓库。密钥、依赖、数据库、构建产物、私有验证资源及越界链接仍排除；超限不摘要、不截断、不自动分批。
- 默认发送项目自身测试后，不能把它们计作模型未见的独立验收材料。
- 旧失败分析保留，原任务可能已超过10分钟；需要点击“读取项目”创建新的已确认分析，而非篡改旧失败记录。
- 未重跑全套npm test、实际业务/负载或正式人员审核；既有T8性能问题保持开放。未提交、推送或发布，原5份生成证据和无关文件保留。
