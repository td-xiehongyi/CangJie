# 活动报名业务分析格式恢复

核对日期：2026-10-17。本机修改，未提交或推送。

## 原因与修复

registration 项目 64e1f08b-01af-41cf-99d2-cc758f0a92db 的分析
99b2858b-edd6-4ba4-80ba-c5d0bef7d972 保存了一个直接返回的 BusinessOverview，
缺少协议外层 `{kind:"result",result:...}`。原业务结构及展开后的源码引用均通过校验，
原程序仅因缺少外层标记报 INVALID_DISCOVERY_OUTPUT。

DiscoveryService 仅在完整文件分析模式兼容没有 kind 的概览对象。
原有结构、来源、快照、预算、配置及并发检查保留；动作响应和无效对象仍拒绝。
同一兼容规则覆盖首次处理和已保存响应恢复，原审计响应不改写。

## 验证

- 新增两项回归先失败：直接返回的有效概览被拒绝；过期任务不能恢复此类保存响应。
- `npm run build:host` 通过。
- 以下检查合计 46/46 通过，包含两项新增回归：
  `node --experimental-test-module-mocks --test tests/integration/discovery-session.test.mjs tests/integration/discovery-recovery.test.mjs tests/integration/discovery-api.test.mjs tests/unit/discovery-state-race.test.mjs`。
- 非法结构、越界引用、完整文件模式的动作输出和旧分轮模式的裸对象仍拒绝。
- 备份25份运行文件后重启4317，重启前后全部SHA-256相同；新PID30320，stderr为空。
- 通过真实工作台“恢复已保存的业务草稿（不调用模型）”按钮恢复，页面显示业务草稿已生成。
- 原分析 revision 4→6、status failed→completed；6条流程、0项建议。
- calls=1、tokens=14222，budget/audit/reads均与恢复前一致；仅目标分析文件变化，其余24份原文件不变。

证据：[运行核对](../../output/discovery-envelope-20261017/recovery-check.json)、
[恢复截图](../../output/discovery-envelope-20261017/restored.png)、
[备份摘要](../../output/discovery-envelope-20261017/hashes-before.json)。
备份保存在 output/discovery-envelope-20261017/runtime-before。

## 开放事项

本轮没有再次调用真实模型，没有运行完整 npm test，也没有代替用户确认业务。
原模型没有给出业务建议，缺失范围和未决事项仍保留；需到03补充并确认，
不能将格式恢复等同于分析质量或业务验收通过。正式执行前需在04重新准备临时凭据。
