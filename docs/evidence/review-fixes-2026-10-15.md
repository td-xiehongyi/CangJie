# R1/R2 当前会话修复

日期：2026-10-15；修复父提交：13cfc0b75565c39dcb3a3ee834e878f0356cdec9；统一分支：fix/discovery-analysis-state。用户明确授权修复原审查两项问题，并要求当前会话执行、不开子智能体；本轮未委派其他智能体。

## 实现变更

### R1：运行中源码集合变化

`apps/host/src/discovery/service.ts`在每轮响应处理前、下一次provider调用前、最终结果引用校验后重建选中范围，比较文件集合/摘要/索引缺口。检测到变化保存stale及referencesValid=false，不再发送后续调用，也不把过期最终响应保存为completed。即使尚未读取任何正文，源码失效也明确记stale，不记一般failed。已有读取、模型用量和审计记录保留，恢复仍拒绝旧快照。

这不是持续文件监听或原子文件系统快照。已发请求不能撤回，检查后仍存在文件再次变化的时间窗；公开读取及确认/编译/运行门槛继续做来源核验。不能写“任意变化零延迟中止”或“并发修改绝不可能”。

新增`tests/integration/discovery-live-source.test.mjs`六项：首次请求期间新增、删除、改名、修改；最终结果请求期间新增；显式范围外新增不影响已选业务。前五项修复前失败，范围外对照原本通过。回归已接入discovery/all；聚合900秒及原生核心前置保留。

### R2：交付环境元数据

`scripts/package.mjs`将dependencies.node/npm改为24.x/11.x依赖要求，删除固定历史verified文本。普通包、源码开发包及开发者资源包新增packagingEnvironment，记录实际打包Node版本、platform、arch。打包器未调用/探测npm，明确记录npm.version=null、status=not-probed，不推测或执行环境变量指定的npm程序。这是打包进程来源记录，不是安装/运行环境验证；platform原目标win32-x64不等于打包主机platform。

新增打包测试检查依赖约束、实际进程值、npm未知状态及两类包一致性。旧包和历史清单不重写，旧v1兼容读取保持；源码包仍coreBuilt=false，不制造原生核心。

## 红绿证据

- [R1与调度器先红](review-r1-red-2026-10-15.log)：7项中1通过、6失败（5项行为缺口及1项未接入调度器）。
- [R2先红](review-r2-red-2026-10-15.log)：1项失败，固定verified字符串与期望依赖约束不符。
- [R1与调度器转绿](review-r1-green-2026-10-15.log)：7/7。
- [R2转绿](review-r2-green-2026-10-15.log)：1/1。
- [最终integration组](review-integration-green-2026-10-15.log)：67/67；与下面unit组为不同用例，本轮最终复测合计97/97。
- [最终unit组](review-unit-green-2026-10-15.log)：30/30，含原状态竞态、项目规则来源事务及UI逻辑；未统一预加载重复OS锁mock。

以上定向数字与最终组重叠，不相加成不同用例总数。原审查的缺陷复现脚本保留为13cfc0b历史基线的错误行为断言，不在修复后的功能回归中运行，也不算通过。

## 执行条件与限制

Linux、Node24.19.0、npm11.9.0。宿主TypeScript重新编译通过。集成组显式CANGJIE_TEST_MUTEX=1，部分整链使用测试核心和确定性本机provider，审核身份为合成身份。没有外发源码、真实Key或付费调用。

首次组合运行使用了错误的测试初始化：未预建旧access套件的output/s1-source，并把统一OS锁mock预加载到自带mock的两个unit文件，导致91项中78通过、13失败。[原日志](review-regression-bootstrap-2026-10-15.log)保留；这是本轮调用接线错误，不是产品功能红测。准备既有夹具目录并将integration/unit分开调用后复跑，未改生产互斥或放宽断言。

本轮没有执行Windows原生仓颉、浏览器、实际k6、真实模型或人员审核。修复开发回归不关闭正式验收/T9/T10，也不声明全项目无缺陷。

## 最终复测命令

在仓库根目录，已具备锁定依赖及已编译契约/样例/参考实现（此前当前会话编译通过）时执行：

```sh
npm run build:host
mkdir -p output/s1-source
CANGJIE_TEST_MUTEX=1 node --experimental-test-module-mocks --test --test-concurrency=1 tests/unit/*.test.mjs
CANGJIE_TEST_MUTEX=1 node --experimental-test-module-mocks --import ./tests/support/project-rules.mjs --test --test-concurrency=1 --test-timeout=180000 tests/integration/discovery-live-source.test.mjs tests/integration/discovery-session.test.mjs tests/integration/discovery-api.test.mjs tests/integration/model-key-validation.test.mjs tests/integration/discovery-access.test.mjs tests/integration/discovery-reuse.test.mjs tests/integration/discovery-package.test.mjs tests/integration/discovery-delivery-chain.test.mjs
```

上述是Linux开发检查命令，不替换Windows原生verify流程。所有修改文档的本地相对链接存在，git diff --check通过；产品修改限分析状态核验、交付元数据及新增回归的调度。
