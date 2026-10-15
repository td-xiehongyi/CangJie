# Ponytail交互修复开发记录

日期：2026-10-16（UTC+08:00）。分支：`fix/workflow-ux-ponytail`。
基线：`cb8e23e7635408b3bccbdc38ece8341dabf18eb0`。当前会话直接实施，没有调用子智能体。

## 逐项修复

1. 05汇总候选生成、验证和阻断；已有有效方案显示已有证据。无关历史候选失败不覆盖当前选择的状态。
2. 没有运行规则选择时，03读取项目规则库的确认与来源状态；仅是业务确认显示，不改变后端执行准入。
3. 负载表单对外部更新的目标自动同步或显式协调；已编辑输入不被覆盖，确认清除。切换运行ID重建表单，避免继承比例和确认。
4. 04去除编号流程中的第二个“导入源码”，沿用目录并按需更换，引用03说明；候选生成材料明确标识不属于02分析范围。
5. 05将能力准备按钮和缺口放在对应业务卡，技术版本详情折叠；不重复显示独立编译面板。仍然分离能力绑定、用户选择、模型授权、生成与审核，不以一键化绕过准入。
6. 06—08作为05下非导航子步骤显示；旧链接映射与09返回逻辑保留。
7. 失败报告突出修复报告下载，格式导出折叠；通过可结束或继续已选负载，运行中不能标记结束。

## 审查纠正

最初“10返回03再回来必然保留旧负载值”的说法不准确：离开10会卸载负载组件。
实际修复场景是停留在10时另一标签保存目标，以及同一组件位置切换运行记录。测试覆盖这些数据更新和初始化条件。

## 开发证据

环境：Linux云端、Node 24。模型没有真实外发，未安装Ponytail自动钩子。

- 新增05状态、03确认测试先复现失败，再修改后通过；报告主动作测试也先失败后通过。
- `node --experimental-test-module-mocks --test tests/unit/*.test.mjs`：73/73通过，包含真实组件SSR及隔离hook状态/事件处理测试；这些不是浏览器点击验收。
- 选定4份接口回归：26/26通过，命令如下。Linux明确使用测试互斥替身，不等于Windows原生锁验证。
- Playwright项目规则中的非浏览器API/SSR：4/4通过。
- 以上3组共103项不同测试；类型检查、重复执行不累计为新测试。
- contracts、host、sample、reference及UI构建通过。
- e2e TypeScript检查与用例发现通过（46项/12文件）。既有用例适配按钮、折叠导出和已移除的重复用途输入；没有删除用例或跳过测试。

从仓库根目录执行（安装依赖并构建后）：

```sh
mkdir -p output/s1-source
node --experimental-test-module-mocks --import ./tests/support/test-mutex.mjs --test --test-concurrency=1 tests/integration/discovery-api.test.mjs tests/integration/project-rules.test.mjs tests/integration/project-rules-api.test.mjs tests/integration/rule-readiness.test.mjs
npx playwright test tests/e2e/project-rules.spec.ts --grep 'project rule API|server-rendered|unsaved rule semantics'
npx tsc --noEmit --target ES2023 --module esnext --moduleResolution bundler --skipLibCheck tests/e2e/*.ts
npx playwright test --list
```

## 受阻及未验证

实际尝试：`node --experimental-test-module-mocks --import ./tests/support/test-mutex.mjs --test tests/browser/workflow-v12.test.mjs`。
Chromium启动失败，报`socket() failed: Operation not permitted`，没有进入页面断言。不通过修改系统安全设置绕过，未计入通过数量。

未完成本分支真实浏览器交互、视觉/缩放、Windows原生、实际模型输出与正式交付验收。未启动GitHub Actions，未合并main。

Ponytail仅用于最小修改原则，不替代测试证据；未删除安全、独立验证、审核或来源失效处理。当前结果是可供进一步验收的开发修复，不是正式发行结论。
