# 文件夹选择无弹窗修复

日期：2026-10-14。范围：4317源码预览及本机选择器；不改8098验收副本或正式ZIP。

后续用户再次反馈无弹窗，直接检查发现窗口被Chrome遮挡。本文是第一轮桌面及取消修复记录，最终前台层级修复见[后续记录](folder-picker-foreground.md)；窗口存在和路径返回不能单独证明用户能看到弹窗。

## 原因与修复

之前由代理在CodexSandboxDesktop隔离桌面启动了4317宿主。原生FolderBrowserDialog实际存在并可见，但位于用户看不到的桌面，HTTP请求等待到120秒超时；页面把这次等待作为全局操作，导致其他提交也等待结束。不是项目目录错误。

- 核对原宿主PID及命令行、项目/运行/负载均0且无Key后，只重启4317预览到用户Default桌面。新进程记录见[重启记录](../../output/folder-picker-fix/restarted-preview.json)；继续使用原独立数据目录，没有切换到8098或其他工作台。
- 原生选择脚本在打开弹窗前核对线程桌面与当前输入桌面。无法显示时立即返回明确错误，保留粘贴路径入口，避免在隐藏桌面等两分钟。
- 页面等待期间增加“取消选择文件夹”。取消会中止请求及后台选择器，保留已输入路径，释放操作状态；切页取消和单实例保护继续保留。

后台以隐藏窗口运行不等于原生选择器必须隐藏：本机对照证明同一脚本在隔离桌面和Default桌面均能创建原生窗口，关键区别是窗口所在桌面。没有用删除windowsHide或改系统权限替代根因修复。

## 验证

- 真实隔离桌面先红后绿：旧实现等待到测试5秒取消且不报不可用；新实现快速拒绝不可见窗口。见[失败](../../output/folder-picker-fix/hidden-red.log)、[通过](../../output/folder-picker-fix/hidden-green.log)。
- 真实用户桌面与4317接口：检测到Default桌面可见的原生对话框，通过窗口路径文本框选择samples/ticket，接口返回准确绝对路径；原生取消返回directory:null。见[真实接口日志](../../output/folder-picker-fix/native-host-green.log)、[窗口及响应](../../output/folder-picker-fix/native-host-green.json)。不是替身选择器。
- 新浏览器用例先红后绿，覆盖同页取消、后台请求中止、保留路径和继续检查项目；既有切页取消也保留。
- 宿主/报告回归10/10，宿主和UI构建通过；最终Edge浏览器全套16/16、git diff --check通过。见[后端](../../output/folder-picker-fix/host-green.log)、[浏览器](../../output/folder-picker-fix/browser-final.log)、[构建](../../output/folder-picker-fix/build.log)。此前259/259是自然操作流程基线，本次没有重跑整个npm test。
- 第一次浏览器全套14通过、1失败、1未运行；失败为活动报名样例STARTUP_OR_BASELINE_FAILED，未改预算或测试断言。两项单独复核2/2通过，保留首次日志。

原生测试器最初使用跨进程自定义指针消息模拟选择，导致无效结果；已改用系统文本框输入与原生按钮点击，再取得上述通过结果。过程日志保留，不把测试器故障当作产品验收通过。

## 后续使用

刷新http://127.0.0.1:4317后重试“选择文件夹”。正常情况下显示Windows选择窗口；也可点击页面“取消选择文件夹”后粘贴完整路径。宿主必须在用户可交互桌面启动；从本机PowerShell执行`node output/natural-workflow/preview.mjs`即可沿用独立预览数据。

本轮没有调用真实模型、签署审核或覆盖旧交付。原生显示/路径返回/取消已自动核验，用户当前页面的现场复验及其余正式验收仍开放。
