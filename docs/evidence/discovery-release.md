# S5/D7—D8 复用与开发交付证据

> 2026-10-15审查补充：下文保留2026-10-14开发发布时的证据，不是对当前代码“无问题”的保证。当前会话曾复现分析期间新增文件不及时停止的问题，后续已修复并补开发回归，详见[修复记录](review-fixes-2026-10-15.md)；[原审查](current-session-review-2026-10-15.md)保留修复前证据。原有通过日志不修改、不重记次数。

日期：2026-10-14。用户允许暂跳正式验收继续云端开发。S1—S5开发功能已实现；本阶段最终独立代码审查通过，无未修阻断项。审查者独立执行同口径41项全部通过，另核负载非原生两项2/2；不把原生/正式验收记通过。本文只记录受控开发回归，不关闭旧T9实际审核、业务/负载和正式交付，T10正式对照没有运行。

## D7 来源复核与纠正

- 重新建立本机安全索引，比较显式业务读取范围内的文件集合、摘要和相关索引缺口。未引用文件、新增业务文件、删除文件和元数据变化也会保守失效。初版不声称精准依赖增量分析，也不把范围外材料转为已确认事实。
- 默认全根范围没有package/tsconfig/verification配置豁免。无运行配置起步的受控整链明确选择src与README业务范围，之后补入的运行配置在范围外，仍通过独立运行环境、实际源摘要、映射、数据和身份门槛。不能为兼容旧测试放宽产品来源门槛。
- 变化时公开视图标stale/referencesValid=false、清当前建议选择，规则公开sourceCurrent=false；旧确认仅是历史事实。选择、继续确认、恢复、编译与执行不沿用旧来源。无法访问/搬走/含链接的根目录也只显示stale历史，既不跟随链接也不以旧快照证明有效。
- getDiscovery只核验和返回视图，保存的报告正文不写回；stale建议selection在事务内拒绝且原保存字节不变。原规则版本和运行报告保持可查。
- appendRuleCorrection接受精确项目/规则/版本/hash与revision，只追加本项目待确认版本、清选择与确认，不改历史语义，不自动发给模型，不构建跨项目经验库。实际UI事件提交同一精确引用，并显示来源失效和禁止编译。
- 目标负载的旧业务通过必须同时匹配当前源码、映射、数据条件和完整账号身份记录。旧记录缺这些证据也不会自动获准。调用者可变输入先快照，每实验重新核对当前源与环境，再复核精确项目规则与方案资格。停用版本在宿主直接拒绝，不依赖工具是否可用。前置失败保留原因和unknown，不调用决策核心假装得到结论。

## D8 包与路径

- v1验证包原样读取、完整性/身份保持；未知schema/interpreter版本拒绝。包查看入口不需要核心、模型或运行配置，缺精确适配/工具/私有资源/资格仍不能复跑。
- 普通运行包仍要求真实verification-core.exe。新增--source-only是source-development-delivery/coreBuilt=false的明确开发交付，不制造exe，不声称正式Windows运行通过。
- 普通/源码开发包均带TypeScript生产运行依赖、public discovery/status-transition契约源码与ticket/registration/status-ticket三个样例的构建源。实际移至带空格和中文的新目录后npm ci --omit=dev安装，Playwright不在生产依赖中，TypeScript仍可实际索引TSX、读取片段、核验精确SourceRef与公开状态契约。
- 私有资源独立reference-v2包，旧reference-v1按旧清单安装兼容，未知资源版本拒绝。v2含两套独立实现、两套冻结锁、构建配置和私有观察/候选，共19文件；旧私有历史原字节留在仓库，普通包不带历史或答案。安装后的新目录实际重建contracts/host/三个样例/两套reference，并读取十控制的status suite。
- 目录和祖先链接、Windows保留名/越界路径、错误摘要字段、未知声明格式均拒绝。安装先验证清单/冻结锁与已有冲突，每次复制后及最终再次核目标摘要与两套冻结锁。验证后源竞态变更会拒绝报告成功；安装不是并发修改的原子事务，失败时不自动删除部分文件。
- 交付目录重定位不会改变项目规则原sourceRoot绑定。整链另复制同字节项目到异根：导出的历史可读，即便sourceHash相同，执行仍RULE_PROJECT_MISMATCH，不能把新项目当旧项目延续。
- S1—S5所有新增开发文件已列入discovery/all，含reuse/package/完整链与调度器测试。单项180秒，discovery/all子进程15分钟，保留原生核心构建前置；文件存在不等于完整npm test已实际运行。

## 新目录完整开发链

[受控完整链1/1](s5-delivery-chain-green-2026-10-14.log)：全新目录只放status-ticket源码与公开README，没有verification.json，运行识别明确unsupported；实际DiscoveryService通过本机确定性provider三轮search/read/result，引用来自实际读取的两个SourceRef。明确确认公开六eq义务契约后补运行配置、编译精确规则、生成确定性候选并完成私有10控制×观察/HTTP两阶段共20阶段验证。

只有仓颉进程使用显式test-only-model，OS互斥使用显式测试替身；审核身份test-only-business/test-only-tech仅写隔离注册表。宿主持久化、初始化、认证、HTTP和取证实际执行：正常运行六观察，导出后关闭provider/discovery，重开stores/registry，不调用模型复跑六观察。原run/report/export逐字节不变；导出和模型请求没有Key、测试账号密码或私有控制标记。不存在实际人员签字或真实模型效果验收。

## 最新检查与计数

开发专项由不同最终日志组成，不能据此宣称原生完整集成通过：

- [reuse与S5调度器12/12](s5-reuse-runner-green-2026-10-14.log)：reuse11、runner1
- [实际UI handler/SSR18/18](s5-ui-green-2026-10-14.log)：原S4十六项及S5两项，没有浏览器
- [打包10/10](s5-package-green-2026-10-14.log)：实际跨目录依赖/源码索引/资源安装/重建及安装竞态
- [完整发现到复跑链1/1](s5-delivery-chain-green-2026-10-14.log)
- 上述开发专项合计41项，包括原有16项UI，新增S5行为/集成25项
- [旧发现/规则/API/Key/dispatcher45/45](s5-previous-45-green-2026-10-14.log)与[旧access/状态/来源事务20/20](s5-previous-20-green-2026-10-14.log)，隔离副本合计65/65
- [S4兼容集62/62](s5-s4-compatibility-green-2026-10-14.log)：当次45项非UI与17项UI；随后只有来源失效UI变更，定向UI重新18/18，未借前次聚合数字增加总成绩
- [旧打包安全专项2/2](s5-package-legacy-security-green-2026-10-14.log)及[负载无需原生的设置/结算2/2](s5-target-load-readonly-green-2026-10-14.log)；后者不是实际k6负载
- contracts/host、三个样例、两套reference与UI TypeScript编译通过；UI后续变更再做noEmit/Vite构建。git diff --check通过。

完整[check](s5-check-platform-blocked-2026-10-14.log)、[npm test](s5-test-platform-blocked-2026-10-14.log)、[workbench](s5-workbench-platform-blocked-2026-10-14.log)及[target-load](s5-target-load-platform-blocked-2026-10-14.log)各实际尝试一次，均在缺Windows仓颉SDK/cjc.exe前置中止。完整集成、浏览器与实际k6测试没有进入，不记通过，不反复尝试已知永久平台缺口，不改生产Windows互斥。

### 红测与接线记录

来源/纠正/API/负载初红[s5-reuse-red](s5-reuse-red-2026-10-14.log)，随后独立补[停用](s5-disabled-red-2026-10-14.log)、[调用者环境快照](s5-load-snapshot-red-2026-10-14.log)、[stale建议选择和默认范围](s5-selection-scope-red-2026-10-14.log)、[根目录不可核验历史](s5-history-root-red-2026-10-14.log)、[实际纠正UI](s5-correction-ui-red-2026-10-14.log)、[来源UI](s5-source-ui-red-2026-10-14.log)与[调度器](s5-runner-red-2026-10-14.log)和[完整来源专项枚举](s5-all-source-tests-red-2026-10-14.log)失败，再最小实现修绿。

打包缺功能[初红](s5-package-red-2026-10-14.log)、[路径](s5-package-path-red-2026-10-14.log)、[格式](s5-package-format-red-2026-10-14.log)和[安装copy竞态](s5-package-install-race-red-2026-10-14.log)均保留，最终10/10。完整链为既有真实链的新增集成覆盖，不伪称全部行为先红。

隔离启动曾缺显式Linux测试锁预加载和output/s1-source目录；只修测试副本初始化/调用，生产锁未改。旧API先44/45，失败因为默认全根范围下新增package/verification应失效；将“业务范围外补运行配置”测试明确设src/README，不放宽产品，随后45/45。target-load API并发子测生成的合成来源由旧projectId重绑为当前ID时，也同步其preparation.projectId以满足精确身份前置；实际k6子测本机仍未运行。

整链前两次受既有Linux上下文大小写接线影响，分别换成源码context和全小写临时根后通过。打包首次离线npm缓存路径ENOTCACHED，改用现有锁定缓存后实际安装/构建通过。这些接线失败单独保留，不计功能红；没有绕过拒绝访问或原生工具限制。所有本阶段完整工具日志另持久化，旧仓库证据、运行目录和ZIP均未覆盖。

## 最后仍待正式验收

1. 原生Windows仓颉1.0.5/stdx1.0.5.1编译及新增scheduler/verdict行为、跨进程互斥、完整check/test/interpreter/candidate/registry/replay。
2. Windows浏览器实际交互、取消/返回/重复点击与正式用户流程；本机已有Chromium限制，不记SSR为浏览器通过。
3. deepseek-flash真实源码理解和候选效果。实际调用需展示并确认发送范围；本阶段只调用合成本机确定性服务，没有外发真实源码/Key。
4. 实际人员业务核对与技术签字；测试身份不代签。
5. 真实缺陷网站修复后的同规则正式复测、业务/实际k6目标负载、另一Windows电脑兼容与正式运行交付。
6. 原T9尚未完成的实际验收/最终交付保持开放；T10正式同模型公平对照及命名审查未运行。

开发提交仅更新已授权统一分支fix/discovery-analysis-state，父基线c4a8e4ce53f735e251d4708dd549acb9af064c34；不合并main、不强推、不替换旧ZIP。源码开发目录也不是正式模板发布或真实运行交付。
