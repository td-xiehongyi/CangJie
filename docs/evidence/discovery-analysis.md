# S2 源码业务分析与项目特有检查推荐

日期：2026-10-14—15。范围：S1/D1实际复核及最小接口补齐；S2/D2、D3实现与离线验收。S3—S5、真实模型效果、正式交付及原T9/T10未完成，不据此关闭。

## S1 实际复核

- 实际构建当前contracts、host后，源码专项12/12通过；隔离副本中的旧access37/37通过。核对无verification.json/无启动入口的夹具、路径大小写/分隔符、链接/私有答案拒绝、UTF-8片段限额、源码变化和真实读取引用。
- S1原实现可用，没有发现需要改变架构的缺陷。为S2补充导出`validateScope`及`scopedSourceFiles`：目录摘要也须受确认范围限制，删除指向范围外文件的已解析路径。没有放宽原排除项或读取上限。
- 环境：Windows x64、Node24.19.0、npm11.17.0、TypeScript5.9.3、仓颉1.0.5/对应stdx、k6 2.3.0。项目根无磁盘AGENTS.md，按用户提供规则及Obsidian目录规则执行。

## 已实现

- 新`discovery/store.ts`与`service.ts`：会话校验和、原子写入、修订冲突、Windows跨进程互斥；持久化读取、动作轮次、响应、用量和停止原因。仅允许search/read/提交结果，不提供Shell，不启动或修改被分析网站。
- 先搜索，再按入口/服务/数据及权限关联请求片段；模型收到授权目录摘要和实际读取的原始片段。引用必须精确匹配宿主读取记录，并核对当前文件摘要、行号和片段摘要。伪造、未读、过期引用不能产生有效结果。
- 业务概览和项目特有建议可超出现有四类规则。分别显示源码事实、文档/项目测试/AI候选预期、AI风险、未决问题、操作与观察前提。所有预期均待确认；“聚焦”只保存界面选择，不创建项目规则或执行结果。
- 已读行区间、未读正文文件、排除/静态未解析问题及分析局限可查看。信息不足可返回`kind:insufficient`，保存partial和缺口；不为满足结果形状编造业务流程。
- 预算为每任务最多8次请求、10分钟墙钟时限、累计120000 token；单请求编码后98304字节，单片段8192字节、每轮最多4片段、累计发送源码片段196608字节。重复发送的正文也累计计数。每次网络请求前保存调用预留和审计；失败/取消未知用量仍保留。继续原任务不重置预算，过期后只能明确新建分析。
- 本地读取和发送同意分开。未确认范围不调用模型；范围或服务/模型变化需重新核对。项目测试默认排除，显式纳入后标记为已披露输入，不能再作为未见独立评估。工具私有答案永久排除。
- S1模式过滤之外，已知模型密钥在正文加入读取记录前、目录摘要/会话保存前及发送前拒绝。合法`token: string`代码保留原文以保持引用；过滤不是零秘密保证，用户仍需核对范围。
- 新API复用原本地会话认证；源码项目无需运行配置；以后导入运行配置保留projectId和分析记录。保留原业务、容量、候选验证、审核、模板、证据和复测路径。

## API与操作

主要改动文件：

- 契约与范围：`packages/contracts/discovery.ts`、`apps/host/src/discovery/access.ts`。
- 会话与模型：新增`discovery/store.ts`、`discovery/service.ts`；修改`model/context.ts`、`model/provider.ts`、`model/credentials.ts`。
- 宿主入口：新增`discovery/routes.ts`，最小接入`apps/host/src/api.ts`。
- 界面：新增`apps/ui/src/components/BusinessDiscovery.tsx`；修改`ProjectView.tsx`、`App.tsx`、`api/client.ts`、`components/WorkflowJourney.tsx`、`styles.css`。
- 测试：新增`tests/integration/discovery-session.test.mjs`、`discovery-api.test.mjs`、`tests/e2e/business-discovery.spec.ts`、`tests/support/discovery.mjs`、订单/会员两个源码夹具；`scripts/verify.mjs`纳入discovery/all。更新本证据、实施计划及Obsidian项目/INDEX。

1. 在项目接入输入源码目录，点击“读取源码并分析业务”，无需先启动网站或配置verification.json。
2. 查看读取与发送范围；保存允许/额外排除路径，需要项目测试时显式勾选并重新索引。核对目录摘要、模型服务和预算。
3. 在本机模型设置中配置服务、模型和密钥。只有获得外发授权后才勾选发送同意、点击“开始源码业务分析”。未配置/未确认时按钮禁用；本轮没有执行这一步的真实服务调用。
4. 查看进度、暂停或明确继续原任务。刷新/重连只取状态，不重放分析。双标签冲突保留本页输入，可加载新范围或明确保留重存。
5. 查看业务概览及建议；事实、候选预期、风险分别带引用按钮，可展开实际源码。源码变化后显示旧引用失效。聚焦某业务仍保持建议状态。

接口：`POST /api/source-projects`；`GET/POST /api/projects/:id/discovery-scope`；`POST /api/projects/:id/discovery`（scopeHash、confirmed、expectedRevision、requestId）；`GET /api/discovery/:id`；`POST pause/resume`（resume带revision）；`POST selection`仅草稿聚焦；`GET excerpts/:index`返回当前引用有效性。重复requestId不重复调用；旧修订号不能覆盖。

独立预览：[本机S2预览](http://127.0.0.1:4817/?page=project&project=bcf0a033-60d5-4ce5-8067-8006bbfb4ae4)，空模型/无Key，只索引受控订单材料；数据在`.local-data/s2-discovery-preview`，状态见`output/s2-discovery/preview-session.json`。此临时端口以状态文件为准。原4317宿主未重启，不能将它仍在运行的旧API当作S2已加载；下次正常重启主版本后才加载新宿主。没有替换正式包。

## 验证记录

所有模型响应来自127.0.0.1确定性模拟服务，无产品真实模型调用。

| 检查 | 实际结果/证据 |
| --- | --- |
| S1源码基础 | 12/12；`output/s2-discovery/logs/discovery-current.log` |
| 旧接入保护 | 37/37；`output/s2-discovery/regression-workspace/output/s2-discovery/logs/s1-access-recheck.log` |
| 最终会话专项 | 16/16；`output/s2-discovery/logs/session-final.log` |
| 修补前新增缺陷测试 | 服务2项、界面2项按预期失败；`review-red-unit.log`、`review-red-ui.log` |
| S2新增界面 | 6/6；`output/s2-discovery/logs/ui-final-6.log`；桌面/390px截图在`output/s2-discovery/screenshots/`，已查看 |
| 最终完整构建 | 通过；隔离副本`output/s2-discovery/logs/check-final.log` |
| 最终完整集成 | 298/298通过；隔离副本`output/s2-discovery/logs/all-final.log` |
| 最终完整Edge界面 | 29/29通过；隔离副本`output/s2-discovery/logs/full-ui-final.log` |

隔离副本位置：`output/s2-discovery/regression-workspace`。旧测试会生成历史证据，因此在该副本运行，不在原目录覆盖后再还原。原有未提交补丁和证据保留，基线在`output/s2-discovery/baseline.json`，最终字节核对另存`integrity.json`：356份基线文件字节相同，13份仅限本次授权修改，无缺失，历史证据全部相同，HEAD仍1281778。首轮整体295/295通过后，审查修补及新增断言导致最终重跑；最终结果以上表为准。

确定性测试覆盖跨文件读取、订单/会员差异、来源分类与冲突、实际发送字节、未知/越界动作、未读/伪造/过期引用、未确认范围、所有预算、暂停/重开、重复请求、修订冲突、信息不足、保存失败阻止网络、合法类型正文/已知密钥拒绝。它们证明编排、权限与契约；不会证明AI独立理解了订单或会员业务。

一次独立审查发现4项Important，无Critical：遗留draft显示永久活动、配置变更后恢复异步错误被吞、源码项目手动账号渲染异常、逐条预期/事实/风险引用无法展开。均先新增失败测试再修补。遗留draft/running无活动任务时显示可恢复暂停；保存失败显示原因且阻止发送；恢复先校验配置并返回明确错误；账号可选链补齐；每条依据可直接展开。新增引用测试曾误期待中文“库存”，实际README是英文；按真实原文更正断言，未修改产品或夹具来迎合测试。

## 未验证与限制

- `deepseek-flash`真实理解、建议质量、覆盖和业务正确性尚未验收；S2仅离线开发检查完成。无模型自动签署业务预期、可执行资格或通过结论。
- 索引为静态导航；动态/链式/别名、CommonJS及完整调用关系有限。已读片段不等于全文件/全仓理解；文档和项目测试本身也可能错误。
- 恢复/持久化有自动测试与代码审查；未进行断电、真实进程强杀及跨宿主多进程压力实验。会话数据损坏会拒绝读取，不能保证硬件故障恢复。仍需可信本地源码环境，不能宣称抵御恶意并发文件替换的OS沙箱。
- 同一任务时限包含暂停时间；预算耗尽后“继续”不会获得新额度。旧分析可按ID读取，新建后项目页展示最近分析；暂未增加历史分析列表。
- 其他电脑、新S2正式交付包兼容性、原实际双审核/业务负载/导出重开及T10仍未验收。

## 待用户确认的真实效果验收

尚未发送。建议仅用两份受控合成源码，各建1次分析，不含verification.json、Key、账号、数据库、工具私有测试或答案：

| 本地根目录（均在output/s2-discovery/real-acceptance/） | 拟允许发送的目录摘要及按需正文 | 原文大小 |
| --- | --- | --- |
| orders | README.md、src/routes.ts、src/orders.ts、src/storage.ts | 751字节 |
| memberships | README.md、src/memberships.ts | 321字节 |

服务：`https://api.deepseek.com/chat/completions`；模型：`deepseek-flash`。每任务上限按上述预设，两任务合计最多16次请求/240000 token/393216字节累计源码片段；编码输入每次最多98304字节，输出每次最多6000 token。金额未估算，没有查价格或发起调用；达到任一限制停止并保存部分结果。实际小夹具可能提前结束，不能预先保证效果或实际成本。文件摘要与未同意状态见`output/s2-discovery/real-acceptance/disclosure.json`。Key只在本机界面输入或既有Windows凭据读取，不在聊天索取。获得授权后再执行并独立记录成功或失败；未确认则保持待验收。

S3下一步只在另获授权后做D4正式项目规则预期确认/版本保存、D5能力与独立验证条件判断。当前不生成新规则执行资格，不进入S4执行或S5复用交付。
