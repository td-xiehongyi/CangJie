# 源码业务分析与项目特有检查分阶段实施计划

> **For agentic workers:** 用户于2026-10-14先授权状态修复与统一分支同步，随后明确“请继续后续的开发，验收部分可以先跳过”。据此S3可在正式验收延期状态下开发，不能将延期项目记为通过。S3阶段结束仍需开发回归、独立审查并单独同步，再由后续任务按阶段推进S4/S5。真实模型调用与源码外发、实际人员审核、正式运行和交付仍须对应授权；不自动合并main、不强推、不覆盖历史改动与证据。

**Goal:** 从JS/TS网站源码生成带引用的业务概览和项目特有检查，确认后保存项目规则，并使一条超出现有种子语义的新业务进入可信执行与复测。

**Architecture:** 在现有TypeScript宿主增加独立源码索引、受控读取、业务分析及项目规则服务，保留仓颉核心、HTTP执行与候选准入。先打通只读分析与推荐，再衔接运行；分析会话、项目规则和实验运行分别持久化，通过来源及版本引用关联。

**Tech Stack:** Windows、Node.js 24、TypeScript、React/Vite、现有仓颉与JSONL、JSON/JSONL证据；JS/TS/JSX/TSX使用TypeScript编译器API建立静态索引，不新增数据库、向量服务或Agent框架。

**Spec:** [需求v0.44](../../业务与容量验证系统需求与设计讨论稿.md) R53—R60；[源码分析设计](../specs/2026-10-14-code-grounded-business-discovery.md)；[总体架构](../specs/2026-10-14-extensible-verification-architecture.md)。

版本：1.6；状态：S1/D1、S2/D2—D3与S3/D4—D5已开发实现。S3新增后端及runner、身份事务20项，前状态7项、旧四专项38项和4项无浏览器UI检查通过，均按明确Linux OS互斥替身口径，不是原生Windows验收。7项浏览器交互在Chromium启动时受阻，完整check/test因缺仓颉SDK未完成。真实候选与源码分析效果、原生Windows及正式人员审核延期未验证。S4/D6受控合成状态性质开发链已实现，独立审查通过，新增专项61/61、旧隔离回归65/65；S5尚未实施。正式仓颉、真实模型、人工审核和真实修复复测延期未验证，不据测试替身关闭验收。用户允许跳过正式验收继续开发，仍按阶段审查与同步。详见[项目规则证据](../../evidence/project-rules.md)、[状态修复](../../evidence/discovery-state-fix-2026-10-14.md)及保留的历史证据。

## Global Constraints

- 分析无需verification.json、网站启动或测试账号；实际执行仍须满足已有隔离、初始化、认证和取证要求。
- 源码事实、文档/项目测试预期、AI推断、用户确认规则分开；一次正式运行只包含一条主流程。
- 新规则必须具有独立正常、缺陷、证据不足验证及项目试运行；不能借旧规则验证通过标签放行。
- 只读业务发现不得运行被测项目、安装其依赖或自动修改源码；原目录和已有未提交工作全部保留。
- 云端分析须先确认目录摘要与正文读取范围；分析日志不保存密钥。工具私有答案永不作为模型材料；项目测试显式选择后可读，但不能再算留出评估。
- 沿用deepseek-flash的既定用户选择作为后续真实验收模型，产品不硬编码默认；真实调用前展示实际范围并取得确认，不在聊天索取密钥。
- 新预算参数为待验收技术预设：每次分析最多8次模型请求、10分钟、累计120000 token，每次请求编码后不超过98304字节；与既有预算保持上限一致。每次读片段最多8192字节、每轮最多4片段、累计发送源码片段不超过196608字节；单文件原文超过65536字节只允许按片段读取，不能整份发送。记录实际请求字节、累计片段字节和token，任何一项到限均保存部分结果并暂停。
- 用户恢复中断分析不重置累计预算；重新分析显式创建新会话。既有候选生成最多两轮自动修订等限制不随发现阶段扩展。
- 旧运行、模板和包保持可读；新功能不能静默升级旧规则、自动重放操作或解除旧负载前置条件。
- 本计划不包含命名检查、独立经验平台、通用浏览器执行、任意语言/框架适配及自动修复代码。

## Review Focus

1. 无verification.json且网站无法启动：S1索引和S2分析仍可用，S3准确显示执行缺口。
2. 越界路径、符号链接、私有答案及源码内诱导外发指令：S1/S2测试必须阻止读取越权，不能由模型改变权限。
3. 分析中代码变化、伪造行号或只检索未读正文：S1/S2拒绝无效引用，展示不完整覆盖。
4. 实现本身违反需求或项目测试也写错：S2/S3保留事实与预期冲突，不能自动确认。
5. 重启、多标签修改、规则版本变化与旧包复跑：S3/S5保护草稿和历史，过期确认不能执行。

## 阶段交付与停止点

| 阶段 | 任务 | 用户可得到的结果 | 停止点 |
| --- | --- | --- | --- |
| S1 源码基础 | D1 | 无需启动网站的源码索引、可核对片段与权限范围 | 只读基础完成，不调用真实模型 |
| S2 业务分析 | D2、D3 | 有源码依据的业务概览和项目特有检查建议，显示未读范围 | 不执行建议，不宣称业务正确 |
| S3 项目规则 | D4、D5 | 确认关键预期、保存新规则、明确能否执行 | 没有独立验证资源的新规则保持待验证 |
| S4 新业务闭环 | D6 | 一条种子语义外的规则经独立验证、实际执行、修复后复测 | 结论限该样例；不宣称任意业务通用 |
| S5 复用与交付衔接 | D7、D8 | 变化失效、纠正记录、历史兼容、旧链回归与交付说明 | 不自动发布、推送或开始T10正式对照 |

依赖：D1→D2→D3→D4→D5→D6→D7→D8。每阶段只执行用户授权范围，完成后交付证据并停止，不自动跨阶段。不开日历工期承诺；获准实施时核对本机环境、现有修改、人工投入和材料窗口。

## 文件与接口约定

以下接口按阶段新增；S1源码相关契约、index/access与S2会话、API/UI已实现；S3项目规则与准备状态接口已实现；S4执行编译及独立资源桥已实现；S5通用复用/交付衔接尚未实现。只拆与本主线直接相关的责任，不整体重写api.ts。

| 文件 | 责任 |
| --- | --- |
| `packages/contracts/discovery.ts` | 源码快照、片段、分析、建议与项目规则类型及运行时校验 |
| `apps/host/src/discovery/index.ts` | 文件清单、语法/符号/导入与可识别路由索引 |
| `apps/host/src/discovery/access.ts` | 分析范围、查询、片段读取、来源校验 |
| `apps/host/src/discovery/store.ts` | 分析会话原子保存、修订号、恢复和版本检查 |
| `apps/host/src/discovery/service.ts` | 多轮读取与分析协调、预算、引用核对及业务结果 |
| `apps/host/src/discovery/routes.ts` | 受原宿主会话认证保护的源码分析API |
| `apps/host/src/rules/store.ts` | 项目规则版本、确认、撤销及纠正记录 |
| `apps/host/src/rules/readiness.ts` | 规则语义、映射、观察及独立验证能力判定 |
| `apps/ui/src/components/BusinessDiscovery.tsx` | 分析范围、业务概览、建议和引用详情 |
| `apps/ui/src/components/ProjectRuleCard.tsx` | 预期核对、能力状态与新规则选择 |

共享最小数据契约：

- SourceSnapshot：id、projectId、root、sourceHash、files（path/hash/bytes/language）、indexIssues；只记录纳入索引范围的文件。
- SourceRef：snapshotId、path、fileHash、startLine、endLine、excerptHash；必须命中已实际读取片段。
- AnalysisScope：projectId、允许目录/文件、排除范围、includeProjectTests、serviceUrl、scopeHash、confirmedAt；范围确认覆盖目录摘要及按需正文，不含密钥。
- DiscoverySession：id、revision、snapshotId、scopeHash、status、budget、reads、result、unresolved；status为draft/running/partial/completed/paused/stale/failed。
- BusinessSuggestion：id、flow、facts、expectations、risks、openQuestions、sourceRefs、priorityReason、operationNeeds、observationNeeds。facts为代码事实；expectations包含来源类别，不自动成为confirmed。
- ProjectRuleVersion：projectId、id、version、contentHash、suggestionRef、sourceRefs、expectedBehavior、confirmation、corrections；业务RuleContract只在可表达时单独生成，不抹去原业务语义。
- RuleReadiness：ruleRef、status、missing、matchedTemplateRef；status为reusable/generatable/needs_conditions/needs_capability。缺独立验证资源时列为needs_conditions，不允许发布。

错误码至少区分PATH_ESCAPE、SENSITIVE_FILE、STALE_SOURCE、INVALID_SOURCE_REF、ANALYSIS_BUDGET_EXHAUSTED、ANALYSIS_CONFLICT、RULE_REVISION_CONFLICT、RULE_CAPABILITY_GAP和VALIDATION_RESOURCE_GAP。UI给出中文原因与恢复动作，原码放详情。

## 验证命令与证据口径

各任务新增测试使用现有node:test风格，从构建后的host/dist导入。独立验证步骤先运行`npm run build:contracts`及`npm run build:host`，再执行任务指定的`node --test`命令。新增契约须纳入contracts包导出；宿主使用编译器API时，核对交付包包含TypeScript运行依赖，不能只凭开发环境可用判为可交付。

先添加行为断言并运行确认因缺功能失败，再实现最小改动、重跑通过；不得把路径错误或缺依赖当预期失败。每任务最后记录修改、检查结果与限制，未经另行授权不提交。新测试纳入scripts/verify.mjs的discovery组及all组，D8运行全套；真实模型与人工审核证据独立记录。

## S1 源码基础

### D1 独立源码快照与受控片段读取

文件：新增contracts/discovery.ts、discovery/index.ts、access.ts；修改contracts/package.json导出及`projects/inspect.ts`的共享读取部分；新增`tests/integration/discovery-access.test.mjs`、`tests/fixtures/discovery-source/`。旧业务inspectProject行为保持。

接口：buildSourceSnapshot(root,projectId)→SourceSnapshot；searchSource(snapshot,scope,query,limit)→匹配位置列表；readExcerpt(snapshot,scope,path,startLine,endLine)→正文及SourceRef；validateSourceRefs(snapshot,reads,refs)→有效/问题列表。查询limit上限20，读取按前述8192字节上限，越限返回可缩小范围的错误。

- [x] 添加断言：无verification.json的TS/TSX夹具可索引；缺运行入口不影响读取；忽略依赖和构建目录；语法错误作为indexIssues；动态路由标未解析，不捏造路由。
- [x] 添加断言：Windows路径大小写/分隔符归一化不允许越界；符号链接、未授权目录及工具私有答案被拒；修改文件后旧SourceRef失效；多字节中文不按字符数误算字节上限。
- [x] 运行`node --test tests/integration/discovery-access.test.mjs`，确认新增行为失败后实现文件与接口。
- [x] 编译contracts和host后重跑，所有上述断言通过；运行`npm run verify -- access`确认旧运行准备保护未退化。
- [x] 写入`docs/evidence/discovery-source.md`，列索引支持范围、拒绝原因及未解析关系；阶段停止。

S1历史验收结果：源码专项12/12，旧access37/37，`npm run check`完整构建通过，当次最终`npm test`276/276；生产依赖全新目录中的索引/TSX读取/引用核验通过。首轮故障、测试定位器最小同步、静态关系限制与历史字节保留核对均见证据文档。这些计数仅代表对应历史运行，不替代最新状态回归。S1只提供宿主基础接口，界面入口及业务分析归S2；未调用真实模型、不外发源码、不关闭旧T9/T10。S1交付时停止并等待授权；之后另获S2授权，当前结果以下节为准。

实施说明（2026-10-14）：新增`createAnalysisScope`构造本地读取边界，快照可选`includeProjectTests`且默认排除项目测试；这不是云端发送同意。片段返回`{text,bytes,ref}`，引用只匹配宿主实际读取日志的精确行区间，LF归一化后计算片段摘要。单文件2MiB及总计10000文件/64MiB为本地索引防失控上限，达到时明确报告缺口。每轮4片段/累计196608字节及模型预算由S2/D2会话实现，不在无状态读取接口伪装为已落实。

最小关联调整：contracts的tsconfig需纳入新模块；TypeScript编译器API改为宿主运行依赖并更新锁文件；现有打包器硬编码契约源码清单，因此同步新增discovery.ts及交付构建include。只是S1接口可构建/生产运行的必要兼容，不代表D8已实施。原业务inspect的清单策略、运行门槛和历史摘要保持；共享读取补齐大小/链接/文件身份核对。

## S2 业务分析

### D2 有预算和来源审计的业务发现会话

文件：新增discovery/store.ts、service.ts；修改model/provider.ts、model/context.ts以区分discovery用途，保留原proposal/candidate；新增`tests/integration/discovery-session.test.mjs`及确定性响应夹具。

接口：createDiscovery(snapshot,scope)→DiscoverySession；runDiscovery(id,expectedRevision)→DiscoverySession；pauseDiscovery(id)→DiscoverySession；getDiscovery(id)→DiscoverySession。每次模型输出只能是请求search/read动作或提交BusinessSuggestion结果；宿主执行允许动作后追加下一轮，不提供Shell工具。通过现有JSON输出请求实现，不以模型支持原生工具调用为前提。

- [x] 测试“查路由→读服务→读数据/权限→提交建议”的跨文件对话，断言实际发送片段和SourceRef一致；模型伪造引用、未读正文引用、改授权或要求执行命令均不能通过。
- [x] 测试8次请求、单请求98304字节、累计片段196608字节、10分钟/token预算分别耗尽；保存partial/paused及原因，不写completed；中断恢复不重置预算、不重复已记录调用。
- [x] 测试事实与预期冲突保留、项目测试被标为输入、源码中途变化标stale、写入失败阻止网络请求、同一revision重复启动不重复调用。
- [x] 运行`node --test tests/integration/discovery-session.test.mjs`确认缺行为，再实现；编译后重跑通过。暂停不能留下无人管理的请求：取消尚未发出的轮次，对在途请求明确记录结果或未知用量。
- [x] 记录`docs/evidence/discovery-analysis.md`的确定性证据；这些测试证明编排和契约，不证明真实模型理解能力。

### D3 业务概览与推荐的用户入口

文件：新增discovery/routes.ts、BusinessDiscovery.tsx；修改api.ts、ProjectView.tsx、App.tsx及api/client.ts；新增`tests/integration/discovery-api.test.mjs`、`tests/e2e/business-discovery.spec.ts`。

接口：POST `/api/source-projects`识别源码；POST `/api/projects/:id/discovery`创建确认范围后的任务；GET `/api/discovery/:id`读取；POST `/api/discovery/:id/pause`停止；POST `/api/discovery/:id/resume`带revision继续。复用现有本机会话认证，响应不暴露密钥；旧`/api/projects`运行接入保持兼容，正式运行前仍需完成运行资料。

- [x] API测试无运行配置可建源码项目，未确认范围不能启动模型；读状态不触发调用；暂停/重连不自动分析；导入业务配置后项目身份和分析引用保持。
- [x] 浏览器测试选择源码→查看发送范围→分析→业务概览→展开真实引用→选择一条业务；覆盖partial、失败重试、多标签草稿冲突、设置返回及窄屏不遮挡主操作。
- [x] 完成UI与API后编译，运行`node --test tests/integration/discovery-api.test.mjs`及`npx playwright test tests/e2e/business-discovery.spec.ts`，历史离线检查全部通过；推送前API回归曾出现失败，本轮本地修复与原生续验限制见下方当前状态。
- [ ] 用户授权真实调用时，以deepseek-flash在未提供verification.json的受控项目上分析；要求实际涉及入口、服务与数据/权限相关文件，引用逐项可回查，存在项目特有建议和诚实缺口；失败如实保留。未经外发确认仅交付确定性结果，S2真实效果未验收。
- [x] 更新分析证据并停止，建议列表不能显示“业务已通过”。

历史离线验收（见discovery-analysis.md）：S1源码12/12、旧access37/37；S2会话16/16、API6/6，新界面6/6。当次完整构建通过，npm test298/298、Edge完整29/29通过；旧回归在隔离副本生成证据，原历史文件未覆盖。一次独立审查的4项Important已先红后绿修补：中断draft恢复、配置变化恢复提示、手动账号接入、逐条依据展开。S1最小补齐validateScope/scopedSourceFiles；S2额外修改credentials作已知Key拒绝、WorkflowJourney/styles作源码入口适配、verify纳入新增测试，均为D2/D3必要衔接。上述通过记录仅证明对应版本的离线检查，不证明真实模型效果或当前全绿。

推送前状态（remote-push-2026-10-15.md，修复前）：源码分析access/session/API与model-key-validation专项38项中36项通过、2项失败，表现为结果意外paused和修改模型配置遇到MODEL_WORK_ACTIVE；独立API复测6项中4项通过、2项失败，运行配置导入和模型配置切换均遇到MODEL_WORK_ACTIVE。该次沙箱外完整构建通过，但未重跑完整集成或浏览器套件。分析持久状态与后台任务结束时序须先修复并补回归，不能由历史298/298或29/29推出当前全部通过。

本轮状态修复：持久running读取与任务结束竞争、终态保存与互斥释放竞争及恢复注册窗口已新增确定性屏障回归并最小修复。7项新增回归通过；四份专项在明确OS互斥替身下38/38通过。Linux正式check/test因缺仓颉Windows工具链中止，UI尝试被浏览器启动限制阻断；均不记原生Windows通过。原历史证据未覆盖，详见[本轮修复与续验命令](../../evidence/discovery-state-fix-2026-10-14.md)。

S2已有分析模型响应为本机确定性模拟；两份合成源码的真实发送清单、服务及预算已准备，历史证据记录未同意、未发送。真实候选与源码分析效果仍待实际验收，真实效果复选框保持未完成。最新授权允许上述正式验收延期未验证、继续阶段开发；S3已推进项目规则准备，但没有运行新规则。按阶段审查与同步后再交后续S4/S5任务，不关闭原T9/T10。

## S3 项目规则

### D4 项目内规则确认与版本库

文件：新增rules/store.ts、ProjectRuleCard.tsx；修改contracts/discovery.ts、api.ts、projects/workflow.ts、VerifyView.tsx；新增`tests/integration/project-rules.test.mjs`、`tests/e2e/project-rules.spec.ts`。

接口：confirmProjectRule(projectId,suggestion,answers,expectedRevision)→ProjectRuleVersion；getProjectRule(projectId,id,version)→ProjectRuleVersion；reviseProjectRule(ref,changes,expectedRevision)→新版本。未决答案不生成已确认规则；修改语义保留旧版本并清除受影响确认。

- [x] 测试规则不在既有公共目录仍可保存和被选择；不同项目规则不可串用；双标签revision冲突不覆盖；用户改预期后旧计划失效；未回答关键问题保持待确认。
- [x] 测试源码事实“任何人可修改”与需求“仅所有者”冲突时，AI不得自动选实现为正确答案；人工纠正存为追加记录。
- [x] 规则与API先红后绿，编译与开发回归通过；测试来源合并、同项目共用事务锁及并发切换目录。
- [ ] 原生Windows `node --test tests/integration/project-rules.test.mjs`与浏览器交互续验；4项无浏览器检查已通过，7项浏览器在启动时受阻，未进入页面。
- [x] 写`docs/evidence/project-rules.md`：显示规则来源、用户确认及版本；不宣称已执行新规则。

### D5 规则能力和验证资格分级

文件：新增rules/readiness.ts；修改model/proposal.ts、validation/review.ts及VerifyView.tsx；新增`tests/integration/rule-readiness.test.mjs`。

接口：assessRule(ruleVersion,projectCapabilities,templateCatalog,validationCatalog)→RuleReadiness。匹配语义和精确版本，检查动作、角色、参数、可观察字段、断言表达能力、验证资源；有接口但无可靠查询证据不能判可执行。

- [x] 测试四种准备状态及理由；新业务不同语义不能仅按同名动作匹配旧模板；缺私有独立验证资源返回VALIDATION_RESOURCE_GAP；缺查询不能用HTTP200替代断言。
- [x] 先运行`node --test tests/integration/rule-readiness.test.mjs`确认失败，实现接口和UI后编译重跑。
- [x] UI区分“可生成”与“已有合格方案”，显示未选/受阻范围；S3验收不启动任何无资格规则。记录证据并停止。

## S4 新业务闭环

### D6 一条新性质进入可信执行链

文件：新增`samples/status-ticket/`受控样例、`tests/reference/status-transition/`私有验证资源、`tests/integration/discovered-rule-execution.test.mjs`；修改samples构建入口、contracts/schema.json、execution/mapping.ts、model/proposal.ts、validation/reference-runner.ts、model/target-trial.ts、replay.ts、api.ts、templates/store.ts中确需支持动态规则的部分。仓颉contracts/interpreter/admission/registry只在协议和资格衔接确有需要时最小调整。

冻结验收性质：工单允许open→closed，closed后再请求open应被拒且状态仍为closed；标题和归属保持。此为受控样例需求，不推广到用户所有工单。使用create/query/update动作及相等断言，不引入新比较运算符；字段由显式映射白名单声明，扩展目前只支持title的参数假设，不能执行任意脚本。

接口：compileRulePlan(ruleVersion,mapping,capabilities)→候选输入或明确缺口；resolveValidationSuite(ruleRef)→版本化受控验证资源引用。规则可动态存储，但验证资源仍由开发者建立和独立审核，不能让模型自动给任意规则签发资格。

- [x] 冻结公开样例契约与独立正常、允许重开、错误归属、查询不完整变体；审查后新增关闭中间态暂改再恢复变体，私有历史原字节保留。10个控制、六项eq义务，资源不进入发现上下文。
- [x] 开发测试以新项目ruleId从明确确认到编译、候选、独立20阶段匹配、准入、隔离测试身份审核、真实本机HTTP执行及同环境包复跑贯通；缺资源/语义/观察/身份/映射/版本受阻。仓颉和OS锁使用明示测试模型，不计原生或正式审核通过。
- [x] compiler、候选链、参数、事务及实际UI确认缺口先失败回归再最小实现；新增专项纳入discovery/all调度。
- [ ] 原生Windows `npm run verify -- interpreter/candidate/registry/replay`各专项续验；本机完整test在缺仓颉SDK前置中止，不反复尝试同一永久缺口。
- [ ] 真实模型生成只在用户确认发送范围后执行；正常、缺陷和证据不足记录均保留，实际人工审核不能由测试身份替代。再执行缺陷版与修复版复测，证明原规则未被弱化。
- [x] 保存`docs/evidence/discovered-rule-execution.md`及红绿/平台/独立资源变动记录，新增61/61及旧隔离65/65、独立审查无阻断。仅记开发检查完成，不写原生/真实模型/人工/真实修复验收通过；停止于S4。

## S5 复用与交付衔接

### D7 变化失效与本项目纠正记录

文件：修改discovery/store.ts、rules/store.ts、projects/workflow.ts、load/runner.ts相关资格桥接；新增`tests/integration/discovery-reuse.test.mjs`。

接口：reconcileDiscovery(session,newSnapshot)→旧来源有效性与需重新分析项；appendRuleCorrection(ruleRef,note,expectedRevision)→处理记录。初版按所选业务保守失效，不能声称具备精确全仓依赖增量分析。

- [ ] 测试代码变化后旧来源/确认失效、旧报告可读；未变化分析可查看但运行环境仍重新核对；规则纠正不改历史；停用方案不再执行；源码变化后原负载资格不被错误沿用。
- [ ] 运行`node --test tests/integration/discovery-reuse.test.mjs`确认缺行为，实现后编译重跑；`npm run verify -- target-load`通过。
- [ ] 保存证据，记录仅本项目纠正与来源复用；不新增独立经验库或跨项目推广。

### D8 兼容回归与交付状态

文件：修改manifest.ts的必要版本兼容、scripts/verify.mjs、scripts/package.mjs和交付说明；新增`tests/integration/discovery-package.test.mjs`；更新README和本计划检查状态。

- [ ] 测试v1旧包原样读取、未知新版本拒绝执行、缺适配器/工具可查看不可复跑、包中不含Key或私有评估答案；索引运行依赖在普通交付中可用，私有独立资源仍单独交付。
- [ ] 将所有本计划新增集成测试加入discovery和all组，不能因测试文件存在就假定npm test覆盖它们。
- [ ] 编译后运行`node --test tests/integration/discovery-package.test.mjs`，再运行`npm run check`、`npm test`、`npm run verify -- workbench`；执行一次全套，只有失败或新变更才重跑相关范围。
- [ ] 在新测试数据目录完成“无运行配置分析→确认新规则→补运行配置→方案验证→运行→导出→重开”交付检查；不覆盖4317正式数据和旧ZIP。
- [ ] 形成`docs/evidence/discovery-release.md`，逐项列已完成、未验证和与旧T9/T10的关系；没有实际完成人工审核、正式交付或对照时保持原待办。

## 原任务承接与审阅

本计划使用D1—D8编号，不重命名或勾选旧T0—T10。旧主版本功能保留；旧T9实际审核、业务/负载、导出重开及最终交付按各自证据关闭；T10仍在相关前置验收之后，若用于对比新增能力须先冻结新版本和公平输入条件。研发阶段的回归检查不等于这些正式验收。

S1—S3可以先交付只读分析和推荐，但必须标注新规则尚未实际验证。若剩余时间不足，暂停于已验收阶段并说明未交付能力，不以降低准入标准换取完整流程。计划审阅后仍需用户明确授权具体阶段才能实施。

## 文档自审结果

R53→D2/D3；R54→D1/D2；R55→D2/D4；R56→D4/D5/D6；R57→D1/D3；R58→D5/D6；R59→D4/D7；R60→阶段停止点/D8。五项Review Focus均有对应测试任务。预算、规则版本与引用契约集中定义，后续任务复用；D1—D3已实现且保留历史验收记录，本地状态回归已修复，原生Windows完整续验和D3真实模型效果待验收。D4/D5开发实现与离线回归已完成，正式验收延期未验证；D6受控开发链已实现，独立审查和最终开发回归通过；D7—D8未实施。最新授权允许按阶段继续开发，S3审查同步后再推进S4/S5；不把跳过的验收勾为完成。
