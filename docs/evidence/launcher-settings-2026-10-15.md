# Windows 启动入口与 API 本地保存开发记录

日期：2026-10-15。父提交：f75acfa2803e00f81a5b8910d87f9e9dcbab6a07。由当前会话直接实现和检查，没有调用子智能体。用户要求Windows一键启动入口和API本地保存；没有配置用户真实凭据或调用真实模型。

## 实现

- 新增根目录`Start-CangJie.cmd`、`scripts/launch.mjs`和`npm run start:oneclick`。入口定位自身根目录、核对Node24和开发依赖，重建契约/宿主/样例/UI，再启动并请求默认浏览器打开127.0.0.1本机页面。
- 首次依赖准备需用户运行`npm ci --ignore-scripts`；入口不静默下载或安装、不改系统策略。完整开发依赖缺失时给出准备提示，构建失败不启动旧dist。已有原生核心不在每次启动时重建；核心缺失明确提示候选/执行能力限制。
- 浏览器使用独立参数调用rundll32，不用shell拼接；只允许无凭据、无查询/fragment的127.0.0.1 HTTP根地址。浏览器启动失败保留服务并提示手动访问。
- workbench原有main-version配置选择保留。端口冲突按Express5的错误回调与error事件拒绝启动，避免对null server.address取port；不把占用端口自动当成本程序。
- API地址/模型的本地state.json保存、Windows凭据管理器Key引用本来已有，本轮沿用并补跨重启回归。UI新增独立“保存到本机”，不请求模型；原“保存并检查连接”保留并说明会请求配置服务。两种保存期间均禁用竞争按钮，成功提交后清空Key输入。
- “记住密钥”默认不勾选，用户主动选择后才持久保存；Windows存储不可用时报错，不退回明文。session-only Key不进入持久配置；查看状态不返回Key。未新增明文文件、云同步或跨电脑密钥迁移。
- 新入口纳入普通/源码开发包；历史ZIP未替换。release/all接入启动与设置专项，原生核心构建前置不变。

## 本轮直接开发检查

环境：Linux、Node24.19.0、npm11.9.0。

- 宿主TypeScript编译、UI类型检查/Vite构建通过。
- [最终组合开发回归](launcher-settings-final-2026-10-15.log)：56/56，包含旧unit、设置保存/重启、旧Key校验、主入口及打包迁移测试。
- 其后只加强release/all调度断言，[启动器最终专项](launcher-final-2026-10-15.log)6/6（其中5项与前述组合重叠，新增1项）。不同用例合计57项通过，不将重跑累加为62项。
- [启动入口先红](launcher-red-2026-10-15.log)、[保存按钮先红](settings-local-red-2026-10-15.log)、[保存按钮转绿](settings-local-green-2026-10-15.log)保留。
- [设置API/端口专项最终4/4](settings-local-integration-2026-10-15.log)：跨宿主重启恢复引用并可读合成Key、JSON/状态不泄露、清除后重启不恢复、session-only Key不持久化、凭据写入失败拒绝成功、端口冲突返回EADDRINUSE。该4项已包含在组合56项中。
- [端口错误先红](launcher-port-red-2026-10-15.log)：初次Promise修正仍未处理Express5传给listen回调的error，导致null.address；改为显式拒绝该回调错误后通过。
- 凭据集成测试起初mock child_process漏导出execFile，属于测试接线失败，补齐原模块其他导出后继续；不是产品回归或Windows真实失败。[接线日志](settings-local-wiring-2026-10-15.log)保留。

复测命令（仓库根目录、锁定依赖和契约/样例已构建）：

```sh
npm run build:host
npm run build:ui
node --experimental-test-module-mocks --test --test-concurrency=1 tests/unit/*.test.mjs tests/integration/settings-local.test.mjs tests/integration/main-entry.test.mjs tests/integration/model-key-validation.test.mjs tests/integration/discovery-package.test.mjs
```

## 测试替身与未验收边界

凭据集成测试使用合成Key和内存模拟的Windows凭据传输，调用真实ModelCredentials序列化/引用逻辑并实际启动本机HTTP宿主、保存和重读文件。它不是Windows CredWrite/CredRead真实验收。启动器测试检查步骤、错误处理、参数与入口文本，浏览器打开使用替身；未实际在Windows双击.cmd或启动默认浏览器。UI保存按钮测试驱动实际组件事件处理器，但不是浏览器交互验收。

本轮未启动真实模型、读取用户Key、付费请求、运行实际k6或正式审核。没有将Linux通过视作Windows完整通过；原S阶段/T9/T10正式验收继续开放。使用步骤见[快速开始](../QUICK_START.md)。
