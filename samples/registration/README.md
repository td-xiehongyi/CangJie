# 活动报名样例

仅用于专用合成数据验证：报名提交、重复提交、私有报名查询、报名信息编辑。不包含支付或限额争抢。

测试业务约定：提交的姓名应保存；同一提交意图只生成一份报名；其他账号不可读取报名；只修改显示姓名时，组别与报名归属人保持不变。创建者保有回执访问权限，归属人是单独的业务字段。测试身份确认这些约定仅供开发验收，不代替用户对真实项目的确认。

映射 `title → displayName`，`priority → track`；登录改为 `/sessions` 的 account/passphrase，Token与身份为嵌套字段；创建/查询改为 `/enrollments`，编辑改为 PUT `/enrollments/:id/profile`，查询列表与分页字段均不同。id/ownerId/intentId/attemptId 是现有执行器要求的取证关联字段，仍保留；尚未证明任意关联字段名称均能适配。

由工具按 verification.json 复制至隔离目录，提供 TEST_DATA_ROOT、TEST_DATABASE、TEST_INSTANCE 和两个合成账号后启动。初始化入口拒绝未确认的目标；不要指向真实业务库。
