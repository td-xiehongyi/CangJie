# T4 独立审查与修复

2026-10-13，一次独立只读审查，审查者未编辑、构建或运行测试、未继续分派。无Critical；3项Important和1项Minor已处理：

1. 同一taskId多个实例可覆盖旧预算：改为Windows命名Mutex跨进程独占，并在锁内重读。连接检查和整个恢复运行均覆盖。测试还实际启动另一个Node进程核对排他和关闭释放。
2. 目标HTTP 200但字段/分页/关联不足，inconclusive也能待审核：新增conclusive门槛，由宿主判定和仓颉复核；未知保持awaiting_trial，有证据的业务fail不否定候选。
3. 根目录指向tests/reference或fixtures可绕过相对路径禁发：对真实根和文件检查工具私有保护树，覆盖完整模板、参考集及私有证据。
4. 各版验证需扫描目录追溯且失败轮次偏移：history保存被验证轮次、候选摘要、validationRef和通用诊断，下一轮生成与上一轮验证分开关联。

三项Important均先以回归复现：[修复前](../t4-review-red.log)3项失败→[修复后](../t4-review-green.log)3项通过。没有未处理的Important/Critical，也没有将证据缺口计为业务失败。补查共享ValidationRecord严格接受试运行copyId/completed/verdicts，错误类型和未知字段仍拒绝。

审查前全量168/168通过仍未发现上述边界，因此不能将“测试全绿”当作完备证明。最终回归以[t4-full.log](../t4-full.log)为准。真实DeepSeek密钥/模型尚未取得，真实模型生成后的分层通过仍为开放门槛；模拟候选不得替代，也不提前实施T5/T6。
