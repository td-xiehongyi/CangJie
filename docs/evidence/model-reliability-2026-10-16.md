# AI 调用可靠性与目录选择修复

日期：2026-10-16 北京时间；基线为 `fix/workflow-ux-ponytail@63d087a`。本记录只覆盖本轮变更，不代替旧基线证据或正式验收。全部在当前会话实现，未调用子智能体。

## 缺陷与行为

1. 保存配置前规范化接口地址，避免等价尾部斜杠使密钥关联被清除。设置保存串行化；真实服务变更仍清除原密钥关联与发送确认。
2. 连接检查绑定配置修订号，禁止同时启动第二次检查。切换配置或清除密钥后，旧结果不能覆盖新状态；关闭会话中止检查。
3. HTTP 400/405/413/415/422、402、429分别归类请求拒绝、付费要求、限流；超时独立分类，401/403保留鉴权错误，404提示同时检查地址与模型。原始供应商错误正文不回传，以免包含密钥或源码。
4. 返回合法用量时先结算，再检查内容，修复截断/非法JSON仍保留过高预算的问题。缺少用量允许合法正文通过，但保留预留量、`usageUnknown=true`，返回使用量注明 `estimated`，不伪造实际计费；非法用量仍拒绝。
5. 正文读取期间取消/超时正确区分。分析服务将超时、限流与临时网络故障保持为可检查恢复条件的暂停状态；恢复仍受原任务累计预算限制，不自动重试。
6. Linux等非Windows环境保留材料真实路径大小写；不放宽原有路径越界、符号链接、敏感文件及发送确认校验。
7. Windows目录选择替换为 Common Item Dialog 文件夹模式，保留交互桌面检测、STA、取消和120秒上限。固定PowerShell/C#脚本不插入用户路径；释放COM对象和返回路径内存。01/04输入框支持粘贴及外围成对双引号。

## 验证

- 修改前：定向原有测试46项，45通过，1项因Linux目录被转小写而失败。额外模拟复现密钥丢关联、检查状态竞争、错误分类、用量结算及正文中断问题。
- 修改后：全部单元/组件测试75/75；AI可靠性、分析恢复/会话与密钥接口测试42/42；既有候选提供器定向测试19/19。合计136个不同测试通过，不累加重跑次数。
- 构建：contracts、host、UI通过。没有新增生产依赖。
- 目录验证：检查原生接口结构、选项、固定脚本、取消处理、路径返回API与粘贴转换；这些测试不证明Windows对话框已实际打开。

可复现命令：

```sh
npm run build:contracts
npm run build:host
npm run build:ui
node --experimental-test-module-mocks --test tests/unit/*.test.mjs
node --experimental-test-module-mocks --import ./tests/support/test-mutex.mjs --test --test-concurrency=1 tests/integration/model-reliability.test.mjs tests/integration/discovery-recovery.test.mjs tests/integration/discovery-session.test.mjs tests/integration/model-key-validation.test.mjs
node --experimental-test-module-mocks --import ./tests/support/test-mutex.mjs --test --test-name-pattern='unconfigured model|scope confirmation|scope blocks|is a provider fault|HTTP 200|budget is finite|invalid URL|unremembered key|checkpoint failure|credential store read/write failure' tests/integration/candidate.test.mjs
```

## 限制与待验

- 所有模型请求为本地合成服务或fetch模拟；无真实密钥、源码外发或实际模型消费。原生Windows凭据存储和进程锁未在本轮验收，Linux使用显式测试锁。
- 未运行完整npm test、真实浏览器、Windows原生目录窗口、实际模型和正式业务/负载验收。此前主线负载P95未达阈值的问题不属于本轮修复，不宣称整项目全绿。
- 在Windows上仍需验收：窗口地址栏粘贴；中文/空格目录；取消；无效路径；页面取消；本地凭据保存及重启。遇窗口失败可直接在页面粘贴，不能把回退可用当成原生验收通过。
- 不新增Responses/Anthropic等协议适配，不扩展接口路径或取消JSON结构/来源校验。完整文件分析大小限制保持不变。
- 提交至既有工作分支，不合并main，不启动GitHub Actions。

原生实现依据：[Microsoft IFileOpenDialog](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-ifileopendialog)、[FILEOPENDIALOGOPTIONS](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/ne-shobjidl_core-_fileopendialogoptions)。
