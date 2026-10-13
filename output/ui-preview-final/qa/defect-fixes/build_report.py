from pathlib import Path
import json,html
q=Path(__file__).resolve().parent
e=json.loads((q/'browser-evidence.json').read_text(encoding='utf-8'))
states=json.loads((q/'state-checks.json').read_text(encoding='utf-8'))
layouts=json.loads((q/'layout-checks.json').read_text(encoding='utf-8'))
assert all(x['pass'] for x in e['checks']+states+layouts)
fixes=[
 ('F1','默认流程可连续推进','连接检查、普通/包复跑、目标结束及在途结算按预设进度自动完成；停止仍中断运行。'),
 ('F2','调整范围保留表单','保留目录、用途、账号、当前密码及环境确认；仅发送范围同意失效。'),
 ('F3','模板资格按版本核对','旧版停用不影响有效替代版；旧版包与新项目执行受阻，改选有效版本后重新确认。'),
 ('F4','提交业务绑定目标负载','单项或三项检查通过后进入提交负载；绑定来源运行、所选规则、目标、账本及最终证据。'),
 ('F5','待定规则只观察','展示请求与快照观察；不作对错判定。全部待定时无负载入口，仅含观察的包不能验证复跑。'),
 ('F6','种子证据、包与迁移对应业务','保存、重复提交、权限隔离分别显示请求与断言；提交/报名的包保留规则、项目、映射和来源。')]
md='''# 六项预览缺陷修订与复查

2026-10-12。本轮修改现有蓝白四页静态预览，未开发实际功能。此前编号页与旧截图作为修订前审查保留；当前结果以本文件为准。

## 修订结果

| 编号 | 修订 | 结果 |
|---|---|---|
'''
md+='\n'.join(f'| {a} | {b} | {c} |' for a,b,c in fixes)
md+='''

## 本轮实际点击路径

1. 默认入口 → 填写虚构模型配置 → 检查连接自动结束 → 保存返回。
2. 自定义目录、用途、账号、密码与环境确认 → 扩大发送范围 → 核对无关表单保留 → 重新同意发送 → 分析、映射及试运行。
3. 无模板字段保持 → 生成 v0.1 → 对照漏检 → 修订 v0.2 → 独立样本 → 受控端到端 → 项目副本业务失败 → 双重审核 → 发布 v1.0。单项审核不能发布。
4. 修复准备、四项条件和密码 → 普通复跑自动进入 R015 → 目标负载自动结束与结算进入 L016。未依赖检查模式或“显示结果”控件。
5. 停用 v1.0 → 旧包执行受阻 → 新项目旧版执行受阻 → 改选 v1.1 并重新确认 → 包复跑 → 资格摘要与卡片均为 v1.1 已发布 → 迁移结果保留 v1.1。
6. 工单提交只确认保存结果 → S014 通过，另两项仅观察 → 对应负载与 SL016 账本 → 导出选择中的包清单 → 加载最近验证包 → 重新输入密码及确认 → S015，保留原包来源及单项规则。
7. 提交三项全选 → 重复提交失败、权限证据不足分别保留，负载受阻 → 修复复跑通过 → P95 阈值 500ms 时目标未完成 → 人工停止时先结算，再保留未完成结果。
8. 三项全部待定 → 仅记录三项观察，无通过结论及负载入口 → 观察包阻止验证复跑。
9. 提交模板迁移活动报名 → registration-v1 与本项目请求证据 → A014 验证包 → 活动项目基线、密码、条件确认 → A015，关联 A014。
10. 可信对照补充入口作为明确状态补查：复制要求成功；缺审核/冻结确认阻断；补齐后保持 v0.2、第 2 次尝试继续。

## 验证范围

'''
md+=f"- {len(e['checks'])} 项点击断言通过；{len(states)} 个明确状态页面检查通过；8 个页面状态 × 1280/768/390 宽度，共 {len(layouts)} 项尺寸检查无横向溢出。\n"
md+=f"- {len([s for s in e['shots'] if s.get('file')])} 张同轮点击截图，另有 1 张 390 宽度截图；截图目视核对蓝白风格、卡片及小屏导航。\n"
md+='''- 脚本语法检查通过，47 个函数无重复声明；浏览器所捕获警告/错误为空。产品 CSS 未修改，四页结构不变。
- 本轮截图与 DOM/URL 见 browser-evidence.json；状态、尺寸、源文件哈希分别保存，修改前六个源文件位于 before/。

## 限制

这是固定样例的交互预览。自动完成不是模型调用、网站执行、容量、模板发布或技术审核的真实证据；文件选择不读取包，导出不生成文件。加载最近验证包使用虚构清单，只演示范围与确认。版本/运行标识仍为预设展示槽位，不等于真实不可变历史或任意版本修订实现。未进行实际产品、完整键盘/读屏、跨电脑或生产环境验收。正式需求及实施计划未修改。
'''
(q/'修订与复查.md').write_text(md,encoding='utf-8')
cards=''.join(f'<article><span>{a} · 已补齐</span><h2>{b}</h2><p>{c}</p></article>' for a,b,c in fixes)
shots=''.join(f'<figure><figcaption>{html.escape(s["id"])} · {html.escape(s["note"])}</figcaption><img loading="lazy" src="{s["file"]}" alt="{html.escape(s["note"])}"><details><summary>本轮页面记录</summary><p>{html.escape(s["url"])}</p><pre>{html.escape(s["dom"])}</pre></details></figure>' for s in e['shots'] if s.get('file'))
rows=''.join(f'<tr><td>{html.escape(x["id"])}</td><td>通过</td><td>{html.escape(x.get("note","单项确认不能发布"))}</td></tr>' for x in e['checks'])
out=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>六项预览缺陷修订与复查</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#f4f6fa;color:#182743;font:15px/1.8 "Segoe UI","Microsoft YaHei",sans-serif}}main{{max-width:1280px;margin:auto;padding:32px 24px}}h1{{font-size:30px;margin:10px 0}}h2{{font-size:18px;margin:7px 0}}p{{margin:8px 0;color:#62718a}}a{{color:#2459cf}}.links{{display:flex;gap:20px;flex-wrap:wrap}}.cards{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:24px 0}}article,figure,.block{{background:#fff;border:1px solid #dfe5ef;border-radius:14px;padding:20px}}article span{{color:#18704f;font-size:13px}}.gallery{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}}figure{{margin:0;min-width:0;padding:12px}}figcaption{{padding:6px 4px 12px;font-size:14px}}img{{width:100%;height:auto;display:block;border-radius:8px}}table{{border-collapse:collapse;width:100%;font-size:13px}}td,th{{padding:12px;text-align:left;border-bottom:1px solid #dfe5ef}}.table{{overflow:auto;margin:24px 0}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}}details{{margin-top:12px;color:#62718a}}.stats{{color:#18704f}}@media(max-width:800px){{.cards,.gallery{{grid-template-columns:1fr}}main{{padding:20px 12px}}}}
</style><main><h1>六项预览缺陷已补齐</h1><p>2026-10-12 · A 蓝白工作台 · 四个页面 · 静态交互预览</p><div class="links"><a href="../../index.html">打开四页预览</a><a href="修订与复查.md">完整检查说明</a><a href="../numbered-flow/编号点击说明.html">修订前编号记录</a></div><div class="cards">{cards}</div><div class="block"><strong class="stats">{len(e['checks'])} 项点击断言 · {len(states)} 个状态 · {len(layouts)} 项尺寸检查通过</strong><p>无模板主链从默认入口点击完成；提交、验证包和迁移另行逐步检查。可信对照补充及部分边界状态用明确状态入口补查。</p><p>所有结果为固定预设；没有真实模型、网站、审核发布、包文件读写或负载执行。完整键盘、读屏与跨电脑交付未验收。</p></div><div class="table block"><table><thead><tr><th>检查</th><th>结果</th><th>依据</th></tr></thead><tbody>{rows}</tbody></table></div><h2>本轮截图与页面记录</h2><div class="gallery">{shots}<figure><figcaption>390 宽度 · 提交结果</figcaption><img loading="lazy" src="16-mobile.jpg" alt="390宽度提交报告"></figure></div></main></html>'''
(q/'修订检查.html').write_text(out,encoding='utf-8')
print(f'{len(fixes)} fixes; {len(e["checks"])} checks; {len(states)} states; {len(layouts)} layouts')
