# 可交互测试网站

三个样例均有基础网页，访问各自服务的 `/` 即可使用。界面操作调用真实业务接口；不调用AI，也不表示验证平台已判定业务通过。

| 目录 | 基础界面 | 主要业务约定 |
| --- | --- | --- |
| [ticket](ticket/README.md) | 登录、提交、我的工单、修改标题、退出 | 去重；账号隔离；修改标题不改变优先级/归属 |
| [registration](registration/README.md) | 登录、报名、报名回执、修改姓名、退出 | 去重；私有回执；修改姓名不改变组别/归属 |
| [status-ticket](status-ticket/README.md) | 登录、创建、列表、关闭、尝试重开、退出 | 关闭不可逆；标题与归属不变 |

## 最短启动方式

安装Node.js 24，在仓库根目录先执行 `npm ci`。随后任选一个：

```sh
cd samples/ticket
npm run demo
```

把目录换成 `samples/registration` 或 `samples/status-ticket` 可体验另外两个网站。终端显示访问URL、demo-owner / demo-other账号及随机密码。复制URL到浏览器；不要在这些样例输入真实个人信息或密码。端口随机选择，只监听本机127.0.0.1。

每次演示使用全新的系统临时数据库；正常Ctrl+C退出清理。强制终止可能留下临时目录。不会使用外部传入的TEST_DATABASE，也不覆盖验证器已有副本或源目录数据。

## 如何操作

1. 登录 demo-owner，提交一条记录，再刷新查看。
2. 保持同一提交意图再次提交，记录数量不增加；创建下一条先点击“新的提交”。
3. 修改标题/姓名，或关闭状态工单；关闭后可显式尝试重新打开，界面展示服务器409拒绝。
4. 退出登录，再登录 demo-other；相同批次不应看到前一账号的记录。
5. “高级：演示批次与去重标识”可查看/切换批次。刷新保留批次但需要重新登录；密码和登录令牌不持久化。

## 在CangJie中验证

导入单个样例目录，而非整个samples目录。仍使用现有 `verification.json`、`src/seed.ts`、`src/server.ts` 的隔离初始化协议；演示启动器不替代验证器的初始化流程。新增页面/脚本位于样例src内，复制后可独立服务，不依赖其他样例文件。

## 开发测试

```sh
npm run build:sample
node --test tests/integration/sample-ui.test.mjs tests/integration/sample-client.test.mjs
```

上述命令在仓库根目录执行。客户端测试使用最小DOM模型加真实HTTP，不能代替浏览器视觉验收。在有浏览器的环境另行运行：

```sh
node --test tests/browser/sample-websites.test.mjs
```

Windows使用已安装的Edge；其他环境使用CANGJIE_BROWSER_PATH或默认Chromium路径。此轮没有完成真实浏览器/Windows验收，证据见[样例界面记录](../docs/evidence/sample-websites-2026-10-16.md)。
