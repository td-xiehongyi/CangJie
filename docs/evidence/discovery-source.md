# S1 / D1 源码索引与受控读取

日期：2026-10-14；范围：仅 S1，S2—S5 未实施。无真实模型调用或源码外发。

## 已实现

改动文件：新增`packages/contracts/discovery.ts`、`apps/host/src/discovery/{index,access}.ts`、`tests/integration/discovery-access.test.mjs`及`tests/fixtures/discovery-source/`；修改`projects/inspect.ts`、`apps/host/package.json`、`package-lock.json`、`packages/contracts/{package,tsconfig}.json`、`scripts/{verify,package}.mjs`，并同步旧`target-trial-recovery.test.mjs`的一处界面定位器。阶段记录为本文、实施计划v1.1及Obsidian项目档案/INDEX；原需求、设计及旧计划未改写。

- `packages/contracts/discovery.ts`：源码快照、文件索引、读取范围、搜索位置、片段与引用契约及运行时校验；独立 `./discovery` 导出，不改变既有 v1 业务协议。
- `apps/host/src/discovery/index.ts`：`buildSourceSnapshot(root, projectId, options?)`。不读取运行配置、不启动网站、不安装被测项目依赖；`includeProjectTests` 默认 false。JS/TS/JSX/TSX（含 mjs/cjs/mts/cts）使用本地 TypeScript 编译器 API；JSON/Markdown/TXT 仅作文本材料。
- 索引保存路径、原始字节 SHA-256、字节数、语言、行数、声明/导出符号、静态 import/export 和相对文件关联，以及可识别的路由声明。语法错误保留文本读取入口，并记 `PARSE_ERROR`；动态路由记 `UNRESOLVED_ROUTE`，不推断路径。
- `apps/host/src/discovery/access.ts`：`createAnalysisScope`、`searchSource`、`readExcerpt`、`validateSourceRefs`。范围绑定项目与快照，默认测试排除；范围 hash 用于检查内容变化，不是远端发送授权。S2 须另外持有宿主权限记录并确认云端发送。
- 片段携带正文、实际 UTF-8 字节数及 `SourceRef`；行号从 1 开始，首尾均包含，CRLF/CR 统一为 LF 后计算片段摘要。搜索仅返回位置及文件指纹，不返回正文或有效引用。引用必须精确匹配宿主实际读取日志中的片段，再核对当前文件；不能用模型自报的 reads 代替宿主日志。
- `projects/inspect.ts` 抽出链接拒绝和有大小上限的共享文件读取。旧 `sourceFiles` 的扩展名/排除策略、快照摘要和 `inspectProject` 运行门槛保留；源码分析独立调用新增接口。
- discovery 测试已注册到 `scripts/verify.mjs` 的 discovery/all；TypeScript 5.9.3 声明为宿主生产依赖，锁文件及交付契约源码清单同步。未替换正式交付包。

## 读取边界与停止原因

| 边界 | 实际行为 |
| --- | --- |
| 路径 | 项目内相对路径；支持 Windows 大小写与分隔符归一化；拒绝 `..`、绝对/UNC 路径、ADS、Windows 保留名称和尾随点/空格 |
| 链接 | 根目录、祖先、子目录及文件链接均拒绝；索引遇链接记问题并跳过；读取检查打开的文件身份与前后路径 |
| 永久排除 | 依赖、版本库、构建/缓存/覆盖产物，`.env`、凭据/密钥/数据库/备份等；`.aws/.codex/.agents/.local-data`；私有答案及独立验证资源目录；直接选这些子树为根也不能绕过 |
| 工具资源 | 工具自身 `tests`、`templates`、`.local-data`、`output/delivery` 子树始终拒绝，不被项目测试 opt-in 解禁 |
| 项目测试 | 外部项目测试需建快照时 opt-in，并在读取范围中再次允许；作为输入不能再算未见独立验证答案 |
| 正文过滤 | 二进制/无效 UTF-8 不索引；可识别密钥、私钥、Bearer、秘密字面量（含 JSON）整文件排除；过滤不能保证识别所有秘密 |
| 读取限额 | 每片段最多 8192 **字节**，超限报 `EXCERPT_TOO_LARGE` 并提示缩小行区间；超过 65536 字节的文件仍只按片段返回；不提供整文件发送接口 |
| 检索限额 | 字面单行查询，最多 256 字符，返回最多 20 个位置；传入更大 limit 截为 20；结果按扫描顺序截断，不代表完整覆盖 |
| 索引限额 | 单文件最多 2 MiB；本地索引最多 10000 文件/64 MiB，达到上限记 `INDEX_BUDGET_EXHAUSTED`；未纳入文件不可读，不能宣称完整项目索引 |
| 变更/伪造 | 文件删除、指纹变化或路径替换拒绝旧读取/引用；未读正文、错误行号、错误文件/片段 hash 或不同 snapshot 引用无效 |

常见错误：`PATH_ESCAPE`、`SENSITIVE_FILE`、`SCOPE_NOT_ALLOWED`、`INVALID_SCOPE`、`SOURCE_NOT_INDEXED`、`STALE_SOURCE`、`INVALID_SOURCE_REF`、`INVALID_LINE_RANGE`、`EXCERPT_TOO_LARGE`。有明确中文恢复提示；索引问题不包含被过滤正文。

## 验证证据

- 环境：Windows x64；Node 24.19.0、npm 11.17.0、TypeScript 5.9.3；本地仓颉 1.0.5、stdx 1.0.5.1、k6 2.3.0 可用。项目根目录实际不存在 `AGENTS.md`，按本次用户提供的规则及 Obsidian 目录规则执行。
- 测试先行：最初 8 项明确因 D1 未实现失败；排除根目录和 JSON 秘密两项补充测试先红后绿；独立审查的 Express 设置读取、mjs/cjs 来源关联问题分别先红后绿。日志：`output/s1-source/logs/discovery-*.log`。
- contracts/host 构建通过；最终源码专项 **12/12**。覆盖无 verification.json/无入口、TSX/JSX、语法失败、动态路由、排除范围、测试 opt-in、Windows 路径、目录联接与替换、真实读取引用、过期来源、多字节限额、8192 字节边界、大文件片段、检索上限和秘密过滤。
- 旧 access 完整 **37/37**。初次受限执行被 LLVM `opt.exe` 权限阻断；获准本机运行后基线一次 `STARTUP_OR_BASELINE_FAILED`（36/37），单项复查 1/1、完整复查 37/37。没有放宽启动或业务断言。
- `npm run check`完整通过（contracts、host、样例、参考实现、仓颉、UI）；最后一次`npm test` **276/276**，其中包含最终12项源码专项及候选/审核/模板/报告/复测/负载/临时交付回归。日志：`output/s1-source/logs/check-final.log`、`full-regression-final.log`。未单独重跑完整Edge工作台e2e组；没有新增或变更产品UI。
- 临时全新目录 `npm ci --omit=dev --ignore-scripts` 后，实际从该目录解析 TypeScript 5.9.3；目录内没有开发用 `@types/node`，源码索引/TSX读取/来源校验通过。证据：`output/s1-source/runtime-result.json`。这是本机生产依赖运行证明，非其他电脑兼容性或正式交付验收。
- fresh read-only review 已完成；重要问题修复后以失败→通过测试核验，不重复分派审查。567个既有跟踪文件与本轮前SHA-256一致，其余仅8个明确授权的关联源码/配置/测试改动；无意外跟踪文件变化，HEAD保持1281778。旧测试覆盖的4份JSON先另存本轮结果，再按本轮前原字节保留；未从Git还原历史补丁。记录：`output/s1-source/integrity-result.json`，本轮生成证据另存`output/s1-source/generated-evidence/`。
- 首轮全套272/274：`access-core`在写固定旧证据时出现Windows `UNKNOWN`文件打开错误，定向复查通过；候选恢复测试等待旧“选择流程”标签超时，核对既有UI后只将测试定位器同步为“要检查网站的哪种操作？”，链路2/2通过。中间一次复查曾因旧候选自动修订而出现calls=2的断言失败，随后原断言复跑通过；没有为此放宽次数、预算或准入。所有失败日志保留在`output/s1-source/logs/`。

## 未覆盖与下一阶段

静态索引不构成调用执行证明或业务正确性标准。当前路由识别仅记录 `app/router/server` 上可识别的方法与字面路径，不做框架类型证明、别名推导、挂载前缀组合、链式路由或动态关系解析。导入只关联索引内可定位相对模块；路径别名、包内部解析和 CommonJS `require` 关系未追踪。后者为审查保留的小项，不能把当前索引当完整依赖图。

读取期间会核对链接、文件身份和版本，但不把普通本地文件系统检查宣称为对抗恶意并发写入者的 OS 沙箱。文件快照是本地指纹与索引对象，尚无分析会话持久化、跨轮审计、4片段/轮及累计源码/模型预算；这些属于 S2/D2。没有新增业务概览/推荐、规则确认、执行资格、API/UI入口或浏览器执行能力；S1 不能证明真实模型理解、检查可执行或验证通过。

下一步仅在获授权后实施 S2：先 D2 会话原子持久化、修订冲突、受控多轮读取、预算/暂停恢复与来源核验，再 D3 源码项目 API 和业务概览/推荐入口。原 T9 实际审核/交付及 T10 保持开放；本轮无提交、推送、发布或正式包替换。
