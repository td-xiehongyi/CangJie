# samples基础网站界面与演示入口

2026-10-16 北京时间。基线 `fix/workflow-ux-ponytail@705ad99`；在当前会话完成，没有调用子智能体。提交到同一工作分支，不合并main。

## 本轮交付

- ticket：登录/退出、提交工单、本人记录列表、刷新、标题修改。
- registration：登录/退出、报名提交、本人回执、刷新、显示姓名修改。
- status-ticket：登录/退出、创建open工单、查询、关闭及显式尝试重开。重开请求实际发送给服务器，展示409拒绝，不伪造业务成功。
- 三站保持一致的浅色卡片布局、移动端单列适配、输入标签、焦点样式、加载禁用和状态提示。没有增加前端框架或CDN依赖。
- 提交意图在当前页面内复用；“新的提交”明确更换意图。演示批次保留于sessionStorage，账号切换不变，便于核对隔离。密码及登录令牌只存在当前页面内存；退出调用服务端注销接口，令牌失效。
- 页面仅公开HTML/CSS/JS三个展示路由；业务API继续鉴权。用户内容使用textContent，不执行输入的HTML。
- 页面/样式位于src/ui.ts，脚本位于src/public/app.js。已检查三站文件均被现有sourceFiles复制清单包含，未扩大验证器可复制扩展名。

## 演示启动与数据

每站新增 `npm run demo`，独立启动器读取本项目已有初始化版本，创建新的系统临时目录、SQLite数据库和两个随机密码的合成账号。默认本机空闲端口，只监听127.0.0.1；终端显示URL及合成凭据。

启动器覆盖TEST_DATABASE等为本次新建目标，不复用外部数据库地址。正常退出清理临时数据；断电或强制终止不能保证清理，新一轮不会自动使用旧目录。原验证器start/initialize:test入口、verification.json和业务判定规则保持不变。

## 验证证据

- 修改前，三个样例主页均返回401，新增页面测试3/3失败。
- 修改后，新样例页面/静态资源/真实HTTP业务及演示启动测试6/6通过；实际客户端脚本在最小DOM模型中结合真实HTTP执行，3/3通过。
- 原状态工单/冻结转移资源回归16/16通过；所有单元/组件测试75/75通过。合计100个不同测试，不累计重复运行。
- 三站TypeScript检查通过；客户端与演示入口JavaScript语法检查通过；git diff --check通过。
- 回归覆盖：鉴权、创建与去重、列表与他人隔离、字段修改/不可逆关闭、注销令牌、静态资源、随机合成凭据可登录、正常退出删除临时目录、文本形式呈现HTML字符串。
- 已将两个新集成测试文件加入scripts/verify.mjs的transfer分组，因此后续完整测试也会纳入。此轮没有执行完整npm test。

执行命令（仓库根目录）：

```sh
npm run build:sample
node --test tests/integration/sample-ui.test.mjs tests/integration/sample-client.test.mjs tests/integration/status-ticket-fixture.test.mjs tests/integration/transfer-fixture.test.mjs
node --experimental-test-module-mocks --test tests/unit/*.test.mjs
```

## 未验范围

新增真实浏览器检查 `tests/browser/sample-websites.test.mjs`，覆盖三个页面的登录/创建/修改/退出和窄屏溢出。当前云端浏览器此前已被权限阻止，本轮不绕过限制；该文件尚未执行。最小DOM模型测试不能证明浏览器排版、键盘交互或Windows显示正确。

未进行本轮Windows原生验收、完整可信执行器/负载回归、真实模型调用或正式人工审核。旧历史证据不覆盖样例源码变更后的sourceHash；重新导入后需按平台要求重新确认，不可沿用旧来源资格。此交付是可交互开发样例，不是生产网站或正式业务验收结论。
