from pathlib import Path
import json, html, hashlib

q=Path(__file__).resolve().parent
shots=json.loads((q/'screens.json').read_text(encoding='utf-8'))
findings=json.loads((q/'findings.json').read_text(encoding='utf-8'))
steps=[
('01','模型设置','填写地址、模型与 API Key；记住/清除密钥为可选操作。','模型设置','02'),
('02','检查连接','应由系统检查连接与结构化输出。当前默认预览在此停住，F1。','模型设置','03'),
('03','保存并返回项目','仅检查通过后保存；不是检查未完成时强行保存。','模型设置','04'),
('04','选择目录、填写用途和账号','目录对话框内确认；密码仅用示例，未访问实际文件夹。','项目接入','05'),
('05','调整范围、勾选同意发送','扩大范围必须重新同意；当前会丢失无关表单输入，F2。','项目接入','06'),
('06','确认测试副本与专用数据','核对独立副本、数据库和初始化来源。','项目接入','07'),
('07','开始分析','开始分析后可点查看检查结果；缺条件进入 A1—A4，再核对映射。','项目接入','08'),
('08','确认映射并试运行','先勾选接口、账号、字段与查询范围，再点确认并试运行。','项目接入','09'),
('09','选择业务流程、需要时更换','一轮只选一条；流程选择对话框内点选择流程。','业务验证','10'),
('10','编辑并确认规则','勾选适用规则；编辑后需重新确认。待定观察记录缺失，F5。','业务验证','11'),
('11','确认并检查能力／确认并验证','无模板分类检查；已有模板直接运行适用检查。','业务验证','12 / 21'),
('12','生成候选','仅缺实验且已有执行能力时进入；缺原语保留缺口。','业务验证','13'),
('13','开始验证候选','定义、正常、缺陷及未知对照按层次验证。','业务验证','14 / 15'),
('14','修订并重新验证','首次生成后最多两轮；不能放宽规则或重置次数。','业务验证','13 / 15'),
('15','运行受控端到端','可信正确行为和已审核缺陷对照；不足进入 A5—A6。','业务验证','16'),
('16','在项目副本试运行','身份、同一对象、完整查询及复位证据。','业务验证','17'),
('17','提交审核','实验有效与项目业务通过是两件事。','业务验证','18'),
('18','查看分层验证证据、确认业务适用','可以展开验证证据；业务使用者确认规则与适用范围。','验证报告','19'),
('19','勾选开发者技术审核','独立对照、端到端、试运行、限制和版本；缺审核者保持候选。','验证报告','20 / A7'),
('20','审核并发布固定版本','18 和 19 缺一不可；发布不消除业务失败证据。','验证报告','21'),
('21','业务结果／候选资格','两个页签属于同一运行。有效替代版本显示冲突，F3。','验证报告','22 / 27 / 32 / 44'),
('22','展开证据、复制修复说明','请求响应与断言、完整证据；修复在工具外进行。种子证据仍简略，F6。','验证报告','23'),
('23','修复后复测','提供修改后的项目并创建关联新记录。','验证报告','24'),
('24','核对目录、版本、本次变化','接口变化走 08 重新接入；未变化沿用映射。','业务验证','25 / 08'),
('25','补密码并勾选复跑条件','版本、测试副本、旧操作隔离、seed-v1 复位及重新登录。','业务验证 / 项目接入','26 / 39'),
('26','准备完成，开始复跑','从实验第一步重跑。当前默认预览停在运行中，F1。','业务验证','21 / A8'),
('27','验证目标负载','低负载通过才可进入。工单提交缺对应入口与绑定，F4。','验证报告','28 / 29'),
('28','不确定目标','填写使用方式、集中程度、预计操作率及可接受等待，再带入目标。','业务验证','29'),
('29','确认目标、数据、判定与停止条件','同时核对时长、阈值、数据规模、业务检查和结算期限。','业务验证','30'),
('30','开始目标负载','系统同步检查业务和性能。当前默认完成/结算推进缺失，F1。','业务验证','31 / 系统结算'),
('31','停止（可选）','人工停止、自动违规/超标停止都先结算；停止不等于通过。','业务验证','系统结算 → 21'),
('32','导出','任何已有报告可选择导出当前运行成果。','验证报告','33'),
('33','勾选成果、导出所选内容','Markdown 报告、证据文件、验证包。静态预览不生成实际文件。','验证报告','34 / 完成'),
('34','加载验证包','四页页头均可进入。','全局','35'),
('35','选择验证包文件','原生文件选择入口；当前预览不读取文件内容。','加载对话框','36'),
('36','检查并加载','格式、路径、版本、资格；损坏/不兼容回 34。','加载对话框','37 / 38'),
('37','选择有效版本并重新确认','停用版本不得直接执行；当前版本状态隔离存在 F3。','项目接入','38'),
('38','继续复跑','转到测试账号与环境/数据/隔离确认。','项目接入','25'),
('39','开始复跑','使用包内规则、映射和所选有效模板创建关联运行。','项目接入','21'),
('40','切换项目','换项目不继承旧项目的通过结论。','全局','41'),
('41','选择项目','当前例子为工单和报名。','项目对话框','42'),
('42','确认新映射并试运行','重新确认新规则、字段语义、身份、查询及数据。停用资格未统一阻断，F3。','项目接入','43'),
('43','查看复用结果','本项目证据得出本项目结论。种子迁移未完整展示，F6。','项目接入','21 / 32'),
('44','停用此版本、填写原因、确认','保留旧报告；停止推荐/执行该版本。当前影响范围有 F3。','验证报告','37 / 45'),
('45','生成修订候选','回到候选验证与审核；当前父版本及新发布版本沿革仍属示意。','验证报告','13—20'),
('A1','复制补充说明','初始化缺口交由用户或编码 AI 处理，工具不修改源码。','项目接入','A2'),
('A2','补齐后重新检查','核对目标、角色、数据、初始化与重置条件。','项目接入','08'),
('A3','补充取证信息','HTTP 入口、接口说明或查询页面线索。','验证报告 / 项目接入','A4'),
('A4','重新检查接入','外部依赖只确认测试服务；缺字段不判业务失败。','项目接入','08'),
('A5','复制待补要求','独立正常/缺陷参考对照及冻结版本。','业务验证','A6'),
('A6','补齐后重新检查','开发者独立审核与冻结；规则和尝试次数不重置。','业务验证','16'),
('A7','退回候选','填写原因并保留草稿、规则及次数。','验证报告','A5 / A6'),
('A8','重新核对条件，从头重跑','中断或复位失败不直接重发未知写请求。','业务验证','25'),
]
(q/'steps.json').write_text(json.dumps([dict(zip(['n','action','description','page','next'],x)) for x in steps],ensure_ascii=False,indent=2),encoding='utf-8')
lookup={x[0]:x for x in steps}
def escape(s):return html.escape(str(s),quote=True)
def stage(ids):
 return '<div class="lane">'+''.join('<a class="flow-node" href="#step-'+escape(n)+'" data-step="'+escape(n)+'"><b>'+escape(n)+'</b> '+escape(lookup[n][1])+'</a>' for n in ids)+'</div>'
flow='<div class="flows">'+stage([f'{i:02}' for i in range(1,12)])+stage([f'{i:02}' for i in range(12,21)])+stage([f'{i:02}' for i in range(21,34)])+stage([f'{i:02}' for i in range(34,46)])+'</div>'
annotated=[]
for shot in shots:
 marks=''.join('<a class="marker" data-step="'+escape(m['n'])+'" href="#step-'+escape(m['n'])+'" style="left:'+str(round(max(8,m['x'])/shot['w']*100,3))+'%;top:'+str(round((m['y']+min(m['h']/2,14))/shot['h']*100,3))+'%" aria-label="'+escape(m['n']+' '+m['label'])+'">'+escape(m['n'])+'</a>' for m in shot['markers'])
 annotated.append('<section class="screen" id="screen-'+escape(shot['id'])+'"><h3>'+escape(shot['title'])+'</h3><div class="image-frame"><img src="'+escape(shot['file'])+'" alt="'+escape(shot['title'])+'">'+marks+'</div><details><summary>本轮 URL 与界面记录</summary><p>'+escape(shot['url'])+'</p><pre>'+escape(shot['dom'])+'</pre></details></section>')
def health(n):
    issues=[]
    if n in ['02','03','26','30','39']: issues.append('F1')
    if n in ['04','05']: issues.append('F2')
    if n in ['21','37','40','42','43','44']: issues.append('F3')
    if n in ['27','28','29','30']: issues.append('F4 工单提交')
    if n in ['10','11','21']: issues.append('F5 待定观察')
    if n in ['22','32','33','34','35','36','37','38','39','40','41','42','43']: issues.append('F6 其他模板')
    if issues: return '对应分支有缺陷：'+'、'.join(issues)
    if n.startswith('A') or n in ['08','31','45']: return '入口已知；本轮未完整回归'
    return '本轮已核对界面操作；非真实执行验收'
rows=''.join('<tr id="step-'+escape(n)+'"><td><a href="#" data-step="'+escape(n)+'">'+escape(n)+'</a></td><td>'+escape(action)+'</td><td>'+escape(page)+'</td><td>'+escape(desc)+'</td><td>'+escape(nxt)+'</td><td>'+escape(health(n))+'</td></tr>' for n,action,desc,page,nxt in steps)

issues=''.join('<article id="finding-'+escape(f['id'])+'"><h3>'+escape(f['id']+' '+f['title'])+'</h3><p>关联 '+escape(f['steps'])+'</p><p>'+escape(f['evidence'])+'</p></article>' for f in sorted(findings,key=lambda x:x['id']))
style='''body{margin:0;font:15px/1.7 "Segoe UI","Microsoft YaHei",sans-serif;color:#17233a;background:#f3f6fb}main{max-width:1240px;margin:auto;padding:28px}h1{font-size:28px}h2{font-size:22px;margin:28px 0 12px}h3{font-size:17px}a{color:#3458b7}nav{display:flex;gap:20px;flex-wrap:wrap}.notice{padding:16px;border:1px solid #e2c99c;background:#fff6e6;border-radius:10px}.flows{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;align-items:start}.lane{display:flex;flex-direction:column;gap:20px}.flow-node{background:white;border:1px solid #cfd9ed;border-radius:8px;padding:10px 12px;text-decoration:none;position:relative;min-height:50px}.flow-node b{color:#3458b7;margin-right:5px}.screens{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}.screen{background:white;padding:16px;border-radius:12px;min-width:0;scroll-margin-top:90px}.screen:first-child{grid-column:1/-1}.screen h3{margin:0 0 12px}.image-frame{position:relative}.image-frame img{width:100%;display:block;height:auto}.marker{position:absolute;transform:translate(-65%,-50%);display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#264da8;color:white;text-decoration:none;font:600 12px/1 "Segoe UI",sans-serif;box-shadow:0 0 0 2px white,0 2px 5px #17233a50;z-index:2}.marker.is-selected{background:#c62c39;transform:translate(-65%,-50%) scale(1.25)}.screen:target{outline:3px solid #4666b8}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;background:white}td,th{padding:10px;border:1px solid #dce3ef;text-align:left;vertical-align:top}th{background:#e9effb}tr.is-selected{background:#fff0c9}article{background:white;border-left:4px solid #be3340;padding:12px 18px;margin:14px 0}article p{margin:5px 0}.toolbar{position:sticky;top:0;z-index:20;background:#fff;padding:12px 16px;border-bottom:1px solid #dce3ef;display:flex;gap:20px;flex-wrap:wrap}.selected-note{color:#52647f}details{margin-top:12px;color:#61718b}.dim{color:#61718b}@media(max-width:850px){.flows{grid-template-columns:1fr 1fr}.screens{grid-template-columns:1fr}}@media(max-width:520px){main{padding:14px}.flows{grid-template-columns:1fr}.marker{width:22px;height:22px;font-size:10px}.toolbar{gap:10px;font-size:13px}}'''
script='''const guide=document.getElementById('click-guide');guide.addEventListener('click',event=>{const button=event.target.closest('[data-step]');if(!button)return;event.preventDefault();const n=button.dataset.step;guide.querySelectorAll('.is-selected').forEach(el=>el.classList.remove('is-selected'));const row=document.getElementById('step-'+n);if(row)row.classList.add('is-selected');const badges=[...guide.querySelectorAll('.marker')].filter(x=>x.dataset.step===n);badges.forEach(x=>x.classList.add('is-selected'));document.getElementById('selected-note').textContent='已选择 '+n+'：'+(row?.children[1]?.textContent||'');if(button.classList.contains('marker'))row?.scrollIntoView({behavior:'smooth',block:'center'});else if(badges.length)badges[0].closest('.screen').scrollIntoView({behavior:'smooth',block:'start'});else row?.scrollIntoView({behavior:'smooth',block:'center'});});'''
page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>用户点击编号与预览缺陷</title><style>'+style+'</style><div id="click-guide"><div class="toolbar"><a href="#flows">流程</a><a href="#screens">编号截图</a><a href="#steps">45步与恢复分支</a><a href="#findings">6处缺陷</a><span id="selected-note" class="selected-note">点击截图序号可定位说明</span></div><main><h1>用户点击流程与当前预览缺陷</h1><nav><a href="../../index.html">打开默认四页预览</a><a href="用户点击流程图与缺陷.md">完整分支流程图与报告</a></nav><p class="notice">本轮只审查与标号：3处新增问题、3处既有缺口。源界面和原始截图未修改。蓝色序号属于说明层，点击可定位操作；系统自动处理不编号成用户按钮。默认预览存在处理中断点，不能宣称可从01自助点通至45。</p><h2 id="flows">点击编号索引</h2><p class="dim">四列分别对应接入、候选、报告复跑与负载、验证包与迁移。这是编号索引，并非所有步骤都必须依次点击；完整条件与回退见流程图。</p>'+flow+'<h2 id="findings">本轮确认的缺陷</h2>'+issues+'<h2 id="screens">当前预览的编号截图</h2><p>仅标注截图可见的实际控件。长页面的下方控件和未单独截图的状态仍列在操作对照表，不凭空标在图片上。</p><div class="screens">'+''.join(annotated)+'</div><h2 id="steps">用户操作对照表</h2><div class="table-wrap"><table><thead><tr><th>序号</th><th>可能点击或填写</th><th>页面</th><th>条件与检查结果</th><th>接着去哪</th><th>本轮状态</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="dim">本轮20张截图与可见DOM记录；为了检查后续分支使用明确状态链接及检查模式模拟，不是实际AI/网站/负载执行。未完成全键盘、读屏或移动端全量验收。</p></main></div><script>'+script+'</script></html>'
(q/'编号点击说明.html').write_text(page,encoding='utf-8')
before=json.loads((q/'source-before.json').read_text(encoding='utf-8'));root=q.parents[1]
after={n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in before}
assert before==after,'Product preview changed during read-only audit'
(q/'source-verification.json').write_text(json.dumps({'files_unchanged':before==after,'hashes':after,'screenshots':len(shots),'numbered_steps':45,'recovery_branches':8,'findings':len(findings)},ensure_ascii=False,indent=2),encoding='utf-8')
print('Created numbered guide:',len(shots),'fresh screenshots, 45 numbered steps, 8 branches. Product sources unchanged.')
