# T0 环境与通信验证

日期：2026-10-12（Asia/Shanghai）。状态：T0 完成；只完成环境与协议层，没有 T1 业务解释器或真实网站验证。

## 已核对环境

| 项目 | 本轮实际结果 |
| --- | --- |
| 系统 | Windows_NT，内核 10.0.26100，x64 |
| Node / npm | D:\Node_js\node.exe，v24.19.0 / 11.17.0 |
| 仓颉 | 项目 .local-tools/cangjie；cjc 与 cjpm 均为 1.0.5，目标 x86_64-w64-mingw32 |
| JSON 扩展库 | 官方 stdx 1.0.5.1；静态链接 encoding.json 与 serialization.serialization；真实编译、运行通过 |
| TypeScript | 5.9.3；@types/node 24.10.0；package-lock.json 固定依赖，npm install 使用项目本地缓存 |
| k6 | 当前 PATH 未找到，未安装；T8 前验证，不阻断 T0 |
| 浏览器 | Chrome 154.0.8037.98、Edge 155.0.4283.45 文件存在；未启动浏览器自动化 |
| Playwright | 项目尚未安装；T6 前安装并运行，存在浏览器不等于 UI 验收通过 |
| Git | 当前目录不是 Git 仓库；未初始化、提交或推送 |

机器可读发现记录：[environment.json](environment.json)。所有 SDK 环境仅传入构建/核心子进程，未修改用户或系统 PATH。

## 工具来源及校验

- SDK：[官方 1.0.5 下载页](https://cangjie-lang.cn/download/1.0.5)、[官方 Windows 安装说明](https://docs.cangjie-lang.cn/docs/1.0.5/dev-guide/source_zh_cn/first_understanding/install.html)。ZIP 297274602 bytes，SHA-256 `08c6c1dd0de73396f63ac85085d635e79ce84fef98d330cb00869b4fc8f1cb2e` 与官方页面的清单一致。
- stdx：[官方 1.0.5.1 release ZIP](https://gitcode.com/Cangjie/cangjie_stdx/releases/download/v1.0.5.1/cangjie-stdx-windows-x64-1.0.5.1.zip)，本次 HTTPS 下载后固定 SHA-256 `8cd08133c4f1152acdcff00c923d9abe8184f081d6b92e924d2285f7e27f7162`。这是本轮锁定值，不冒称独立发布者签名或官网提供的校验值。
- ZIP 和解压后的 LICENSE 均保留在 .local-tools。依赖不进入成果包；交付打包仍在 T9。

## 可复跑入口

当前目录：`C:\Users\xie\Desktop\Project`。本机已准备完依赖，直接执行：

```powershell
npm run verify -- protocol
```

它会重新编译 TypeScript、编译真实仓颉核心，再运行协议测试。成功信号：14 tests、14 pass、0 fail、0 skipped。`npm test` 同样执行本阶段完整测试；`npm run check` 做宿主类型检查/编译与核心构建；`npm run doctor` 查看当前环境。

首次准备相同依赖的命令（本机已执行等效下载、校验、解压及 npm 安装；并未在另一台机器复现）：

```powershell
pwsh -File scripts/setup-tools.ps1
npm ci --ignore-scripts --no-audit --no-fund
```

setup-tools 保留已有工具目录、不覆盖；路径变化可通过本次 shell 的 CANGJIE_SDK、CANGJIE_STDX 指向解压根目录。普通本机终端不要求管理员权限；Codex 沙箱曾阻止仓颉子工具 opt.exe，获准执行后编译成功。另有一次链接输出临时拒绝访问，检查时无遗留目标进程，随后顺序构建成功，具体瞬时原因未确认；构建与运行应顺序执行，避免运行进程占用目标 EXE。

`npm run package` 当前明确拒绝并提示 T9，不能把 T0 二进制当作完整产品包。

## 实际验证与边界

- [最终构建日志](t0-check.log)：TypeScript 与仓颉编译成功，无编译警告。
- [完整测试日志](t0-tests.log)：14/14 通过，无跳过。
- [真实往返记录](t0-roundtrip.json)：Node 发送中文、空格路径、嵌套 JSON，仓颉解析并返回关联事件；stderr 与 stdout 分离。
- [预览哈希核对](t0-preview-baseline.json)：最新蓝白四页的六个源文件未改。
- [协议约定](protocol-v1.md)、[实施记录](t0-progress.md)保留本轮决定、失败原因及审查修复。

覆盖中文/emoji/转义、真实中文 EXE 与工作目录、未知版本后继续使用、取消等待、关闭及异常退出、超时、stdout 污染、消息关联、分帧、大小边界。最初六项测试因实现不存在失败；独立审查发现近 1 MiB 的请求因响应包装被误杀，新增失败用例后修复为请求 1 MiB/输出帧 8 MiB，并按帧检查；最终完整测试通过。

echo/wait 仅是 T0 协议操作；没有验证业务规则、执行网站、读取原库、调用模型、存储凭据、生成真实验证包或运行负载。预览仍是固定演示，T1—T10 保持未完成；本轮按用户指定范围停在 T0。
