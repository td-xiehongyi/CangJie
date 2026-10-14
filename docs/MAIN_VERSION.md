# 当前主版本

用户于 2026-10-14 确认当前版本为后续使用、修改与验收的主版本。

| 项目 | 主版本约定 |
| --- | --- |
| 标识 | `main-2026-10-14`（本机主版本标识） |
| 源码 | `C:\Users\xie\Desktop\Project` |
| 入口 | `http://127.0.0.1:4317` |
| 默认启动 | 在项目根目录执行 `npm start` |
| 启动脚本 | `scripts/workbench.mjs` |
| 主版本配置 | `main-version.json` |
| 使用数据 | `.local-data/natural-workflow-preview`，保留现有项目、设置及候选 |
| 方案库 | `.local-data/natural-workflow-preview/registry` |

目录名保留原名以延续现有数据；该目录现在由默认入口使用，不再作为临时预览数据。已运行时直接打开上述地址；停止后再用 `npm start` 启动。测试密码仅会话有效，重开后按界面重新准备自动账号环境。已记住的模型密钥仍由 Windows 凭据管理器保存。

主版本包含自然五步流程、文件夹选择修复、创建方案确认/进度定位以及标题参数校验与旧候选恢复。最近证据见[自然流程](evidence/natural-workflow.md)、[窗口可见性](evidence/folder-picker-foreground.md)、[创建反馈](evidence/candidate-start-feedback.md)、[参数修复](evidence/target-trial-parameters.md)。最近 Edge 完整 20/20、宿主/UI 构建通过；真实候选项目试运行三项通过，等待实际双重审核。

8097/8098 的旧验收副本、旧 ZIP 和旧界面预览保留为历史参考，不作为后续修改和使用的默认入口。未重新打包、提交、推送或对外发布。正式双审核、业务/负载、导出重开及 T10 待办继续保留。

`main-version.json` 为本开发目录的启动选择，当前交付打包器不包含它；旧包/新空包仍按自己的默认数据启动，不会带出本机项目或凭据。

2026-10-14 后续更新：会话失效可在保留页面输入的情况下重新连接，检查选择由用户决定保存或加载；业务操作命名、规则说明、已发布方案折叠及窄屏导航已优化。UI构建与Edge完整23/23通过，4317已提供新前端。本补丁未再次提交/推送，详见[会话恢复与体验验收](evidence/session-recovery-ux.md)。前述“未提交/推送”为主版本确定时的历史状态；此前基线已推送为1281778。
