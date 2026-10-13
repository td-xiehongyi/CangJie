from pathlib import Path
root=Path(__file__).resolve().parents[2]
p=root/'preview.js'
s=p.read_text(encoding='utf-8')
def replace(old,new):
    global s
    assert old in s, old[:140]
    s=s.replace(old,new)
def function(name,new):
    global s
    start=s.index('function '+name+'(')
    end=s.find('\nfunction ',start+10)
    assert end>start
    s=s[:start]+new.rstrip()+'\n'+s[end:]

replace("let reportTab=params", "// Per-version qualification; old preview sessions migrate once.\nif(!demo.disabledVersions)demo.disabledVersions=demo.disabledTemplate?['v1.0']:[];\ndelete demo.disabledTemplate;\nconst ruleNames={save:'保存结果',duplicate:'重复提交',permission:'权限隔离'};\nconst allSubmitRules=Object.keys(ruleNames);\nconst selectedSubmit=()=>demo.selectedRules??allSubmitRules;\nconst isDisabled=(version)=>demo.disabledVersions.includes(version);\nconst editVersion=()=>demo.activeVersion||'v1.0';\nconst submitTemplates=(ids=selectedSubmit())=>ids.map(id=>ruleNames[id]+' v1.0').join('、')||'无已确认模板';\nconst flowQuery=()=>flow==='submit'?'&flow=submit':'';\nlet settingsDraft;\nlet progressTimer;\nlet reportTab=params")
replace("...(page==='verify'?{flow}:{}),", "...(flow==='submit'||page==='verify'?{flow}:{}),")
replace('section class="card compact-card"><div class="card-header"><h2>发送范围', 'section class="card compact-card scope-card"><div class="card-header"><h2>发送范围')
replace("demo.published&&!demo.disabledTemplate", "demo.published&&!isDisabled(editVersion())")
replace("demo.disabledTemplate&&templateVersion==='v1.0'", "isDisabled(templateVersion)")
replace("demo.disabledTemplate?'已停用':'已发布'", "isDisabled(version)?'已停用':'已发布'")
replace("demo.disabledTemplate?'amber':'green'", "isDisabled(version)?'amber':'green'")
replace("demo.disabledTemplate?'已停止推荐与执行'", "isDisabled(version)?'已停止推荐与执行'")
replace("demo.disabledTemplate?'历史报告保留", "isDisabled(version)?'历史报告保留")
replace("demo.disabledTemplate?'':button('停用此版本','template-disable')", "isDisabled(version)?'':button('停用此版本','template-disable',false,`data-version=\"${esc(version)}\"`)")
replace("if(action==='template-disable')return modal(","if(action==='template-disable'){demo.disableTarget=el.dataset.version||editVersion();return modal(")
replace("button('确认停用','template-disable-confirm',true));", "button('确认停用','template-disable-confirm',true));}")
replace("demo.disabledTemplate=true;", "if(!isDisabled(demo.disableTarget))demo.disabledVersions.push(demo.disableTarget);")
replace("demo.disabledTemplate=false;", "demo.disabledVersions=demo.disabledVersions.filter(v=>v!=='v1.0');")
replace("if(demo.disabledTemplate)return error('所用模板已停用，请加载有效版本或修订候选');", "if(flow==='edit'&&isDisabled(editVersion()))return error('所用模板已停用，请选择有效版本或修订候选');")
replace("demo.replayRun={...demo.repair,template:'v1.0',source:'repair'}", "demo.replayRun={...demo.repair,flow,selected:[...selectedSubmit()],template:editVersion(),source:'repair'}")
replace("if(action==='scope-apply'){demo.extraScope", "if(action==='scope-apply'){demo.extraScope")
replace("saveDemo();closeModal();render();const box=document.querySelector('#scope-consent');if(box)box.checked=false;toast('范围已调整，请重新确认发送');", "saveDemo();closeModal();document.querySelector('.scope-card').outerHTML=scopeCard();toast('范围已调整，请重新确认发送');")
replace("const ready=state==='connected'||state==='saved',failure", "const ready=state==='connected'||state==='saved',failure")
replace("function render(){shell(page==='project'?projectView():page==='verify'?verifyView():page==='report'?reportView():settingsView());}",r'''function render(){
  clearTimeout(progressTimer);
  shell(page==='project'?projectView():page==='verify'?verifyView():page==='report'?reportView():settingsView());
  if(page==='settings'&&settingsDraft)Object.entries(settingsDraft).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.type==='checkbox'?el.checked=value:el.value=value;});
  // Scripted preview progression only; no requests or real execution.
  if(!inspectMode){
    const expected=state;
    const advance=page==='settings'&&state==='checking'?()=>{modelDirty=false;demo.modelReady=true;saveDemo();go('connected');}:
      page==='verify'&&['business-running','replay-running'].includes(state)?completeBusiness:
      page==='verify'&&state==='load-running'?()=>go('load-settling'):
      page==='verify'&&state==='load-settling'?completeLoad:null;
    if(advance)progressTimer=setTimeout(()=>{if(state===expected)advance();},state==='load-running'?4500:state==='checking'?1500:2400);
  }
}
function completeBusiness(){
  const replay=state==='replay-running';
  if(flow==='submit'){
    const run={id:replay?'S015':'S014',selected:[...selectedSubmit()],repaired:replay,version:replay?(demo.replayRun?.version||'demo-2'):'demo-1',mapping:demo.replayRun?.mapping||'v1.3'};
    demo[replay?'submitReplay':'submitRun']=run;saveDemo();
  }
  navigate('report.html?state='+(flow==='submit'?'submit&flow=submit'+(replay?'&case=repaired':''):replay?'replayed':'published')+(variant==='replacement'?'&case=replacement':''));
}
function completeLoad(){
  const cfg=demo.load||{latency:1500,error:1};
  const out=variant==='unknown'?'load-unknown':variant==='business'?'load-failed':variant==='manual'?'load-stopped':variant==='performance'||variant==='resource'||cfg.latency<820||cfg.error<0.3?'load-unmet':'load-passed';
  const snapshot={state:out,variant,flow,config:{...demo.load},replay:{...demo.replayRun},selected:[...(demo.load?.selected||selectedSubmit())],source:demo.load?.source||'R015'};
  demo[flow==='submit'?'submitLoadReport':'loadReport']=snapshot;saveDemo();navigate('report.html?state='+out+'&case='+variant+flowQuery());
}''')
replace("demo.customService=!url.includes('api.deepseek.com');saveDemo();return go('checking');", "settingsDraft=Object.fromEntries(['provider','endpoint','model-name','api-key','remember-key'].map(id=>{const input=document.getElementById(id);return [id,input.type==='checkbox'?input.checked:input.value];}));modelDirty=false;demo.customService=new URL(url).hostname!=='api.deepseek.com';saveDemo();return go('checking');")
replace("document.querySelector('#api-key').value='';document.querySelector('#remember-key').checked=false;", "settingsDraft=undefined;document.querySelector('#api-key').value='';document.querySelector('#remember-key').checked=false;")
replace("if(action==='business-complete'){navigate('report.html?state='+(flow==='submit'?(state==='replay-running'?'submit&flow=submit&case=repaired':'submit&flow=submit'):state==='replay-running'?'replayed':'published')+(variant==='replacement'?'&case=replacement':''));return;}", "if(action==='business-complete')return completeBusiness();")
start=s.index("  if(action==='settle'){")
end=s.index('\n',start)
s=s[:start]+"  if(action==='settle')return completeLoad();"+s[end:]

# Pending observations remain visible and cannot acquire a verdict.
replace("<p class=\"fine\">未确认项不参与判定。</p>", "<p class=\"fine\">待定规则仅保留观察，不参与对错判定。</p>")
replace("if(!selected.length)return error('请至少确认一条规则；待定项不判对错');if(flow==='submit')", "if(!selected.length&&flow!=='submit')return navigate('report.html?state=observation');if(flow==='submit')")
replace("document.querySelector('#rule-count').textContent=", "const next=document.querySelector('[data-action=\"rules-next\"]');if(next)next.textContent=all.some(x=>x.checked)?(flow==='submit'?'确认并验证':'确认并检查能力'):'仅保留观察';document.querySelector('#rule-count').textContent=")
replace("if(state==='submit')return submitReportView();", "if(state==='submit')return submitReportView();\n  if(state==='observation')return heading('观察记录','编辑工单 · 规则待定')+`<section class=\"card\"><h2>仅保留观察</h2><p>仅更新标题后 priority：high → normal，ownerId 未变化。业务预期尚未确认，不判通过或失败。</p>${actions(link('返回确认规则','verify.html?state=rules',true))}</section>`;\n  if(flow==='submit'&&state.startsWith('load-'))return submitLoadReportView();")
replace("${kv('主流程',page==='verify'?flowName():'编辑工单')}", "${kv('主流程',flowName())}")
replace("flow==='submit'?'已确认检查的固定版本'", "flow==='submit'?submitTemplates()")
replace("link('返回复跑准备','verify.html?state=replay-prepare',true)", "link('返回复跑准备','verify.html?state=replay-prepare'+flowQuery(),true)")
replace("navigate('index.html?state=mapping&return=replay')", "navigate('index.html?state=mapping&return=replay'+flowQuery())")
replace("navigate(document.querySelector('input[name=\"project-choice\"]:checked').value==='activity'?'index.html?state=transfer':'index.html')", "navigate(document.querySelector('input[name=\"project-choice\"]:checked').value==='activity'?'index.html?state=transfer'+flowQuery():'index.html')")

function('submitReportView',r'''function submitEvidence(id,repaired=false,activity=false){
  const noun=activity?'报名':'工单',path=activity?'registrations':'tickets',object=activity?'A201':'T201';
  const rows={
    save:{steps:`甲提交${noun} → 按返回 ID 查询完整记录`,request:`POST /api/${path}\n{ "${activity?'displayName':'title'}": "新记录", "${activity?'notes':'content'}": "内容" }\n201 { "id": "${object}" }\nGET /api/${path}/${object} → 200，提交字段一致`,assert:'查询 ID == 接受 ID；提交字段严格相等 → true'},
    duplicate:{steps:'同一身份、同一意图键重试两次 → 查询该意图的完整结果集合',request:`POST /api/${path} · intent=I01 · attempt=1 → 201\nPOST /api/${path} · intent=I01 · attempt=2 → 200\nGET /api/${path}?intent=I01 → ${repaired?'["'+object+'"]':'["'+object+'", "'+object+'b"]'}`,assert:`distinct(result.id).length == 1 → ${repaired?'true':'false'}`},
    permission:{steps:'甲创建记录 → 乙查询同一 ID → 核对访问结果与字段完整性',request:`甲 POST /api/${path} → 201，id=${object}\n乙 GET /api/${path}/${object} → ${repaired?'403，明确拒绝':'200，响应缺少身份与归属关联字段'}`,assert:repaired?'乙被明确拒绝，未返回他人业务字段 → true':'身份与响应关联证据不足 → 无法验证；不将缺字段计为拒绝'}
  };
  const row=rows[id];return `<p>${row.steps}</p><pre>${esc(row.request)}\n\n${esc(row.assert)}</pre><p>账号、对象、意图键、请求接受状态、最终查询与证据引用关联；不含密码或 Token。</p>`;
}
function pendingObservations(selected,activity=false){
  const pending=allSubmitRules.filter(id=>!selected.includes(id));
  if(!pending.length)return '';
  const text={save:'已记录接受 ID、提交字段与最终查询快照。',duplicate:'同一意图的两次请求及结果集合已记录，数量预期尚未确认。',permission:'另一身份的访问响应已记录，允许范围尚未确认。'};
  return `<section class="card"><div class="card-header"><h2>待定观察</h2>${pill('不参与判定','amber')}</div>${pending.map(id=>`<div class="status-row"><div><strong>${ruleNames[id]}</strong><p>${text[id]}</p></div>${pill('仅观察')}</div>`).join('')}${detail('观察边界','保留请求与快照供确认规则；不作通过、失败或覆盖率结论。规则确认后需重新执行，不能追认旧观察为验证结果。')}</section>`;
}
function submitReportView(){
  const repaired=variant==='repaired';
  const run=demo[repaired?'submitReplay':'submitRun']||{id:repaired?'S015':'S014',selected:[...selectedSubmit()],version:repaired?'demo-2':'demo-1',mapping:'v1.3'};
  const selected=run.selected,good=selected.length>0&&(repaired||selected.every(id=>id==='save'));
  demo.selectedRules=[...selected];demo.currentSubmitReport=run;saveDemo();
  return heading('验证报告',`工单提交 · ${run.id} · ${repaired?'关联 S014 的复跑':'业务检查'}`,button('导出','export')+(good?link('验证目标负载','verify.html?state=load-plan&flow=submit',true):selected.length?link('修复后复测','verify.html?state=replay-prepare&flow=submit',true):link('确认规则','verify.html?state=rules&flow=submit',true)))+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><h2>已确认检查</h2>${pill(!selected.length?'无已确认规则':good?'通过':selected.includes('duplicate')?'业务失败':'无法验证',good?'green':selected.includes('duplicate')?'red':'amber')}</div>${selected.length?selected.map(id=>`<div class="status-row"><strong>${ruleNames[id]}</strong>${pill(repaired||id==='save'?'通过':id==='duplicate'?'业务失败':'无法验证',repaired||id==='save'?'green':id==='duplicate'?'red':'amber')}</div>${detail(ruleNames[id]+' · 请求与断言',submitEvidence(id,repaired))}`).join(''):'<p class="fine">本轮仅记录待定观察。</p>'}</section>${pendingObservations(selected)}${!good?notice('目标负载尚未开放',!selected.length?'先确认规则并重新执行。':'先修复业务失败或补齐证据，通过全部所选检查后再验证目标。'):notice('可验证目标负载','仅纳入本轮已通过的所选检查，待定观察不参与目标判定。','green')}${actions(button('完整证据','submit-proof'),button('复制修复说明','submit-fix'),button('选择下一条流程','next-flow'))}</div><aside class="stack"><section class="card compact-card"><h2>执行范围</h2>${kv('主流程','工单提交')}${kv('已确认检查',selected.length+' 项')}${kv('模板',submitTemplates(selected))}${kv('环境 / 基线','独立副本 / seed-v1')}${kv('代码 / 映射',esc(run.version)+' / '+esc(run.mapping))}${kv('原运行',repaired?'S014 · 保留':'—')}</section>${detail('历史运行',`<a href="report.html?state=submit&flow=submit">S014 · 原业务检查</a><br><a href="report.html?state=submit&flow=submit&case=repaired">S015 · 修复复跑</a>`)}</aside></div>`;
}
function submitLoadReportView(){
  const snapshot=demo.submitLoadReport||{selected:[...selectedSubmit()],config:demo.load||{rate:60,minutes:10,latency:1500,error:1},source:'S015'};
  const selected=snapshot.selected,cfg=snapshot.config,total=cfg.rate*cfg.minutes;
  const passed=state==='load-passed',unknown=state==='load-unknown',failed=state==='load-failed',partial=failed||state==='load-stopped';
  const done=partial?Math.round(total*.6):total,pending=unknown?2:0;
  return heading('验证报告',`工单提交 · SL016 · 来源 ${snapshot.source}`,button('导出','export')+link('查看业务检查','report.html?state=submit&flow=submit'+(snapshot.source==='S015'?'&case=repaired':'')))+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><h2>目标负载结果</h2>${pill(passed?'目标通过':failed?'业务失败':unknown?'无法验证':'目标未完成',passed?'green':failed?'red':'amber')}</div><div class="metrics"><div><span>业务意图</span><strong>${done}</strong></div><div><span>P95 等待</span><strong>${variant==='performance'?1800:820}<small> ms</small></strong></div><div><span>未结算</span><strong>${pending}</strong></div></div><div class="table-wrap"><table><thead><tr><th>业务意图</th><th>请求尝试</th><th>接受意图</th><th>最终记录</th></tr></thead><tbody><tr><td>${done}</td><td>${done+12}</td><td>${done}</td><td>${done-pending+(failed?1:0)}</td></tr></tbody></table></div><div class="status-list">${selected.map(id=>`<div class="status-row"><strong>${ruleNames[id]} v1.0</strong>${pill(unknown?'证据不足':failed?'发现违规':'已观察结果符合规则',unknown?'amber':failed?'red':'green')}</div>`).join('')}</div>${notice(passed?'业务与性能条件共同满足':'本轮不能判目标通过',passed?'仅限所选检查及当前目标、数据与环境。':unknown?'最终查询不完整，保留未知。':failed?'停止派发并结算在途操作，性能达标不覆盖业务违规。':'人工停止或性能条件未满足，已观察结果保留。',passed?'green':'amber')}${detail('账本与证据',`12 次重试使用原意图键，不计为新意图；同一意图最终记录数量单独核对。权限访问探测独立记为接受或预期拒绝，不计作新业务意图。${selected.map(id=>detail(ruleNames[id],submitEvidence(id,!failed))).join('')}`)}</section>${pendingObservations(selected)}</div><aside class="stack"><section class="card compact-card"><h2>本次目标</h2>${kv('操作率 / 时长',cfg.rate+' 次/分钟 / '+cfg.minutes+' 分钟')}${kv('P95 / 错误率',cfg.latency+' ms / '+cfg.error+'%')}${kv('已确认检查',submitTemplates(selected))}${kv('低负载来源',snapshot.source)}${kv('环境','本机副本 / seed-v1')}</section>${detail('结论范围','仅验证确认的提交操作率与时长；累计保留数据，同一意图重试不重复计数。未确认规则不纳入目标结论，不代表最大容量或线上容量。')}</aside></div>`;
}''')

# Same load configuration and snapshot contract for edit and submit.
replace("const cfg=demo.load||{rate:60,minutes:10,latency:1500,error:1};\n  const total", "const cfg=(demo.load?.flow===flow?demo.load:null)||{rate:60,minutes:10,latency:1500,error:1};\n  const loadNames=flow==='submit'?submitTemplates():('字段保持 '+editVersion());\n  const lowSource=flow==='submit'?(demo.currentSubmitReport?.id||'S015'):'R015';\n  const total")
replace("heading('目标负载','编辑工单 · 业务复测已通过')", "heading('目标负载',flowName()+' · 已确认业务检查通过')")
replace("field('load-rate','每分钟编辑次数',cfg.rate", "field('load-rate',flow==='submit'?'每分钟提交次数':'每分钟编辑次数',cfg.rate")
replace("普通用户编辑各自的工单，100% 为标题更新，均匀到达。</textarea>", "${esc(cfg.pattern||(flow==='submit'?'普通用户均匀提交；重试沿用同一意图键。':'普通用户编辑各自工单，100% 标题更新，均匀到达。'))}</textarea>")
replace("已验证字段保持检查覆盖本流程，权限隔离及重复提交不在本次负载结论内。", "已通过检查：${esc(loadNames)}；其他规则仅观察、不参与目标判定。${flow==='submit'?'提交重试沿用意图键；保存、重复数量及跨账号访问按所选规则分别核对。':''}")
replace("${kv('低负载业务','R015 · 通过')}${kv('已验证检查','字段保持 '+(demo.activeVersion||'v1.0'))}", "${kv('低负载业务',lowSource+' · 通过')}${kv('已验证检查',loadNames)}")
replace("`编辑工单 · ${cfg.rate}", "`${flowName()} · ${cfg.rate}")
replace("violation?'优先级发生违规变化'", "violation?(flow==='submit'?'发现所选规则违规':'优先级发生违规变化')")
replace("${kv('适用业务检查','字段保持')}", "${kv('适用业务检查',loadNames)}")
replace("demo.load={rate,minutes,latency,error:err};", "if(flow==='submit'){const run=demo.currentSubmitReport;if(!run?.selected.length||(!run.repaired&&run.selected.some(id=>id!=='save')))return error('需先通过本轮全部已确认业务检查');}else if(isDisabled(editVersion()))return error('所用模板已停用，请先选择有效版本');demo.load={rate,minutes,latency,error:err,flow,selected:[...selectedSubmit()],source:flow==='submit'?demo.currentSubmitReport.id:'R015',pattern:document.querySelector('#load-pattern').value};")

# Migration is bound to the selected flow, fixed versions and a new-project confirmation.
function('transferView',r'''function transferView(){
  const ready=state==='transfer-ready',version=demo.transferTemplate||editVersion(),disabled=flow==='edit'&&isDisabled(version);
  const names=flow==='submit'?submitTemplates():'字段保持 '+version;
  return heading(ready?'第二项目映射试运行完成':'接入第二个项目','activity-app · '+(flow==='submit'?'活动报名':'编辑报名信息'))+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><h2>复用${names}</h2>${pill(disabled?'版本已停用':ready?'映射有效':'待项目确认',disabled||!ready?'amber':'green')}</div><p>${flow==='submit'?'报名提交后字段一致；同一意图重试数量与跨账号访问按所选规则核对。':'仅修改显示名称，报名类别和报名人必须保持不变。'}</p><div class="rule-divider"></div><div class="mapping"><span>创建</span><code>POST /api/registrations</code><span>更新</span><code>PATCH /api/registrations/:id</code><span>查询</span><code>GET /api/registrations/:id · ?intent=</code><span>字段</span><code>title → displayName<br>content → notes<br>priority → category<br>ownerId → userId</code></div>${detail('匹配与边界','只复用固定实验与断言，重新确认身份、对象、字段和完整查询。报名不含支付与名额争抢，不继承旧项目通过结论。')}${disabled?notice('此版本不能推荐或执行','请选择有效版本并重新确认适用条件，或修订候选。'):ready?notice('新项目映射已核对','重新准备独立数据并取得本项目证据。','green'):check('transfer-confirm','确认新项目规则、字段语义、身份和查询范围')}</section><div id="form-error" role="alert"></div>${actions(disabled?button('选择有效版本','transfer-version',true):ready?link('查看复用结果','report.html?state=transfer'+flowQuery(),true):button('确认并试运行新映射','transfer-check',true))}</div><aside class="stack"><section class="card compact-card"><h2>复用边界</h2>${kv('项目','activity-app-test')}${kv('固定模板',names+(disabled?' · 已停用':' · 有效'))}${kv('新映射','registration-v1')}${kv('数据','独立专用测试数据')}</section>${notice('只改映射才算直接复用','修改实验或断言须重新验证与审核。','green')}</aside></div>`;
}
function transferReport(){
  const run=demo.transferRun||{flow,selected:[...selectedSubmit()],template:demo.transferTemplate||editVersion()};
  const submit=run.flow==='submit',disabled=!submit&&isDisabled(run.template);
  return heading('验证报告','activity-app · '+(submit?'活动报名':'编辑报名信息'))+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><h2>新项目${submit?'所选检查':'字段保持'}通过</h2>${pill('历史运行结果','green')}</div>${disabled?notice('所用模板当前已停用','本次历史证据保留，禁止以此版本创建新运行。'):''}${submit?run.selected.map(id=>detail(ruleNames[id]+' v1.0 · 本项目证据',submitEvidence(id,true,true))).join(''):'<p>显示名称更新正确，category 与 userId 保持原值；新身份、对象与完整查询已核对。</p>'}${kv('固定模板',submit?submitTemplates(run.selected):'字段保持 '+run.template)}${kv('映射','registration-v1')}${kv('调整范围','登录、接口、字段、查询映射；实验及断言未变')}${detail('结论范围','只限本项目本轮确认条件，不继承旧网站结果；支付与名额争抢未覆盖。')}</section>${submit?pendingObservations(run.selected,true):''}${actions(button('导出','export'),link('返回项目确认','index.html?state=transfer'+flowQuery()))}</div><aside class="stack">${notice('本项目独立取证','历史结果与当前模板资格分别保存。','green')}</aside></div>`;
}''')
replace("if(action==='transfer-check'){if(!document.querySelector('#transfer-confirm').checked)", "if(action==='transfer-version'){if(isDisabled('v1.1'))return error('暂无有效版本，请修订候选');demo.transferTemplate='v1.1';demo.activeVersion='v1.1';saveDemo();return go('transfer');}\n  if(action==='transfer-check'){if(flow==='edit'&&isDisabled(demo.transferTemplate||editVersion()))return error('所用模板已停用');if(!document.querySelector('#transfer-confirm').checked)")
replace("return error('请确认新项目适用条件与映射');return go('transfer-ready');", "return error('请确认新项目适用条件与映射');demo.transferRun={flow,selected:[...selectedSubmit()],template:demo.transferTemplate||editVersion()};saveDemo();return go('transfer-ready');")

# Package list previews use the last selected export snapshot, without reading/writing files.
function('packageView',r'''function packageView(){
  const ctx=demo.packageContext||{flow:'edit',run:'R014',selected:[],template:'v1.0'};
  flow=ctx.flow;const version=demo.replacement?'v1.1':ctx.template;
  const disabled=flow==='edit'&&isDisabled(version),kind=disabled?'disabled':variant,blocked=kind!=='valid';
  const names=flow==='submit'?submitTemplates(ctx.selected):'字段保持 '+version;
  const reason={disabled:['模板已停用','历史包与证据保留；不能执行停用版本。'],damaged:['验证包完整性不通过','证据引用摘要与清单不一致。'],version:['运行版本不兼容','要求解释器 v2，当前为 v1。']}[kind];
  if(state==='package-passwords')return heading('验证包复跑',flowName()+' · 来源 '+ctx.run)+`<div class="columns"><div class="stack">${credentialCard()}<section class="card"><h2>复跑前确认</h2><div class="check-stack">${check('replay-rule','确认所选模板版本与业务适用条件')}${check('replay-env','确认当前测试副本和数据基线')}${check('replay-old','确认旧写操作已经停止或隔离')}${check('replay-reset','确认可以恢复 seed-v1 并从实验第一步执行')}</div></section><div id="form-error" role="alert"></div>${actions(button('开始复跑','package-run',true))}</div><aside class="stack">${runContract(ctx.run+' → 新运行')}</aside></div>`;
  return heading('加载验证包',flowName()+' · 来自 '+ctx.run)+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><h2>加载前检查</h2>${pill(blocked?'已阻止执行':'检查通过',blocked?'amber':'green')}</div><div class="status-list">${[['包格式与完整性',kind==='damaged'?'不通过':'通过'],['引用路径与边界','通过'],['解释器与运行版本',kind==='version'?'不兼容':'通过'],['固定模板',names+(disabled?' · 已停用':' · 有效')],['已确认规则',flow==='submit'?ctx.selected.map(id=>ruleNames[id]).join('、'):'字段保持'],['环境与数据','复跑前重新确认']].map(([a,b])=>`<div class="status-row"><strong>${a}</strong>${pill(b,/不通过|不兼容|已停用/.test(b)?'amber':'')}</div>`).join('')}</div></section>${blocked?notice(reason[0],reason[1])+actions(button('选择其他验证包','package'),kind==='disabled'?button('选择有效版本并重新确认','package-valid',true):button('返回项目接入','project-home')):notice('可继续准备复跑','重新输入密码，确认规则、版本、环境与复位条件。','green')+actions(button('继续复跑','package-continue',true))}${detail('包内范围',`原运行 ${esc(ctx.run)}，${esc(names)}；规则、项目映射、环境合同、复位要求、所选检查的操作与断言、对应证据引用。待定规则仅带观察说明，无对错结论。无 API Key、密码或 Token。`)}</div><aside class="stack">${runContract(ctx.run)}${notice('历史版本保留','替换模板须重新确认，不改写旧运行。','green')}</aside></div>`;
}''')
replace("<div id=\"dialog-error\" role=\"alert\"></div>`,button('检查并加载','package-select',true));", "${demo.savedPackage?`<div class=\"rule-divider\"></div><p class=\"fine\">最近导出：${esc(demo.savedPackage.flow==='submit'?'工单提交':'编辑工单')} · ${esc(demo.savedPackage.run)}</p>${button('加载最近验证包','package-recent')}`:''}<div id=\"dialog-error\" role=\"alert\"></div>`,button('检查并加载','package-select',true));")
replace("demo.replacement=false;saveDemo();const kind=document.querySelector('input[name=\"package-case\"]:checked')?.value||(demo.disabledTemplate?'disabled':'valid');", "demo.replacement=false;demo.packageContext=demo.savedPackage||{flow,run:flow==='submit'?'S014':'R014',selected:[...selectedSubmit()],template:'v1.0'};saveDemo();const kind=document.querySelector('input[name=\"package-case\"]:checked')?.value||((demo.packageContext.flow==='edit'&&isDisabled(demo.packageContext.template))?'disabled':'valid');")
replace("if(action==='package-valid'){demo.replacement=true;", "if(action==='package-recent'){demo.replacement=false;demo.packageContext={...demo.savedPackage,selected:[...demo.savedPackage.selected]};saveDemo();navigate('index.html?state=package-check&flow='+demo.packageContext.flow);return;}\n  if(action==='package-valid'){if(isDisabled('v1.1'))return error('暂无有效替代版本，请修订候选');demo.replacement=true;")
replace("if(action==='package-continue')return go('package-passwords');", "if(action==='package-continue'){if(flow==='edit'&&isDisabled(demo.replacement?'v1.1':demo.packageContext?.template||'v1.0'))return error('所用版本已停用');return go('package-passwords');}")
start=s.index("  if(action==='package-run'){")
end=s.index('\n',start)
s=s[:start]+r'''  if(action==='package-run'){
    const ctx=demo.packageContext||{flow:'edit',run:'R014',selected:[],template:'v1.0'},version=demo.replacement?'v1.1':ctx.template;
    if(ctx.flow==='edit'&&isDisabled(version))return error('所用模板已停用');
    if(!credentialsValid())return error('请重新输入测试密码');
    if(!['replay-rule','replay-env','replay-old','replay-reset'].every(id=>document.querySelector('#'+id).checked))return error('请确认环境、旧操作和数据复位条件');
    demo.published=true;demo.activeVersion=version;demo.selectedRules=[...ctx.selected];demo.replayRun={version:'demo-2',mapping:'v1.3',template:version,flow:ctx.flow,selected:[...ctx.selected],origin:ctx.run,source:'package'};saveDemo();navigate('verify.html?state=replay-running&flow='+ctx.flow+(demo.replacement?'&case=replacement':''));return;
  }'''+s[end:]
replace("closeModal();return toast('已选择 '+count+' 项导出内容');", "const hasPackage=document.querySelector('.export-part[data-part=\"package\"]:checked');if(hasPackage){const run=flow==='submit'?(state.startsWith('load-')?'SL016':demo.currentSubmitReport?.id||'S014'):state.startsWith('load-')?'L016':state==='replayed'?'R015':'R014';demo.savedPackage={flow,run,selected:flow==='submit'?[...(state.startsWith('load-')?demo.submitLoadReport?.selected||selectedSubmit():demo.currentSubmitReport?.selected||selectedSubmit())]:[],template:flow==='submit'?'v1.0':state==='replayed'||state.startsWith('load-')?demo.replayRun?.template||editVersion():'v1.0'};saveDemo();}closeModal();return toast('已选择 '+count+' 项导出内容');")
replace('<input class="export-part" type="checkbox" checked><span>验证包', '<input class="export-part" data-part="package" type="checkbox" checked><span>验证包')
replace("包含当前运行的规则、版本和证据，不包含凭据。", "${flowName()} · ${flow==='submit'?submitTemplates():'字段保持'}；包含本轮规则、版本与对应证据，不包含凭据。")
replace("if(action==='copy-fix'||action==='proof')", "if(action==='submit-proof'||action==='submit-fix')return modal(action==='submit-proof'?'本轮完整证据':'修复说明',`${selectedSubmit().map(id=>detail(ruleNames[id],submitEvidence(id,!!demo.currentSubmitReport?.repaired),true)).join('')}${pendingObservations(selectedSubmit())}<p class=\"fine\">保留本轮代码、规则、模板、映射、基线及证据引用；修复后按同组已确认规则重新执行。</p>`,button('复制内容','copy-dialog',true));\n  if(action==='copy-fix'||action==='proof')")

p.write_text(s,encoding='utf-8')
for name in ['index.html','verify.html','report.html','settings.html']:
    file=root/name
    file.write_text(file.read_text(encoding='utf-8').replace('preview.js?v=copy-review-5','preview.js?v=defect-fixes-1'),encoding='utf-8')
print('updated preview.js and four cache references')
