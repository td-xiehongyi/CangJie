# 受控合成工单状态样例

这是S4的单一受控业务，使用本机隔离副本、合成数据和两个普通测试账号。不是生产工单规则，也不是任意网站适配器。

公开业务约定（供源码分析与用户核对）：

- 工单允许 open→closed。
- closed 后请求 open 必须被拒绝，状态仍为 closed。
- 标题和归属保持不变。

每次状态转换后分别核对工单标题和归属，包括关闭后的中间状态与拒绝重开后的最终状态；不能仅比较最终与初始相等。

显式动作：认证所有者 create(title,status)、query(id)、update(id,status)。create初始状态是open；update关闭至closed后，再请求open应收到拒绝。query返回单个工单的id、title、status、ownerId及完整items/total/hasMore/complete；这些字段须来自实际响应，不能用HTTP状态或稳定对象ID替代。映射只允许声明字段和相等断言，没有脚本执行。

运行资料在verification.json。初始化只读取TEST_DATABASE等隔离测试配置，不在原目录写入真实账户或业务数据。开发者独立验证资料保存在工具私有目录，不属于本样例源码分析输入；真实模型分析、原生仓颉运行和正式人工审核须单独验收。
