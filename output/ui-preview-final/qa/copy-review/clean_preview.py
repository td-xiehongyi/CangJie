from pathlib import Path
import re, json

root = Path(__file__).resolve().parents[2]
p = root / 'preview.js'
s = p.read_text(encoding='utf-8')
changes = []
def swap(old, new):
    global s
    if old not in s:
        raise ValueError('Missing source: ' + old[:90])
    s = s.replace(old, new)
    changes.append({'before': old, 'after': new})

swap("const params = new URLSearchParams(location.search);", "const params = new URLSearchParams(location.search);\nconst inspectMode = params.get('inspect') === '1';\nfunction previewUrl(href) { if(!inspectMode)return href;const u=new URL(href,location.href);if(u.origin===location.origin&&/\\.html$/.test(u.pathname))u.searchParams.set('inspect','1');return u.href; }\nfunction navigate(href){location.href=previewUrl(href);}\nfunction decoratePreviewLinks(){if(inspectMode)document.querySelectorAll('a[href]').forEach(a=>{if(!a.getAttribute('href').startsWith('#'))a.href=previewUrl(a.href);});}")
swap("const q = new URLSearchParams({state,", "const q = new URLSearchParams({state,...(inspectMode?{inspect:'1'}:{}),")
swap('<div class="preview-label">交互预览 · 示例数据</div>', '')
swap('<button class="text-button muted" data-action="scenes">切换示例</button>', '')
swap("function stageBar(active) {", "function stageBar(active) {")
# Keep simulation controls available only in a separate inspection mode.
needle="\n}\nfunction stageBar"
replacement="""
  if(inspectMode)document.querySelector('.top-actions').insertAdjacentHTML('afterbegin','<button class="text-button muted" data-action="scenes">检查状态</button>');
  else {
    const simulationActions=['sample-passwords','replay-passwords','sample-model','repair-example','model-result','business-complete','load-finish','settle','scenes'];
    document.querySelectorAll('[data-action]').forEach(el=>{if(simulationActions.includes(el.dataset.action))el.remove();});
    document.querySelector('#credential-mode')?.remove();
  }
  decoratePreviewLinks();
}
function stageBar"""
swap(needle, replacement)

replacements = {
    "heading('项目接入','选择项目，准备一次可复跑的验证')":"heading('项目接入')",
    "${pill('示例项目')}":"",
    '不保存密码；复跑重新登录':'密码仅本次会话使用',
    "heading('模型设置','预览不会发送项目或凭据')":"heading('模型设置')",
    '填写实际模型名称':'填写模型名称',
    '仅用于演示，不要输入真实密钥':'输入 API Key',
    "notice('示例连接检查通过','协议调用、JSON 输出与字段检查通过；尚未验证真实模型效果。','green')":"notice('连接检查通过','协议与结构化输出检查通过。','green')",
    '此示例包要求解释器 v2，当前示例环境为 v1。':'验证包要求解释器 v2，当前版本为 v1。',
    '开始示例复跑':'开始复跑',
    '选择其他示例包':'选择其他验证包',
    "flow==='edit'?'新业务性质 · 从候选到可复用模板':'复用适用的已发布模板'":"''",
    '未确认规则保留待定，不判定对错。':'未确认项不参与判定。',
    '缺实验，原语足够':'无适用模板',
    '为什么不能直接套用旧模板':'模板匹配依据',
    '已有登录、创建、更新与完整查询能力，缺少“修改标题时其他字段保持不变”的实验。':'当前能力可执行字段保持检查，需生成新候选。',
    '同一流程中其他条件完备的独立检查可继续；不自动转去另一条流程。':'本流程内其他独立检查可继续。',
    '观察样本不足以替代受控端到端。需由开发者审核参考行为和缺陷对照，补齐前不能发布。':'补齐经开发者审核的正常与缺陷对照后继续。补齐前不能发布。',
    '普通使用者无需编写脚本；缺审核者或可信依据时保留候选。':'缺技术审核或可信依据时不能发布。',
    '示例路径，不读取本机项目。规则 v1.0、基线 seed-v1 沿用。':'沿用规则 v1.0 与数据基线 seed-v1。',
    '本次会话可用（示例）':'本次会话可用',
    '仅使用示例密码':'输入测试密码',
    '使用本次会话的示例凭据重新登录；不会沿用旧 Token。':'使用本次会话密码重新登录。',
    '规则、映射及模板有效时可无模型复跑；当前仍是示例状态。':'规则、映射及模板有效时，无需模型重新分析。',
    '示例运行中':'运行中',
    "${pill('示例条件 · 可调整')}":"",
    '此预览只展示字段保持性质。':'',
    '规则变更保存为新依据，不能按当前源码自动放宽；':'规则变更后需重新确认。',
    '模板固定哈希 demo-8d3c（演示标识）。':'模板摘要 demo-8d3c。',
    'demo-8d3c（演示标识）':'demo-8d3c',
    'activity-app · 编辑报名信息 · 迁移示例':'activity-app · 编辑报名信息',
    '工单与报名两个受控样例的映射迁移示例，不代表任意真实网站适配；新项目结果由本项目证据得出，未继承工单项目通过结论。':'结论仅限当前项目、规则与映射；未继承旧项目的通过结论。',
    '本示例只改映射；若新增模板逻辑，应进入新的验证与审核。':'新增模板逻辑须重新验证与审核。',
    '本轮结束后再选下一条，保留已有运行记录。':'一次验证一条流程。',
    '字段保持性质 · 重点展示候选生成':'更新标题，核对其他字段',
    '这是真实业务违规的示例，不说明候选无效。':'业务失败证据与模板资格分别保留。',
    '示例模板 v1.0 已发布，业务失败证据保留':'模板 v1.0 已发布',
    '已复制示例说明':'已复制',
    '复制示例说明':'复制说明',
    '复制示例内容':'复制内容',
    '可直接选择对话框中的示例文字复制':'请选择文字并复制',
    '目标超过本示例内部上限，不能自动提高预算':'目标超过内部执行上限，请调整操作率或时长',
    'API Key 或填入演示配置':'API Key',
    '测试密码或填入示例密码':'测试密码',
    '请补填或使用本次会话示例':'请重新输入',
    '示例凭据与会话状态已清除，没有保存真实密钥':'已清除密钥与会话状态',
    '示例：模型调用超时。':'模型调用超时。',
    '示例：达到有限步骤/调用/时间预设之一。':'达到步骤、调用或时间上限。',
    '示例完整运行':'完整运行',
}
for old,new in replacements.items(): swap(old,new)

# Correct unknown-result language; do not call missing evidence a business defect.
swap(":notice('目标负载未测','本轮已证明业务错误，修复并复测后再运行。')", ":notice('目标负载未测',unknown?'补齐最终取证并通过业务验证后再运行。':'先修复业务错误并通过复测。')")
swap("<p>规则、映射与基线相同，代码版本不同。历史记录不覆盖，新记录关联原运行。</p>", "<p>每轮保留所用版本与证据，新记录关联原运行。</p>")
swap("link('重新接入该流程','index.html?state=mapping',true))}</section>", "button('补充取证信息','evidence-input',true))}</section>")
swap("if(state==='transfer'||state==='transfer-ready')return transferView();", "if(state==='service-blocked'||state==='evidence-input')return accessGapView();\n  if(state==='transfer'||state==='transfer-ready')return transferView();")
swap("if(state==='model-paused'||state==='budget-paused')return pausedView();", "if(state==='reset-blocked')return resetBlockedView();\n  if(state==='model-paused'||state==='budget-paused')return pausedView();")
swap("${actions(button('开始目标负载','load-start',true))}", "${actions(button('不确定目标','load-guide'),button('开始目标负载','load-start',true))}")
swap("${actions(button('查看验证证据','review-proof'))}</section>", "${actions(button('查看验证证据','review-proof'),button('生成修订候选','template-revise'),button('停用此版本','template-disable'))}</section>")
swap("${pill('已发布','green')}</div>${notice('固定版本，可按适用条件复用'", "${pill(demo.disabledTemplate?'已停用':'已发布',demo.disabledTemplate?'amber':'green')}</div>${notice(demo.disabledTemplate?'已停止推荐与执行':'固定版本，可按适用条件复用'")
swap("demo.published&&variant!=='new'", "demo.published&&!demo.disabledTemplate&&variant!=='new'")
swap("if(action==='package-select'){demo.replacement=false;saveDemo();const kind=document.querySelector('input[name=\"package-case\"]:checked').value;", "if(action==='package-select'){if(!inspectMode&&!document.querySelector('#package-file')?.files.length)return error('请选择验证包');demo.replacement=false;saveDemo();const kind=document.querySelector('input[name=\"package-case\"]:checked')?.value||(demo.disabledTemplate?'disabled':'valid');")

# Final-facing file selection; case choices only belong to inspection tooling.
start=s.index('function packageModal() {')
end=s.index('\nfunction error(',start)
s=s[:start]+'''function packageModal() {
  modal('加载验证包',`<div class="field"><label for="package-file">验证包文件</label><input id="package-file" type="file" accept=".zip,.json"></div>${inspectMode?`<div class="package-options">${[['valid','有效版本'],['disabled','模板已停用'],['damaged','完整性不符'],['version','版本不兼容']].map(([id,title],i)=>`<label><input type="radio" name="package-case" value="${id}" ${i===0?'checked':''}><span>${title}</span></label>`).join('')}</div>`:''}<div id="dialog-error" role="alert"></div>`,button('检查并加载','package-select',true));
}
''' + s[end:]
swap("document.querySelector('#app').inert=true;", "decoratePreviewLinks();\n  document.querySelector('#app').inert=true;")
swap("<p class=\"fine\">只切换演示结果，不读取参考服务或文件。</p>", '')
swap('示例对照状态','对照状态')
swap('开始示例重检','重新检查')
# Ready/missing radio is a mock fixture, never a final product selector.
swap('<div class="field"><label for="reference-case">对照状态</label><select id="reference-case"><option value="missing">仍缺所有者变更对照</option><option value="ready">对照已补齐</option></select></div>', '${inspectMode?\'<div class="field"><label for="reference-case">对照状态</label><select id="reference-case"><option value="missing">仍缺所有者变更对照</option><option value="ready">对照已补齐</option></select></div>\':\'\'}')
swap("document.querySelector('#reference-case').value!=='ready'", "inspectMode&&document.querySelector('#reference-case').value!=='ready'")

# New previews remain local state/form transitions, without file/network/process execution.
insert=s.index('function referenceRequirements()')
s=s[:insert]+'''function accessGapView(){
  const service=state==='service-blocked';
  return heading(service?'需要配置测试服务':'补充取证信息')+`<div class="columns"><div class="stack">${notice(service?'外部服务检查已暂停':'最终结果查询不完整',service?'请配置测试服务；其他独立检查可继续。':'补充同一对象的完整查询入口。')}<section class="card">${field('query-endpoint',service?'测试服务地址':'HTTP 查询入口','','url','placeholder="https://"')}<div class="field"><label for="query-notes">${service?'测试配置说明':'接口说明或查询页面线索'}</label><textarea id="query-notes"></textarea></div>${check('query-confirm',service?'确认仅调用测试服务':'确认查询对象、身份和完整字段')}</section><div id="form-error" role="alert"></div>${actions(button('重新检查接入','gap-recheck',true))}</div><aside class="stack">${runContract('待补充')}${detail('受影响检查',service?'依赖外部服务的检查暂停，不调用真实付费或通知服务。':'缺字段或关联不明时保留无法验证，不判业务失败。')}</aside></div>`;
}
function resetBlockedView(){return heading('数据复位失败')+`<div class="columns"><div class="stack">${notice('实验尚未开始','无法恢复 seed-v1。修复初始化或隔离条件后重试。')}<section class="card"><h2>保留状态</h2>${kv('原运行','R014 · 未完成')}${kv('本次判定','尚未验证')}${detail('处理要求','核对测试副本、初始化入口和旧写操作；复位成功后从实验第一步执行。',true)}</section>${actions(button('重新核对复跑条件','recover',true))}</div><aside class="stack">${runContract('R014')}</aside></div>`;}

''' + s[insert:]
insert=s.index("  if(action==='repair-example')")
s=s[:insert]+'''  if(action==='evidence-input'){return navigate('index.html?state=evidence-input');}
  if(action==='gap-recheck'){if(!document.querySelector('#query-endpoint').value.trim()&&!document.querySelector('#query-notes').value.trim())return error('请补充地址或说明');if(!document.querySelector('#query-confirm').checked)return error('请确认测试服务或取证条件');return go('mapping');}
  if(action==='load-guide')return modal('确定负载目标',`<div class="field"><label for="usage-notes">预期使用方式与集中程度</label><textarea id="usage-notes" placeholder="例如：高峰十分钟内，用户均匀编辑各自工单"></textarea></div>${field('usage-rate','预计每分钟操作次数','','number','min="1"')}${field('usage-wait','可接受等待（毫秒）','','number','min="1"')}<div id="dialog-error" role="alert"></div>`,button('带入目标并确认','load-guide-apply',true));
  if(action==='load-guide-apply'){const rate=+document.querySelector('#usage-rate').value,latency=+document.querySelector('#usage-wait').value,notes=document.querySelector('#usage-notes').value.trim();if(!notes||rate<=0||latency<=0)return error('请补充使用方式、预计操作次数与等待时间');closeModal();document.querySelector('#load-rate').value=rate;document.querySelector('#load-latency').value=latency;document.querySelector('#load-pattern').value=notes;document.querySelector('#load-confirm').checked=false;return;}
  if(action==='template-disable')return modal('停用模板版本',`<p>停用后不再推荐或执行此版本，历史报告保留。</p><div class="field"><label for="disable-reason">停用原因</label><textarea id="disable-reason"></textarea></div><div id="dialog-error" role="alert"></div>`,button('确认停用','template-disable-confirm',true));
  if(action==='template-disable-confirm'){if(!document.querySelector('#disable-reason').value.trim())return error('请填写停用原因');demo.disabledTemplate=true;saveDemo();closeModal();return render();}
  if(action==='template-revise'){return navigate('verify.html?state=generated&case=new');}
  if(action==='export-selected'){const count=document.querySelectorAll('.export-part:checked').length;if(!count)return error('请选择导出内容');closeModal();return toast('已选择 '+count+' 项导出内容');}
''' + s[insert:]

start=s.index("  if(action==='export')")
end=s.index('\n});',start)
s=s[:start]+'''  if(action==='export')return modal('导出',`<div class="check-stack"><label class="check"><input class="export-part" type="checkbox" checked><span>Markdown 报告</span></label><label class="check"><input class="export-part" type="checkbox" checked><span>证据文件</span></label><label class="check"><input class="export-part" type="checkbox" checked><span>验证包</span></label></div><p class="fine">包含当前运行的规则、版本和证据，不包含凭据。</p><div id="dialog-error" role="alert"></div>`,button('导出所选内容','export-selected',true));
''' + s[end:]

# Preserve selected flow when returning from repair replay.
swap("state==='replay-running'?'replayed':'published'", "state==='replay-running'?'replayed':'published'")
swap("flow==='submit'?'submit&flow=submit':state==='replay-running'?'replayed':'published'", "flow==='submit'?(state==='replay-running'?'submit&flow=submit&case=repaired':'submit&flow=submit'):state==='replay-running'?'replayed':'published'")
swap("selected.map(x=>`<div class=\"status-row\"><div><strong>${names[x]}</strong><p>${x==='duplicate'", "selected.map(x=>`<div class=\"status-row\"><div><strong>${names[x]}</strong><p>${variant==='repaired'?'已复位并重新执行，最终结果符合规则。':x==='duplicate'")
swap("${pill(x==='duplicate'?'业务失败':x==='permission'?'无法验证':'通过',x==='duplicate'?'red':x==='permission'?'amber':'green')}", "${pill(variant==='repaired'?'通过':x==='duplicate'?'业务失败':x==='permission'?'无法验证':'通过',variant==='repaired'?'green':x==='duplicate'?'red':x==='permission'?'amber':'green')}")
swap("selected.includes('duplicate')?'目标负载已暂停':'未自动开展目标负载'", "variant==='repaired'?'业务复测通过':selected.includes('duplicate')?'目标负载已暂停':'未自动开展目标负载'")
swap("selected.includes('duplicate')?'先修复重复创建并通过业务复测。':'仅报告本轮已确认检查，不将未执行项算通过。'", "variant==='repaired'?'新记录关联原运行，所选检查保持不变。':selected.includes('duplicate')?'先修复重复创建并通过业务复测。':'仅报告本轮已确认检查，不将未执行项算通过。'")

# Route explicit navigation through a preview-only query decorator.
s=re.sub(r"location\.href=([^;]+);", r"navigate(\1);", s)
s=s.replace('function navigate(href){navigate(previewUrl(href));}', 'function navigate(href){location.href=previewUrl(href);}')
p.write_text(s,encoding='utf-8')
(Path(__file__).parent/'copy-changes.json').write_text(json.dumps(changes,ensure_ascii=False,indent=2),encoding='utf-8')
print('Applied',len(changes),'targeted copy and preview coverage updates.')
