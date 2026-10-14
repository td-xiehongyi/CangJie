# S4/D6 新性质可信执行链：开发证据

日期：2026-10-14。用户允许正式验收延期继续开发。本阶段仅受控合成工单关闭性质，不宣称任意业务通用；S5尚未实施。独立代码审查通过，无已知S4开发阻断；准确计数见末节。

## 实现边界

- 项目规则仍为项目UUID、规则UUID、版本及contentHash四字段引用。用户必须显式采用公开受控契约，关键预期和参数/角色/完整查询条件一并确认；自由业务规则仍可保存，未知语义不能按同名动作编译。
- 公开契约只含三条业务预期、create/query/update参数与观察要求、六个相等断言义务。编译器只接受冻结的语义及显式输入白名单；query.id/title/status/ownerId必须分别映射到真实items[0]同名字段，不许稳定ID冒充业务字段。HTTP200不是通过证据。
- 编译输入绑定确切项目规则、映射定义、运行根目录与实际源码摘要。编译在既有项目事务中复核当前runtime快照；注册不等于验证或发布。版本修订、项目/根/映射/源码变化拒绝继续使用旧绑定。
- 私有资源经单独版本与锁校验，动态suiteHash包含独立资源摘要、编译绑定摘要及可执行规则摘要。候选、准入、目标试运行、审核及包复跑均携带同一精确语义；资源、预置观察、缺陷控制与独立标签不发送给模型。
- 用户可在真实规则确认入口选择公开受控契约，再显式编译；生成、双重审核、运行沿用既有链。各项目公开可执行规则和catalog隔离。正式审核仍需实际人员，测试身份只写隔离测试注册表。

## 样例及独立资源

公开分析材料仅samples/status-ticket的源码、README公开需求与运行声明。私有tests/reference/status-transition、测试候选、预置观察、独立期望、历史私有资源和本机编译日志均不属于发现上下文；已有context/index保护阻止选中这些目录。

初始状态open，允许关闭至closed；随后重开请求应拒绝且仍closed。每个转换后的标题与归属均应不变。独立内存参考实现与SQLite目标样例分别实现业务，资源不从候选执行结果生成预期。

活动资源status-transition-reference-v1.1.0，canonical rule版本1，开发/留出各五个控制：正常、允许重开、归属改变、查询不完整、关闭中间态暂改标题/归属后拒绝重开时恢复。共10控制，观察及真实本机HTTP各执行一次，共20阶段结果。六个义务均只有eq表达式：closed-status、remains-closed、unchanged-title、unchanged-owner、closed-unchanged-title、closed-unchanged-owner。

审查发现旧四义务只比较最终与初始，暂改恢复会全部通过。先保留v1.0.0全部原字节/原锁与SHA，再添加独立缺陷红测；新增两项关闭中间态义务后修绿。旧候选在新增独立资源中不准入，而不是悄悄补强后仍借旧验证标签。旧/新摘要及变动原因见[s4-invariant-resource-hashes-2026-10-14.json](s4-invariant-resource-hashes-2026-10-14.json)，红绿日志分别保留。历史资料仍为工具私有，不进入普通交付或模型输入。

## 核心最小改动及限制

仓颉scheduler仅在明确expectedAcceptance=rejected、实际accepted，而且原有传输、身份、完整性、证据及单调时限检查全部可靠时，输出EXPECTED_REJECTION_VIOLATED；verdict将此已证请求接受违约记fail。查询不足、身份不明、迟到、运输错误仍inconclusive；既有默认expected accepted却收到rejected的保存语义仍inconclusive。此时整项check的断言因步骤前提违约均fail，不代表逐个字段都已证明发生改变。

没有增加脚本或表达式运算符，没有修改Windows生产互斥，没有假造核心可执行文件。本机缺Windows仓颉SDK/cjc.exe，原生新增契约测试及完整check/test、interpreter/candidate/registry/replay专项均未通过实际核心验证；不因TypeScript测试模型通过就宣称仓颉实测。schema无需协议新字段；新增reasonCode为字符串兼容扩展。

## 测试口径与复跑

CANGJIE_TEST_MUTEX=1只替代Windows OS互斥。tests/support/status-transition-core-model与admission-model为显式测试专用协议模型，版本test-only-model，不读独立标签；生产核心没有替身开关。生产仓颉注册表只认可其本身版本，测试模型发布不能充当正式资格。

开发主链使用真实宿主持久化、受控复制、合成初始化、认证、HTTP映射、证据文件、独立标签匹配及包导出/读取；只替代仓颉进程和确定性模型服务。审核身份test-only-business/test-only-tech，只存在每项测试的隔离注册表。API的候选/运行调度测试另有明示method seam，不据此宣称目标执行；实际HTTP全链由discovered-rule-execution与status-transition-validation证明。

可复跑：

- npm run build:contracts && npm run build:host && npm run build:sample && npm run check:reference && npm run build:ui
- CANGJIE_TEST_MUTEX=1 npm run test:discovered-rule
- 原生S4全链续验：在Windows设置CANGJIE_NATIVE_S4=1，清除CANGJIE_TEST_MUTEX，再运行 node --experimental-test-module-mocks --test tests/integration/discovered-rule-execution.test.mjs。此分支不替代核心，断言实际interpreterVersion=1.0.0；本机未尝试，不能记为通过。
- 原生Windows工具链恢复后：npm run check、npm test以及npm run verify -- interpreter/candidate/registry/replay（分别运行）；浏览器交互与正式人员审核另验。

已知记录：最初compiler缺功能红测；全链最初暴露interpreterVersion固定绑定，再按实际validateTemplate返回绑定；项目身份/运行事务、schema样式参数、暂改恢复、真实UI确认请求、审核发布runtime快照均保留先红后绿。两次Linux大小写上下文路径、请求payload.input定位、隔离回归预加载mock冲突/输出目录缺失属于测试接线错误，日志独立保留，不能算期望行为红测。重冻结期间资源锁暂时不一致时编译正确阻断，记录为transient，不称通过。

旧回归在另一个小写临时隔离副本运行，原历史output、ZIP及证据不覆盖。历史S1/S2/S3成绩不替代本次检查。

## 未验收项与下一阶段

- deepseek-flash真实生成/源码理解效果、任何真实源码/密钥外发：未调用，仍需实际发送范围确认。
- 原生Windows跨进程互斥、仓颉编译/运行及浏览器交互：延期未验证。
- 实际人员业务确认与技术签字：延期未验证，模拟身份不替代。
- 真实缺陷网站修复后的正式复测：未实施；开发控制缺陷/恢复正常与同一六义务的20阶段比对只证明受控资源和宿主链。
- 普通新交付目录/资源安装后的跨目录复跑、旧包兼容、未知版本策略、通用变化失效、负载资格衔接及交付说明归S5；本阶段包复跑只在已绑定隔离环境完成。

最小交付关联只增加公共status-transition.ts到契约源码清单，防普通构建缺公共依赖；未把私有答案加入普通包，也不宣称D8交付完成。

## 最终开发检查与独立审查

- 最后隔离副本执行 CANGJIE_TEST_MUTEX=1 npm run test:discovered-rule：61/61通过（编译/完整链10、真实HTTP样例14、双阶段验证8、API12、实际事件处理器/SSR纯UI16、调度器1），见[s4-final-focused-green-2026-10-14.log](s4-final-focused-green-2026-10-14.log)。独立审查者最新同六文件61/61通过，并确认上述四类阻断已修；不是原生仓颉或浏览器成绩。
- 最后旧回归在另一小写临时副本分两组避免重复mock预加载：45/45（S3存储/API/readiness及旧发现会话/API/Key和dispatcher），20/20（源码access12、分析状态屏障6、S3来源事务2），共65/65。见[s4-final-previous-45-green-2026-10-14.log](s4-final-previous-45-green-2026-10-14.log)与[s4-final-previous-20-green-2026-10-14.log](s4-final-previous-20-green-2026-10-14.log)。生产Windows锁未改。
- contracts/host、三个样例、旧/新reference TypeScript与UI构建通过；UI后续入口修补后的noEmit/Vite亦通过。git diff --check通过。
- npm test实跑在缺Cangjie SDK前置中止，完整核心/浏览器套件未运行；见[s4-full-project-platform-blocked-2026-10-14.log](s4-full-project-platform-blocked-2026-10-14.log)。已知平台缺口不作无限重试。
- S3/state已发布证据正文逐份仍相同；历史输出/ZIP不覆盖。发布按统一分支d140e56432357c386897cdf983eb91a24a2ce582为父提交核对增量，不合并main、不强推。
