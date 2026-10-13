# T0 JSONL 进程协议

日期：2026-10-12。仅通信合同，不是 T1 实验语言或业务判定。

- Node 通过显式可执行路径和参数启动一个仓颉子进程，`shell:false`，隐藏窗口；进程环境由项目本地 SDK 路径构造，不修改系统环境。
- stdin/stdout 使用 UTF-8、一行一个 JSON 对象；换行必须在 JSON 字符串内转义。stdout 只输出协议，stderr 输出诊断，宿主仅留最后 16 KiB。
- 请求字段：`schemaVersion:number`、非空 `messageId:string`、非空 `runId:string`、`kind:string`、`payload:object`。目前支持 schemaVersion=1；未知版本由核心返回 error/UNSUPPORTED_VERSION。
- 响应复用请求 messageId 作为关联标识，绑定同一个 runId，kind=event，payload.status 为 running/completed/cancelled/error；后三种终结本次 send。状态 completed 在 T0 仅表示通信结束，不是业务通过。
- `CoreClient.send(message): Promise<CoreEvent[]>` 返回该请求的事件序列；核心错误为 error 事件，传输、协议、进程退出、超时为 Promise 拒绝。`close()` 终止本客户端拥有的进程并等待退出。
- T0 的 `start {operation:"echo", ...}`（缺省 echo）原样返回 payload，`start {operation:"wait"}` 进入无副作用等待；cancel 按 runId 终结等待请求并确认取消。wait 仅验证传输取消，不模拟真实实验或中断恢复。
- 一次只允许一个等待操作；其他 start 返回 CORE_BUSY。不实现队列、重试或业务调度。unknown kind/operation 返回明确错误，不执行任意命令。
- 宿主每条请求上限 1 MiB，每条输出帧上限 8 MiB（给 JSON 转义和响应字段包装留余量）；先分帧检查，再检查未完成尾帧，不将一次流读取合并的多帧误当超限。每次请求有有限超时（默认 5 秒，测试可缩短），超时终止核心并拒绝所有未完成请求。T1 以后需按实际实验预算替换请求时限，不能将 T0 超时直接用于长时间业务执行。
- 宿主拒绝重复的在途 messageId；不存在、跨 runId、错误版本、非事件或非法终态的输出视为协议故障并关闭进程，stdout 的普通日志同样拒绝。

测试中伪协议进程仅用于验证宿主对损坏输出和崩溃的处理；中文、嵌套 JSON、版本拒绝、取消、超时、中文路径及未知动作均运行实际仓颉二进制。此层不能证明业务检查正确、凭据安全、模型效果或浏览器 UI 可用。
