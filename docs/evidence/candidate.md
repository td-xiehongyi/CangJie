# T4 模型与候选验证

核对日期：2026-10-13。用户授权“完成T4”，范围止于T4，未实施T5发布或T6正式网页。**实现和本地自动验收已具备；真实DeepSeek候选验收待用户本机输入模型名、API Key及发送确认，T4整体尚未完成。**

## 已实现

- Chat Completions `/chat/completions`、`json_object`、明确JSON提示和有限输出。模型名初始为空，填写值原样请求，无替换或自动回退；连接检查和候选资格分开。
- 每次请求先检查projectId、规范化文件范围、内容类型、接收地址和确认记录，再读取并过滤内容。扩展范围、跨项目、换服务、越界路径和私有材料均阻断；工具自有测试、模板及私有证据树不能通过改变根目录绕过。发送清单仅保存路径、类型、字节数和摘要。
- 模型只得到筛选摘要、已确认规则、可用操作/表达式、通用合同格式和公开断言义务标识；生成函数不读取完整目标模板、观察数据、对照答案或业务缺陷控制。修订只回传通用失败诊断，不将目标业务失败用于弱化规则。
- 一条推荐主流程、待确认规则、映射提议和匹配理由；结构检查拒绝多流程附加字段及模型自称确认的规则。建议不授权执行，T6接线另行实施。
- 内部预算 `model-v1`：最多8次调用、累计120000 Token、单次输出6000 Token、输入98304字节、单次90秒、任务10分钟；候选最多32动作、动作5秒、运行60秒。最多2次自动修订，轮次0/1/2与调用数独立。
- 请求前同步保存调用及保守Token预留；服务故障暂停，无网络自动重试。保存/恢复保留预算、轮次、草稿、诊断及每版验证引用。Windows短暂文件替换失败仅有限重试本地保存，未落盘不发送。
- 按taskId取得Windows跨进程独占锁，锁内重新读取最新记录；同任务另一个恢复实例不能重复花旧预算。连接检查也受该锁保护，宿主关闭后通过管道释放锁。
- API Key默认只在会话内存；用户主动选择记住才写Windows凭据管理器，配置只保存引用。可清除缓存及系统项；关闭重开、端点绑定、不记住、读取/写入失败均有检查，无明文退路。
- 仓颉负责准入和修订决定，核对候选、规则、解释器、套件摘要及各验证门槛。技术验证后必须做T2目标副本试运行：有证据的业务fail保留并允许待审核，取证不完整/inconclusive停在awaiting_trial。核心没有发布分支。

## 自动验收与限制

确定性模型服务用于协议/故障/候选边界测试；候选测试的正确输出来自测试夹具，**不能计作真实AI生成**。这些输出实际进入仓颉静态检查、T3观察和HTTP对照、T2目标副本，正常/对应缺陷/未知逐断言核验。目标优先级被破坏时正确保留fail；目标分页不完整时保持未知并阻断审核就绪。

最终通过：`npm run verify -- candidate`36/36、`npm test`173/173、`npm run check`构建通过。完整日志：[候选验收](t4-candidate-green.log)、[全量回归](t4-full.log)、[构建](t4-build.log)。独立审查发现3项Important、1项Minor，已修复；对应[RED](t4-review-red.log)→[GREEN](t4-review-green.log)，另有[试运行共享合同RED](t4-trial-contract-red.log)→[GREEN](t4-trial-contract-green.log)。详见[审查记录](t4-review.md)。预览六源核对见[t4-preview-baseline.json](t4-preview-baseline.json)。

支持范围仍为已核对的Node24/Express5/Token/HTTP JSON与标题更新试点；目标适配器对工单查询增加priority/ownerId规范化字段，未宣称任意网站自动映射或任意性质证明。T3冻结设施保持原样；没有可信对照的规则等待能力补充。凭据桥接及任务锁为Windows实现。正式UI、审核发布、验证包、迁移、负载仍属T5—T10。

## 真实验收入口

在项目目录的本机PowerShell运行：

```powershell
.\scripts\t4-live.ps1
```

入口先展示 `docs/model/title-update-context.json` 的公开确认规则、能力及发送内容类型；服务固定为本次首验的 `https://api.deepseek.com`。输入YES批准该范围，填写准确模型名，再隐藏输入API Key；记住默认关闭。密钥不进命令参数、环境变量、聊天或文件。脚本在本机创建两名合成账号的独立目标副本。

连接检查之后，用同一任务累计预算生成候选、运行分层验证与目标试运行。每次保存 `.local-data/candidates/<taskId>/state.json` 和 `.local-data/model/<taskId>-live-result.json`；结果须为ready_for_review且静态/覆盖/观察/HTTP均通过、目标证据充分，才能满足本轮关键门槛。**ready_for_review不是发布。** 服务故障需明确恢复原taskId，例如：

```powershell
.\scripts\t4-live.ps1 -TaskId <上次任务ID>
```

恢复保持原模型、规则、累计预算与轮次，不创建新预算；模型不符会阻断。会话密钥需重输，已选记住时可由后续T6设置入口读取/清除引用。当前没有真实调用结果，不存在可引用的真实成功候选。

## 技术依据

实现参考[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)、[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)和[Microsoft CredWriteW](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew)。仅DeepSeek官方地址使用显式关闭thinking的JSON工作模式；其他配置端点不附加该原生字段。
