# T1 声明式语言与核心合同验收

日期：2026-10-12（Asia/Shanghai）。状态：T1 完成，范围止于声明式定义、受控观察解释与调度；T2 尚未开始。

## 实现与边界

- schema v1 和 TypeScript 类型位于 `packages/contracts/`；TypeScript 做结构检查，仓颉独立校验能力、变量依赖、检查隔离、预算和表达式，并执行最终业务判定。每个返回的 Transition 同时经过共享 schema 检查。
- 语言支持 field、const、exists、eq、neq、count、contains、all、any、not。exists 只接受字段读取；missing 与 null 区分，类型不隐式转换，数组/对象内的类型错误也不能经取反变为通过。带关键未知信息的 true 不能判 pass；已证实违规保留 fail 与 unknownReasons。
- 拒绝未注册动作、未知角色、答案/评估引用、动态代码、循环、无界重复、未定义变量、常量断言和可静态识别的恒真包装。静态检查不证明任意业务断言正确；独立 HTTP 对照与审核仍在 T3—T5。
- 每轮只处理一个主流程，顺序派发有限动作；每个独立检查使用新的变量表、证据集合和 isolationKey，首动作标记 requiresBaseline。某检查取证受阻后其他独立检查继续。实际测试数据库复位是 T2 的职责，此处不宣称已完成数据库隔离验收。
- actionId、intentId、attemptId 必须与待完成动作一致。已消费动作不能因消息重放再次派发，重复观察不会再次推进，进程内禁止复用 runId，取消后的消息无动作。宿主 CoreExperiment 串行收发并驱动 tick；只有仓颉的单调时钟决定期限与超时判定。即使没有观察返回，也会超时并继续独立检查或结束。
- 三类种子：保存结果、重复提交、权限隔离，全部位于 `packages/contracts/fixtures/`，使用同一语言与解释器。每类均通过正常/业务缺陷/证据不足观察对照；它们仍是未发布的定义样本，真实 HTTP 控制与通用发布资格尚未验收。

## 当前接口

JSONL envelope 沿用 schemaVersion/messageId/runId/kind/payload。

| 请求 | 内容/响应 |
| --- | --- |
| start / validateTemplate | spec、capabilities → valid、issues、interpreterVersion |
| start / runTemplate | spec、capabilities、已确认 rule、scope → Transition |
| observation | 绑定动作身份的 observation → 下一动作或判定 |
| start / tick | 宿主计时推进 → 由核心判断期限，不能由宿主输入时间决定通过 |
| cancel | 停止派发，保留已有判定，返回 cancelled |

当前 scope 仅允许 `observation_validation`，必须 confirmed 且有非空 validationRef，核心仍重新做静态校验并核对规则版本。它仅授权观察样本实验，不产生正式模板资格；正式运行被拒绝，发布及资格验证留到 T5。CapabilitySet 是可信宿主提供的操作/角色目录，不能使用模型自报能力代替。

动作 deadline 是从派发开始计算的相对毫秒数。每步默认 expectedAcceptance=accepted；需要验证明确拒绝的步骤必须显式声明 rejected。传输失败、身份未确认、查询不完整、接受状态未知或缺证据引用均不能判通过。没有真实证据文件校验或网站取证的承诺；这部分归 T2/T3。

## 已执行验证

| 命令/检查 | 实际结果 | 证据 |
| --- | --- | --- |
| `npm run check` | TypeScript 合同/宿主及仓颉构建通过 | [构建日志](t1-check.log) |
| `npm run verify -- interpreter` | 66 pass、0 fail、0 skipped | [T1 测试日志](t1-tests.log) |
| `npm test` | 80 pass、0 fail、0 skipped，包含 T0 的 14 项协议回归 | [完整测试日志](t1-all-tests.log) |
| 最新四页源文件 SHA-256 | 六文件与既有 after 全部一致 | [预览基准核对](t1-preview-baseline.json) |
| 独立代码审查 | 发现的重放、身份复用、期限、未知传播等重要问题已修复，最后只读复查无剩余重要阻塞 | [执行账本](archive/t1-progress.md) |

测试中的核心语义必须启动本次编译的真实仓颉进程；宿主计时的三个传输替身测试另作区分，不代替核心运行证据。[真实最终状态](t1-roundtrip.json)绑定保存结果的规则、断言与证据引用。

首次 T1 测试在 T0 核心上因 UNKNOWN_OPERATION 失败；另保留 schema 存在性限制及恒真分支修复的失败证据，分别见 `t1-red.log`、`t1-presence-red.log`、`t1-tautology-red.log`。构建最初被沙箱阻止，自动审批两次超时；用户明确批准本次本地构建后成功，不需要普通终端管理员权限。

## 本机复跑

目录：`C:\Users\xie\Desktop\Project`，执行 `npm run verify -- interpreter`；成功信号为 66 pass、0 fail。`npm test` 执行完整 80 项。工具链与准备方式沿用 [T0 环境记录](environment.md)。

业务网站、真实 HTTP/数据库隔离、模型调用、候选端到端准入、发布、真实界面、验证包及负载尚未开发/验收；当前源码不能当作完整产品发布。原四页仍为静态演示。未初始化 Git、提交、推送或发布。
