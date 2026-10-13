/* Interactive design preview only. No network, process, model, vault or real file operations. */
'use strict';
const page = document.body.dataset.page;
const params = new URLSearchParams(location.search);
let state = params.get('state') || ({project:'setup',verify:'rules',report:'published',settings:'empty'}[page]);
let flow = params.get('flow') || 'edit';
let variant = params.get('case') || 'valid';
const storageKey = 'website-verification-preview-final';
let demo = {};
let modelDirty = false;
try { demo = JSON.parse(sessionStorage.getItem(storageKey) || '{}'); } catch {}
let reportTab=params.get('tab')||(state==='review'||state==='qualification'?'qualification':'business');
if(state==='qualification')state=params.get('run')||'published';
document.documentElement.dataset.theme='blue';
function saveDemo() { try { sessionStorage.setItem(storageKey, JSON.stringify(demo)); } catch {} }
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pill = (text,tone='') => `<span class="pill ${tone}">${text}</span>`;
const button = (text,action,primary=false,extra='') => `<button class="btn ${primary?'primary':''}" data-action="${action}" ${extra}>${text}</button>`;
const link = (text,href,primary=false) => `<a class="btn ${primary?'primary':''}" href="${href}">${text}</a>`;
const detail = (label,body,open=false) => `<details class="disclosure" ${open?'open':''}><summary>${label}</summary><div class="details-body">${body}</div></details>`;
const kv = (label,value) => `<div class="kv-pair"><span>${label}</span><span>${value}</span></div>`;
const check = (id,label) => `<label class="check"><input type="checkbox" id="${id}"><span>${label}</span></label>`;
const notice = (title,body,tone='amber') => `<div class="notice ${tone}" role="status"><strong>${title}</strong>${body?`<p>${body}</p>`:''}</div>`;
const actions = (...items) => `<div class="actions">${items.join('')}</div>`;
const field = (id,label,value='',type='text',extra='') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" ${extra}></div>`;
const heading = (title,sub='',right='') => `<div class="page-heading"><div><h1 tabindex="-1">${title}</h1>${sub?`<p class="meta">${sub}</p>`:''}</div>${right?`<div class="heading-actions">${right}</div>`:''}</div>`;
const flowName = () => flow==='submit' ? '工单提交' : '编辑工单';
function go(next,extra={}) {
  state=next; if(extra.flow)flow=extra.flow;if(extra.case)variant=extra.case;
  const q = new URLSearchParams({state,...(page==='report'&&reportTab==='qualification'?{tab:'qualification'}:{}),...(page==='verify'?{flow}:{}),...(variant!=='valid'?{case:variant}:{})});
  history.replaceState(null,'',location.pathname+'?'+q);
  render(); document.querySelector('main h1')?.focus({preventScroll:true}); window.scrollTo(0,0);
}
function shell(content) {
  document.querySelector('#app').innerHTML=`<a class="skip" href="#content">跳到内容</a><div class="app"><aside class="sidebar"><a class="brand plain-brand" href="index.html">网站验证</a><nav class="nav" aria-label="主要导航">${[['project','index.html','项目接入'],['verify','verify.html','业务验证'],['report','report.html'+esc(demo.reportQuery||'?state=published'),'验证报告']].map(([id,href,label])=>`<a href="${href}" ${page===id?'class="active" aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="side-end"><a class="settings-link ${page==='settings'?'active':''}" href="settings.html" ${page==='settings'?'aria-current="page"':''}>模型设置</a><div class="preview-label">交互预览 · 示例数据</div></div></aside><div class="main"><header class="topbar"><div class="project-name"><span>${state.startsWith('transfer')?'activity-app':'ticket-app'}</span><span class="env">测试副本</span></div><div class="top-actions"><button class="text-button muted" data-action="scenes">切换示例</button><button class="text-button" data-action="package">加载验证包</button></div></header><main class="page" id="content">${content}</main></div></div>`;
}
function stageBar(active) {
  return `<ol class="stagebar" aria-label="候选模板阶段">${['规则确认','候选生成','分层验证','审核发布','复跑'].map((x,i)=>`<li class="${i<active?'complete':i===active?'current':''}" ${i===active?'aria-current="step"':''}><span>${String(i+1).padStart(2,'0')}</span>${x}</li>`).join('')}</ol>`;
}
function scopeCard() {
  return `<section class="card compact-card"><div class="card-header"><h2>发送范围</h2><button class="text-button" data-action="scope">调整</button></div><dl class="scope-list"><div class="kv"><dt>模型服务</dt><dd>${demo.customService?'api.example.test':'api.deepseek.com'}</dd></div><div class="kv"><dt>所选文件</dt><dd class="paths">src/routes/tickets.ts<br>src/auth.ts · package.json${demo.extraScope?'<br>src/services/ticket-service.ts':''}</dd></div></dl><p class="scope-note">仅相关摘要与源码片段，排除凭据、环境文件和数据库。</p>${check('scope-consent','同意发送以上内容')}</section>`;
}
function environmentCard() {
  return `<section class="card compact-card"><h2>测试环境</h2>${kv('源码副本','ticket-app-test')}${kv('独立数据库','ticket-test.sqlite')}${kv('数据来源','已有测试初始化入口')}<div class="rule-divider"></div>${check('env-consent','确认测试副本与专用测试数据')}</section>`;
}
function mappingDetails() {
  return detail('接口映射与取证',`<div class="mapping"><span>登录</span><code>POST /api/login → token</code><span>创建</span><code>POST /api/tickets → id</code><span>更新</span><code>PATCH /api/tickets/:id</code><span>查询</span><code>GET /api/tickets/:id</code></div><p>查询字段：id、title、priority、ownerId。按对象 ID 和登录身份关联，单对象完整查询。</p><p>映射 v1.3 · 模板资格与项目接入有效性分别核对。</p>`);
}
function projectView() {
  if(state==='transfer'||state==='transfer-ready')return transferView();
  if(state.startsWith('package')) return packageView();
  if(state==='checking'||state==='ready'||state==='init-blocked'||state==='mapping') {
    const blocked=state==='init-blocked',ready=state==='ready',mapping=state==='mapping';
    return heading(blocked?'需要补齐测试数据':mapping?'确认当前项目映射':ready?'项目已准备好':'检查项目接入','ticket-app · 独立测试副本')+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><h2>${blocked?'初始化条件不足':mapping?'操作与查询':'接入检查'}</h2>${pill(blocked?'受阻':ready?'已完成':mapping?'待确认':'检查中',blocked?'amber':ready?'green':'')}</div><div class="status-list">${[['项目启动','Node.js / Express · 可启动','通过'],['账号身份','user_a / user_b · Token 登录','通过'],['测试数据',blocked?'缺少可靠初始化与重置入口':'专用测试数据 · 独立数据库',blocked?'受阻':'通过'],['接口试运行',ready?'身份、对象、查询字段完整':'等待确认后试运行',ready?'通过':'待执行']].map(([a,b,c])=>`<div class="status-row"><div><strong>${a}</strong><p>${b}</p></div>${pill(c,c==='通过'?'green':c==='受阻'?'amber':'')}</div>`).join('')}</div></section>${blocked?notice('受影响的检查已暂停','需要用户甲/乙及各自拥有的工单；初始状态可恢复。其他独立检查可继续。')+detail('补充说明与补齐条件','准备两个普通用户，各有一张可查询工单；提供仅作用于测试库的初始化和重置入口，清理旧写操作后恢复同一基线。补齐后核对作用目标、账号角色、数据归属及查询完整性。工具不会生成脚本或修改源码。',true)+actions(button('复制补充说明','copy-init'),button('补齐后重新检查','recheck',true)):mapping?mappingDetails()+`<section class="card">${check('mapping-confirm','确认接口、账号身份、字段与查询范围')}</section>`+actions(button('确认并试运行','mapping-check',true)):ready?notice('接入条件已核对',demo.returnToReplay?'新映射 v1.4 已确认；沿用原规则，返回复跑准备重新登录。':'下一步选择一条主流程。业务规则仍需单独确认。','green')+actions(demo.returnToReplay?link('返回复跑准备','verify.html?state=replay-prepare',true):link('选择业务流程','verify.html?state=rules&flow=edit',true)):actions(button('查看检查结果','access-result',true))}</div><aside class="stack"><section class="card compact-card"><h2>本次接入</h2>${kv('操作目标','ticket-app-test')}${kv('测试账号','user_a / user_b')}${kv('数据基线','seed-v1')}${kv('项目内容发送','已确认范围内')}</section>${detail('数据与凭据','仅使用专用测试数据，不复制原业务数据库。测试密码仅本次会话有效，Token 仅本次运行内存使用。')}</aside></div>`;
  }
  return heading('项目接入','选择项目，准备一次可复跑的验证')+`<div class="columns"><div class="stack">${demo.modelReady?'':notice('模型尚未配置',`首次分析前需填写模型并检查输出。<a href="settings.html">前往模型设置</a>`) }<section class="card"><div class="card-header"><h2>项目信息</h2>${pill('示例项目')}</div><div class="field"><label for="directory">项目目录</label><div class="inline-field"><input id="directory" value="C:\\demo\\ticket-app" readonly><button class="btn" data-action="directory">选择目录</button></div></div><div class="field"><label for="purpose">网站用途</label><textarea id="purpose">用户提交和编辑工单，查看处理进度。</textarea></div></section><section class="card"><div class="card-header"><h2>测试账号</h2><span class="fine">两个普通用户</span></div><div class="account-row">${field('account-a','用户甲','user_a')}${field('password-a','测试密码','','password','placeholder="本次会话使用" autocomplete="off"')}</div><div class="account-row">${field('account-b','用户乙','user_b')}${field('password-b','测试密码','','password','placeholder="本次会话使用" autocomplete="off"')}</div><div class="card-footer"><span class="fine">不保存密码；复跑重新登录</span><button class="text-button" data-action="sample-passwords">填入示例密码</button></div></section><div id="form-error" role="alert"></div>${actions(button('开始分析','analyze',true))}</div><aside class="stack">${scopeCard()}${environmentCard()}</aside></div>`;
}
function packageView() {
  const blocked=variant!=='valid';
  const reason={disabled:['模板已停用','字段保持 v1.0 已停用，历史报告保留，不能直接执行。'],damaged:['验证包完整性不通过','证据引用的摘要与包清单不一致，不能加载执行。'],version:['运行版本不兼容','此示例包要求解释器 v2，当前示例环境为 v1。']}[variant];
  if(state==='package-passwords') return heading('验证包复跑','编辑工单 · 无需 AI 重新分析')+`<div class="columns"><div class="stack">${credentialCard()}<section class="card"><h2>复跑前确认</h2><div class="check-stack">${check('replay-rule','确认所选模板版本与业务适用条件')}${check('replay-env','确认当前测试副本和数据基线')}${check('replay-old','确认旧写操作已经停止或隔离')}${check('replay-reset','确认可以恢复 seed-v1 并从实验第一步执行')}</div></section><div id="form-error" role="alert"></div>${actions(button('开始示例复跑','package-run',true))}</div><aside class="stack">${runContract('R014 → 新运行')} ${notice('保留历史','本次执行创建关联的新记录，不覆盖原报告。','green')}</aside></div>`;
  return heading('加载验证包','ticket-title-check · 来自运行 R014')+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><h2>加载前检查</h2>${pill(blocked?'已阻止执行':'检查通过',blocked?'amber':'green')}</div><div class="status-list">${[['包格式与完整性',variant==='damaged'?'不通过':'通过'],['引用路径与边界','通过'],['解释器与运行版本',variant==='version'?'不兼容':'通过'],['模板资格',variant==='disabled'?'已停用':demo.replacement?'有效 · 字段保持 v1.1':'有效 · 字段保持 v1.0'],['环境与数据要求','待在复跑前确认']].map(([a,b])=>`<div class="status-row"><strong>${a}</strong>${pill(b,/不通过|不兼容|已停用/.test(b)?'amber':b.includes('待')?'':'green')}</div>`).join('')}</div></section>${blocked?notice(reason[0],reason[1])+actions(button('选择其他示例包','package'),variant==='disabled'?button('选择有效版本并重新确认','package-valid',true):button('返回项目接入','project-home')):notice('可在本工具内复跑','规则、映射和模板版本有效；重新输入测试密码并核对测试条件后运行。','green')+actions(button('继续复跑','package-continue',true))}${detail('包内内容','规则 v1.0、映射 v1.3、原始字段保持 v1.0 引用、初始化和复位要求、环境合同、操作与断言、证据引用及摘要。无 API Key、测试密码、Token 或隐藏对照答案。')}</div><aside class="stack">${runContract(demo.replacement?'本次复跑 · 来源 R014':'原运行 R014')}${detail('范围','验证包依赖本工具和支持的执行环境，不是独立脚本包。更换模板版本后需重新确认，不改写旧报告。')}</aside></div>`;
}
function runContract(run='R014') {
  return `<section class="card compact-card"><h2>运行条件</h2>${kv('运行',run)}${kv('主流程',page==='verify'?flowName():'编辑工单')}${kv('规则 / 映射','v1.0 / '+(run==='R014 → 新运行'?'v1.3':run==='R015'?(demo.replayRun?.mapping||'v1.3'):run.includes('015')?(demo.repair?.mapping||'v1.3'):'v1.3'))}${kv('模板',flow==='submit'?'已确认检查的固定版本':run.startsWith('候选')?'候选 v0.2':(variant==='replacement'||demo.replacement&&page==='project'&&state.startsWith('package'))?'字段保持 v1.1':'字段保持 v1.0')}${kv('环境 / 基线','测试副本 / seed-v1')}${kv('取证','完整 HTTP 查询')}</section>`;
}
function settingsView() {
  const ready=state==='connected'||state==='saved',failure=state==='failed',vault=state==='vault-failed',checking=state==='checking';
  return heading('模型设置','预览不会发送项目或凭据')+`<div class="settings-container stack"><section class="card settings-card"><div class="card-header"><h2>模型服务</h2><button class="text-button" data-action="sample-model">填入演示配置</button></div><div class="field"><label for="provider">服务</label><select id="provider"><option value="official">DeepSeek 官方</option><option value="custom" ${demo.customService?'selected':''}>自定义地址</option></select></div>${field('endpoint','接口地址',demo.customService?'https://api.example.test':'https://api.deepseek.com','url','spellcheck="false"')}${field('model-name','模型名称',(ready||failure||vault||checking)?'demo-model':'','text','placeholder="填写实际模型名称" autocomplete="off"')}${field('api-key','API Key',(ready||failure||vault||checking)?'preview-only':'','password','placeholder="仅用于演示，不要输入真实密钥" autocomplete="off"')}${check('remember-key','记住 API Key')}<div class="rule-divider"></div>${detail('存储与兼容范围','Chat Completions + JSON 输出。必须通过协议和结构化输出检查，HTTP 成功不单独代表兼容。记住密钥使用系统凭据存储，不可用则退回仅本次会话；测试密码不持久化。')}<div id="form-error" role="alert"></div>${ready?notice('示例连接检查通过','协议调用、JSON 输出与字段检查通过；尚未验证真实模型效果。','green'):failure?notice('结构化输出检查未通过','服务有响应，但返回内容缺少所需字段；依赖模型的步骤保持暂停。'):vault?notice('系统凭据存储不可用','退回仅本次会话使用，不会明文保存。'):checking?notice('正在检查连接','检查协议调用与结构化输出，不发送项目源码。','green'):''}<div class="settings-actions"><button class="text-button subtle-link" data-action="clear-key">清除已存密钥</button><div>${checking?button('显示示例检查结果','model-result',true):button('检查连接','model-check')}${button(ready?'保存并返回项目':'保存','model-save',ready)}</div></div></section>${demo.scopeInvalid?notice('项目发送范围需重新确认','模型服务地址已变化，原发送确认不再适用。'):''}</div>`;
}

function ruleCard() {
  const rules = flow==='submit' ? [
    ['save','提交后能查到工单，标题与内容一致','保存结果 v1.0'],
    ['duplicate','同一次提交重试，只生成一张工单','重复提交 v1.0'],
    ['permission','用户不能查看他人的工单','权限隔离 v1.0']
  ] : [['invariant',demo.ruleText||'只修改标题时，优先级和所有者保持不变',demo.published&&variant!=='new'?'字段保持 '+(demo.activeVersion||'v1.0'):'无适用模板']];
  return `<section class="card"><div class="card-header"><h2>确认业务规则</h2><span class="fine" id="rule-count">0/${rules.length} 已确认</span></div>${rules.map(([id,text,template])=>`<div class="rule-row"><input id="rule-${id}" class="rule-confirm" type="checkbox" aria-label="确认${id==='invariant'?'字段保持':id==='save'?'保存结果':id==='duplicate'?'重复提交':'权限隔离'}规则"><div class="rule-body"><div class="title">${esc(text)}</div><div class="sub">${pill(template,template==='无适用模板'?'amber':'green')}<span class="rule-state">待确认</span></div></div>${flow==='edit'?'<button class="text-button" data-action="edit-rule">编辑</button>':''}</div>`).join('')}</section>`;
}
function verifyAside() {
  return `<aside class="stack"><section class="card compact-card"><div class="card-header"><h2>执行范围</h2>${pill('1 条流程')}</div>${kv('主流程',flowName())}${kv('测试身份','user_a / user_b')}${kv('测试环境','独立副本 · seed-v1')}${kv('最终取证','HTTP 查询')}</section>${mappingDetails()}${detail('规则与适用条件','只更新标题，不包含转交、优先级变更或其他业务动作。必须能查询同一对象的完整 title、priority、ownerId；字段缺失时保留无法验证。')}</aside>`;
}
function candidateDefinition(strict=true) {
  return `<ol class="experiment-steps"><li><strong>建立初始状态</strong><p>用户甲创建高优先级工单，查询并保存 id、priority、ownerId。</p></li><li><strong>只修改标题</strong><p>使用甲的身份更新同一张工单，确认请求被接受。</p></li><li><strong>查询最终结果</strong><p>标题等于新值；优先级等于操作前值；${strict?'所有者严格等于原值':'所有者按候选包含关系检查（待验证）'}。</p></li></ol>`;
}
function evidenceTable(mode='samples',failed=false) {
  const rows = [['正常更新','通过','通过'],['优先级被重置','业务失败','业务失败'],['所有者被改变','业务失败',failed?'通过':'业务失败'],['缺少最终字段','无法验证','无法验证']];
  return `<div class="table-wrap"><table><caption class="sr-only">${mode==='e2e'?'受控 HTTP':'观察样本'}对照结果</caption><thead><tr><th>对照场景</th><th>预期判定</th><th>实际判定</th><th>检查结果</th></tr></thead><tbody>${rows.map(([a,b,c])=>`<tr><td>${a}</td><td>${b}</td><td>${c}</td><td>${pill(b===c?'符合预期':'未检出缺陷',b===c?'green':'red')}</td></tr>`).join('')}</tbody></table></div>`;
}
function layerList(current) {
  const levels=['定义检查','独立样本','受控端到端','项目试运行'];
  return `<section class="card compact-card"><h2>验证层次</h2><ol class="layer-list">${levels.map((x,i)=>`<li><span>${x}</span>${pill(i<current?'已完成':i===current?'当前':'待执行',i<current?'green':'')}</li>`).join('')}</ol><p class="fine">每轮重新验证，标准与业务规则保持不变。</p></section>`;
}
function verifyView() {
  if(state==='model-paused'||state==='budget-paused')return pausedView();
  if(state.startsWith('load')) return loadView();
  if(['replay-prepare','replay-running','interrupted','business-running'].includes(state)) return businessView();
  const title=heading(flowName(),flow==='edit'?'新业务性质 · 从候选到可复用模板':'复用适用的已发布模板',button('更换流程','flow'));
  if(state==='rules') return title+(flow==='edit'?stageBar(0):'')+`<div class="columns"><div class="stack">${ruleCard()}<p class="fine">未确认规则保留待定，不判定对错。</p><div id="form-error" role="alert"></div>${actions(button(flow==='submit'||(demo.published&&variant!=='new')?'确认并验证':'确认并检查能力','rules-next',true))}</div>${verifyAside()}</div>`;
  if(state==='gap') {
    const kind=params.get('kind')||variant;
    const gaps={mapping:['缺少接口映射','已支持更新操作，但当前项目的字段和查询范围还未确认。','补映射','mapping'],capability:['缺少底层执行能力','此业务依赖首版不支持的浏览器操作或协议，不能用生成代码绕过。','查看补充要求','capability-note'],rule:['业务规则尚未决定','优先级是否允许重置尚未确认。可以保留观察，不能判通过或失败。','返回确认规则','rule-return'],reference:['缺少可信对照','可保存候选草稿；独立正确行为和缺陷对照不足，暂不进入技术准入。','保存草稿','save-draft']};
    const gap=gaps[kind];
    return title+stageBar(1)+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><h2>${gap?gap[0]:'可以生成新候选'}</h2>${pill(gap?'需要补充':'缺实验，原语足够',gap?'amber':'green')}</div><p class="body-copy">${gap?gap[1]:'已有登录、创建、更新与完整查询能力，缺少“修改标题时其他字段保持不变”的实验。'}</p><div class="rule-divider"></div><div class="capabilities"><span>登录</span><span>创建</span><span>更新</span><span>查询</span><span>字段比较</span></div>${detail('为什么不能直接套用旧模板','保存结果检查提交字段，重复提交检查同一意图数量，权限隔离检查跨账号访问；均不包含更新前后字段保持的完整步骤与断言。')}</section>${gap?notice('只暂停受影响的检查','同一流程中其他条件完备的独立检查可继续；不自动转去另一条流程。'):notice('先验证实验，再验证项目','生成结果先作为草稿，不立即在项目执行。','green')}${actions(button(gap?gap[2]:'生成候选',gap?gap[3]:'generate',true))}</div>${verifyAside()}</div>`;
  }
  if(state==='generated'||state==='draft') return title+stageBar(1)+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><h2>字段保持实验</h2>${pill('候选 v0.1 · 草稿','amber')}</div>${candidateDefinition(false)}</section>${detail('断言与执行限制','候选断言：title 等于新标题；priority 等于操作前值；ownerId 使用包含关系。该提议尚未证明符合规则，需要独立验证。使用注册 HTTP 操作及有限字段比较；缺字段或关联失败为无法验证。无任意脚本、源码写入或无界循环。')}<div class="next-action"><span class="fine">首次生成后最多自动修订 2 轮</span>${button('开始验证候选','validate',true)}</div></div><aside class="stack">${layerList(0)}${detail('版本与依据','规则 v1.0 已冻结 · 候选 v0.1 · 生成器 demo-model。候选不能自行发布，也不能读取隐藏评估答案。')}</aside></div>`;
  if(state==='reference-rechecked') return title+stageBar(2)+`<div class="columns"><div class="stack">${notice('可信对照重检通过','候选 v0.2 · 第 2 次尝试 · 已修订 1/2 轮，规则与计数未重置。','green')}<section class="card"><div class="card-header"><h2>受控 HTTP 端到端</h2>${pill('符合预期','green')}</div>${evidenceTable('e2e')}${detail('本次对照依据',`参考版本 ${esc(demo.reference||'ref-crud-v2')} · 开发者独立审核，正常、优先级重置、所有者改变与证据不足对照覆盖。适用范围未扩大，隐藏变体未反馈生成器。`,true)}</section>${actions(button('在项目副本试运行','trial',true))}</div><aside class="stack">${layerList(3)}</aside></div>`;
  const failed=state==='validation-failed', exhausted=state==='exhausted', samples=state==='samples',e2e=state==='e2e',trial=state==='trial',waiting=state==='waiting-reference';
  if(waiting||exhausted) return title+stageBar(2)+`<div class="columns"><div class="stack">${notice(waiting?'等待可信对照':'候选尝试已达上限',waiting?'观察样本不足以替代受控端到端。需由开发者审核参考行为和缺陷对照，补齐前不能发布。':'首次生成和两轮修订仍未通过。草稿、各轮原因和计数已保留，不能自动重开绕过上限。')}<section class="card"><h2>已保留的内容</h2>${kv('规则','v1.0 · 不放宽')}${kv('候选',waiting?'v0.2 · 待对照':'v0.3 · 未准入')}${kv('尝试次数',waiting?'2 / 3':'3 / 3')}${detail('诊断记录',waiting?'缺少覆盖所有者变更的可信 HTTP 缺陷对照。':'各轮仍存在漏检或误判；未执行项目正式验证，业务结论未知。',true)}</section>${waiting?actions(button('复制待补要求','reference-note'),button('补齐后重新检查','reference-recheck',true)):actions(button('查看其他示例','scenes'),link('返回规则','verify.html?state=rules&flow=edit'))}</div><aside class="stack">${layerList(waiting?2:1)}</aside></div>`;
  return title+stageBar(2)+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><div><h2>${trial?'项目副本试运行':e2e?'受控 HTTP 端到端':failed?'候选需要修订':'独立样本验证通过'}</h2><p class="fine">${failed?'候选 v0.1 · 第 1 次尝试':'候选 v0.2 · 第 2 次尝试 · 已修订 1/2 轮'}</p></div>${pill(trial?'实验有效':failed?'未准入':'符合预期',failed?'red':'green')}</div>${trial?`<div class="result-split"><div><span class="eyebrow">模板试运行</span><strong class="green-text">身份与取证有效</strong><p>同一工单、完整字段、复位后可复跑。</p></div><div><span class="eyebrow">项目业务结果</span><strong class="red-text">优先级被重置</strong><p>预期：高；实际：普通。标题已正确更新。</p></div></div>${notice('业务失败不等于模板失效','实验命中了已确认规则。保留网站缺陷，不削弱断言；满足技术准入后仍可审核模板。','amber')}`:evidenceTable(e2e?'e2e':'samples',failed)}${failed?notice('漏检：所有者改变时仍判通过','ownerId 误用了包含关系，user_a → user_a2 被漏检。修订为前后严格相等后重新验证，规则和正确答案不变。','red'):e2e?`<p class="fine section-note">在审核冻结的 HTTP 参考服务执行整条链；启动崩溃或超时不计为检出业务缺陷。</p>`:''}</section>${detail(trial?'试运行与复跑证据':e2e?'端到端证据与已知限制':'定义检查与对照依据',trial?'环境 ticket-app-test · seed-v1。user_a 登录 → 创建 T201 → 保存快照 → 只更新 title → 查询同一 ID。priority: high → normal，ownerId 保持。再次复位后复现相同违规。':e2e?'参考服务 ref-crud-v1；正确行为与 priority-reset、owner-changed 缺陷经开发者审核。动作、身份、对象关联和断言均命中对应证据。适用范围限只改标题，复杂状态与定价未覆盖。':'定义检查通过：注册操作、变量、身份、对象、字段和有限预算有效。独立正常、缺陷、证据不足对照来自冻结依据；保留生成时不可见变体，不向生成器反馈隐藏答案。')}${actions(button(failed?'修订并重新验证（剩余 2 轮）':samples?'运行受控端到端':e2e?'在项目副本试运行':'提交审核',failed?'revise':samples?'e2e':e2e?'trial':'review',true),samples?button('对照未就绪','save-draft'):'')}</div><aside class="stack">${layerList(trial?4:e2e?3:samples?2:1)}${detail('修订与预算','同一任务首次生成后最多修订两轮，每轮重新验证；通过即停。预算耗尽可更早暂停，模型不能提高上限。')}${trial?runContract('候选试运行 C014'):''}</aside></div>`;
}

function credentialCard() {
  return `<section class="card credential-card"><div class="card-header"><h2>测试账号</h2><select id="credential-mode" aria-label="测试密码状态"><option value="expired">已失效，重新输入</option><option value="session">本次会话可用（示例）</option></select></div><div id="credential-fields"><div class="account-row">${field('replay-a','user_a 的测试密码','','password','autocomplete="off" placeholder="仅使用示例密码"')}${field('replay-b','user_b 的测试密码','','password','autocomplete="off" placeholder="仅使用示例密码"')}</div><div class="card-footer"><span class="fine">仅本次会话使用，不进入验证包</span><button class="text-button" data-action="replay-passwords">填入示例密码</button></div></div><p id="credential-session" class="fine" hidden>使用本次会话的示例凭据重新登录；不会沿用旧 Token。</p></section>`;
}
function credentialsValid() {
  return document.querySelector('#credential-mode')?.value==='session'||!!(document.querySelector('#replay-a')?.value&&document.querySelector('#replay-b')?.value);
}
function repairPreparation() {
  const repair=demo.repair||{};
  return `<section class="card"><div class="card-header"><h2>修复后的项目</h2><button class="text-button" data-action="repair-example">使用示例修复项目</button></div>${field('repair-directory','项目目录',repair.directory||'C:\\demo\\ticket-app-fixed','text','spellcheck="false"') }<div class="field-row"><div class="field"><label>原代码版本</label><div class="fixed-value">demo-1 · R014</div></div>${field('repair-version','本次代码版本',repair.version||'demo-2')}</div><div class="field"><label for="repair-change">本次变化</label><select id="repair-change"><option value="same">业务修复，接口与字段未变</option><option value="mapping">接口或查询字段变化，需重新接入</option></select></div><p class="fine">示例路径，不读取本机项目。规则 v1.0、基线 seed-v1 沿用。</p></section>${credentialCard()}<section class="card"><h2>复跑前确认</h2><div class="check-stack">${check('recover-version','确认修复项目、代码版本与变化范围')}${check('recover-env','确认测试副本、代码与配置符合本次复跑条件')}${check('recover-old','确认旧写操作已停止或隔离')}${check('recover-reset','恢复并核对 seed-v1，重新登录后从第一步执行')}</div>${detail('版本与变化',`原运行 R014 / demo-1 保留。本次 ${esc(repair.version||'demo-2')}；${repair.mapping?'新映射 '+esc(repair.mapping)+' 已确认':'映射 v1.3 沿用，接口变化时须重新确认'}。新运行关联原记录。`)}</section><div id="form-error" role="alert"></div>${actions(button('准备完成，开始复跑','replay-start',true))}`;
}
function referenceRequirements() {
  return '待补：覆盖所有者变更的可信 HTTP 缺陷对照。提供正常参考行为、priority-reset 与 owner-changed 缺陷依据，并由开发者独立审核、冻结版本。规则 v1.0 / 候选 v0.2 / 第 2 次尝试（已修订 1/2 轮）保持不变。保留生成器不可见变体；缺字段应为无法验证。补齐后重新检查受控端到端，再进入项目试运行与双重审核；不能自动发布或重置次数。';
}

function businessView() {
  const interrupted=state==='interrupted',prepare=state==='replay-prepare',replay=state==='replay-running';
  const names=flow==='submit'?(demo.selectedRules||['save','duplicate','permission']).map(x=>({save:'保存结果',duplicate:'重复提交',permission:'权限隔离'}[x])):['字段保持'];
  return heading(prepare?'修复后复跑':interrupted?'实验已中断':replay?'正在复跑':flowName(),prepare?'新记录关联 R014，原证据保留':interrupted?'R014 保留为未完成，不直接重发未知写请求':replay?'R015 · 从实验第一步重新执行':'仅执行已确认且适用的检查')+(flow==='submit'?'':stageBar(replay||prepare?4:2))+`<div class="columns"><div class="stack">${prepare?repairPreparation():interrupted?notice('最终写入情况未知','保留原请求与证据。恢复前必须隔离旧操作、核对环境并恢复基线；其他已完成独立检查仍保留。')+actions(button('核对条件并从头重跑','recover',true)): `<section class="card"><div class="card-header"><h2>${replay?'正在查询最终结果':'正在执行业务检查'}</h2>${pill('示例运行中','green')}</div><div class="progress"><span style="width:66%"></span></div><div class="status-list">${names.map((x,i)=>`<div class="status-row"><div><strong>${x}</strong><p>复位基线 → 登录 → 操作 → 最终查询</p></div>${pill(i===0?'检查中':'待执行')}</div>`).join('')}</div>${actions(button('停止','business-stop'),button('显示本轮结果','business-complete',true))}</section>`}${detail('执行与恢复原则','每个独立普通实验前复位并确认成功；同一实验内部保留状态。证据不足保留无法验证。恢复创建关联新记录，不从未知写请求处续跑，也不覆盖已完成检查。')}</div><aside class="stack">${runContract(prepare?'R014 → R015':replay?'R015':'R014')}${notice('无需重新分析','规则、映射及模板有效时可无模型复跑；当前仍是示例状态。','green')}</aside></div>`;
}
function loadView() {
  const plan=state==='load-plan',running=state==='load-running',settling=state==='load-settling';
  const cfg=demo.load||{rate:60,minutes:10,latency:1500,error:1};
  const total=cfg.rate*cfg.minutes;
  if(plan) return heading('目标负载','编辑工单 · 业务复测已通过')+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><h2>确认本次目标</h2>${pill('示例条件 · 可调整')}</div><div class="field-row">${field('load-rate','每分钟编辑次数',cfg.rate,'number','min="1" max="1200" step="1"')}${field('load-minutes','持续时间（分钟）',cfg.minutes,'number','min="1" max="60" step="1"')}</div><div class="field-row">${field('load-latency','95% 请求允许等待（毫秒）',cfg.latency,'number','min="1" step="1"')}${field('load-error','请求错误率上限（%）',cfg.error,'number','min="0" max="100" step="0.1"')}</div><div class="field"><label for="load-pattern">使用方式</label><textarea id="load-pattern" readonly>普通用户编辑各自的工单，100% 为标题更新，均匀到达。</textarea></div>${detail('数据、停止与结算条件','2 个测试身份，各自操作所属工单；100 张专用工单，无共享热点。已验证字段保持检查覆盖本流程，权限隔离及重复提交不在本次负载结论内。业务违规立即停止；延迟或错误率持续超标 30 秒停止；人工停止或资源上限同样停止。停止后最多结算 30 秒。内部上限：1200 次业务操作、30 分钟墙钟、已验证资源预设，不提供预算调整面板。')}<div class="rule-divider"></div>${check('load-confirm','确认目标、数据分布、判定与停止条件')}</section><div id="form-error" role="alert"></div>${actions(button('开始目标负载','load-start',true))}</div><aside class="stack"><section class="card compact-card"><h2>本次覆盖</h2>${kv('低负载业务','R015 · 通过')}${kv('已验证检查','字段保持 '+(demo.activeVersion||'v1.0'))}${kv('环境','本机测试副本')}${kv('目标','只验证已确认负载')}</section>${notice('结论有范围','不寻找最大容量，不把虚拟用户数换算成真实在线人数。','green')}</aside></div>`;
  const manual=variant==='manual',violation=variant==='business',unknown=variant==='unknown',performance=variant==='performance',resource=variant==='resource';
  const dispatched=(running||manual||violation||performance||resource)?Math.max(1,Math.round(total*.6)):total;
  const cause=violation?'发现业务违规':manual?'用户已停止':performance?'性能持续超标':resource?'达到资源上限':'目标运行结束';
  const pending=Math.min(2,dispatched);
  return heading(settling?'结算在途操作':running?'目标负载运行中':cause,`编辑工单 · ${cfg.rate} 次/分钟 · ${cfg.minutes} 分钟`)+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><h2>${settling?'已停止派发，等待最终结果':running?'业务与性能同步检查':cause}</h2>${pill(settling?'结算中':running?'示例运行中':'已停止',violation?'red':'green')}</div><div class="metrics"><div><span>业务意图</span><strong>${dispatched}</strong></div><div><span>P95 等待</span><strong>${performance?'1800':'820'}<small> ms</small></strong></div><div><span>请求错误率</span><strong>0.3<small>%</small></strong></div></div><div class="progress"><span style="width:${running?'60':'100'}%"></span></div><div class="status-list"><div class="status-row"><span>已取得最终记录</span><strong>${dispatched-pending}</strong></div><div class="status-row"><span>在途 / 未结算</span>${pill(pending+' 项','amber')}</div><div class="status-row"><span>业务检查</span>${pill(violation?'优先级发生违规变化':'已观察结果符合规则',violation?'red':'green')}</div></div>${settling?notice('还不能给出目标通过结论','在途结果需在 30 秒内完成查询；超期或查询不完整的项保留未知。'):violation?notice('业务违规，立即停止','即使响应很快，也不能判该目标通过。','red'):''}${actions(...(running?[button('停止','load-stop'),button('显示目标结束示例','load-finish',true)]:settling?[button(unknown?'显示结算超期结果':'完成示例结算','settle',true)]:[button('结算在途操作','to-settle',true)]))}</section>${detail('业务操作账本',`区分业务意图、请求尝试和重试。目标 ${total} 次独立业务操作；示例完整运行 ${total+12} 次请求尝试，其中 12 次为重试。仅对被接受操作核对最终结果，正常拒绝与处理中分别记录。负载期间保留累计状态，不逐请求复位。`)}</div><aside class="stack"><section class="card compact-card"><h2>目标与边界</h2>${kv('P95 阈值',cfg.latency+' ms')}${kv('请求错误率',cfg.error+'%')}${kv('持续超标窗口','30 秒')}${kv('在途结算期限','30 秒')}${kv('适用业务检查','字段保持')}</section>${notice('本机环境','工具与网站共用资源；结论不能直接代表线上。','green')}</aside></div>`;
}

function reportView() {
  if(state==='transfer')return transferReport();
  if(state==='submit')return submitReportView();
  if(['published','qualification','replayed','load-passed','load-failed','load-unknown','load-stopped','load-unmet'].includes(state)){demo.published=true;saveDemo();}
  demo.report=state;demo.reportQuery=location.search;
  if(state.startsWith('load-'))demo.loadReport={...demo.loadReport,state,variant};saveDemo();
  const reviewing=state==='review',published=state==='published',replayed=state==='replayed',load=state.startsWith('load-'),unknown=state==='unknown';
  const loadPassed=state==='load-passed',loadFailed=state==='load-failed',loadUnknown=state==='load-unknown';
  const replayMeta=(load?demo.loadReport?.replay:null)||demo.replayRun||demo.repair||{};
  const good=replayed||loadPassed;
  const templateVersion=variant==='replacement'?'v1.1':(replayed||load)?(replayMeta.template||'v1.0'):'v1.0';
  const unmet=state==='load-unmet';
  const cfg=(load?demo.loadReport?.config:null)||demo.load||{rate:60,minutes:10,latency:1500,error:1};
  const total=cfg.rate*cfg.minutes;
  const partial=state==='load-stopped'||state==='load-failed'||(unmet&&variant!=='valid');
  const completed=partial?Math.max(1,Math.round(total*.6)):total;
  const pending=loadUnknown?Math.min(2,completed):0;
  const next=reviewing?button('查看业务证据','business-evidence'):replayed?link('验证目标负载','verify.html?state=load-plan',true):published?link('修复后复测','verify.html?state=replay-prepare',true):load?link('查看业务复测','report.html?state=replayed'):link('重新接入该流程','index.html?state=mapping',true);
  return heading('验证报告',`编辑工单 · ${replayed?'R015 · 修复后复跑':load?'L016 · 目标负载':'R014 · 候选试运行'} · 本轮已结束`,button('导出','export')+next)+`<div class="report-tabs" aria-label="报告内容"><button class="${(reviewing||reportTab==='qualification')?'':'selected'}" data-action="business-evidence">业务结果</button><button class="${(reviewing||reportTab==='qualification')?'selected':''}" data-action="review-tab">候选资格 ${pill(reviewing?'待审核':'已发布',reviewing?'amber':'green')}</button></div><div class="report-columns"><aside class="stack"><section class="card compact-card"><h2>结果摘要</h2>${kv('业务结果',pill(good?'通过':loadUnknown||unknown?'无法验证':state==='load-stopped'||unmet?'目标未完成':'业务失败',good?'green':loadUnknown||unknown||state==='load-stopped'||unmet?'amber':'red'))}${kv('模板资格',pill(reviewing?'待技术审核':'已发布 · '+templateVersion,reviewing?'amber':'green'))}${kv('验证范围',load?'目标负载':'低负载字段保持')}</section>${load?`<section class="card compact-card"><h2>目标条件</h2>${kv('操作率',cfg.rate+' 次/分钟')}${kv('持续时间',cfg.minutes+' 分钟')}${kv('P95 阈值',cfg.latency+' ms')}${kv('请求错误率',cfg.error+'%')}</section>`:replayed?notice('业务复测通过','可按确认的目标开展负载验证。','green'):notice('目标负载未测','本轮已证明业务错误，修复并复测后再运行。')}${detail('历史运行',`<div class="history-links"><a href="report.html?state=published">R014 · 业务失败 · demo-1</a><a href="report.html?state=replayed">R015 · 修复复跑 · ${esc(demo.replayRun?.version||"demo-2")}</a>${demo.loadReport?`<a href="report.html?state=${esc(demo.loadReport.state)}&case=${esc(demo.loadReport.variant)}">L016 · 目标负载 · ${demo.loadReport.state==="load-passed"?"通过":"已结束"}</a>`:""}</div><p>规则、映射与基线相同，代码版本不同。历史记录不覆盖，新记录关联原运行。</p>`)}${detail('运行与版本',`代码 ${replayed||load?esc(replayMeta.version||'demo-2'):'demo-1'} · 规则 v1.0 · 映射 ${replayed||load?esc(replayMeta.mapping||'v1.3'):'v1.3'} · seed-v1 · 解释器 v1。模板固定哈希 demo-8d3c（演示标识）。`)}<button class="text-button" data-action="next-flow">选择下一条流程</button></aside><div class="stack">${reviewing?reviewCard():reportTab==='qualification'?qualificationCard(templateVersion):load?`<section class="card"><div class="card-header"><h2>${loadPassed?'已确认目标通过':loadFailed?'目标未通过':loadUnknown?'结算证据不足':unmet?'目标条件未满足':'运行已停止，目标未完成'}</h2>${pill(loadPassed?'目标通过':loadFailed?'业务失败':loadUnknown?'无法验证':unmet?'目标未达标':'人工停止',loadPassed?'green':loadFailed?'red':'amber')}</div><div class="metrics"><div><span>P95 等待</span><strong>${variant==='performance'?'1800':'820'}<small> ms</small></strong></div><div><span>请求错误率</span><strong>0.3<small>%</small></strong></div><div><span>未结算</span><strong>${pending}</strong></div></div><div class="table-wrap"><table><caption class="sr-only">负载业务账本</caption><thead><tr><th>独立业务意图</th><th>请求尝试</th><th>接受操作</th><th>最终记录</th></tr></thead><tbody><tr><td>${completed}</td><td>${completed+12}</td><td>${completed}</td><td>${completed-pending}</td></tr></tbody></table></div>${loadFailed?notice('发现字段保持违规','T201 的优先级由高变为普通。已停止派发并完成在途结算，性能达标不能覆盖业务失败。','red'):loadUnknown?notice('最终结果未完整取得','结算期限已到，无法确认整体业务目标；查询失败不直接等于网站业务失败。'):loadPassed?notice('业务与性能条件共同满足','仅限本次负载、数据、环境和字段保持检查。未探索更高负载或最大容量。','green'):unmet?notice('目标条件未满足','性能阈值或资源上限触发停止；保留业务观察，不能冒充业务违规，也不判目标通过。'):notice('人工停止不代表目标通过','本次只完成部分时段，保留已观察结果。')}<div class="rule-divider"></div><p class="fine">本机测试副本 · 100 张专用工单 · 2 个身份 · 均匀编辑。权限隔离、重复提交与线上部署未包含在本次结论中；压测端与网站共用资源。</p></section>`:unknown?`<section class="card"><div class="card-header"><h2>无法取得完整最终字段</h2>${pill('无法验证','amber')}</div><p class="body-copy">查询缺少 ownerId，不能证明所有者保持不变。未将缺字段当作空值相等。</p>${detail('补充与重新检查','提供返回同一工单完整 ownerId 的 HTTP 查询入口，并确认账号身份与字段语义。补齐后重新试运行；不因查询超时自动判接口变化。',true)}${actions(button('复制补充说明','copy-unknown'),link('重新接入该流程','index.html?state=mapping',true))}</section>`:`<section class="card"><div class="card-header"><h2>${replayed?'修复后字段保持检查通过':'修改标题时优先级被重置'}</h2>${pill(replayed?'业务通过':'业务失败',replayed?'green':'red')}</div><div class="comparison"><div class="compare"><label>预期</label><strong>优先级保持为高</strong></div><div class="compare ${replayed?'':'actual'}"><label>实际</label><strong>${replayed?'高，保持不变':'普通，被重置'}</strong></div></div><h3 class="evidence-title">复现与证据</h3><ol class="experiment-steps compact"><li>用户甲创建高优先级工单 T201，保存操作前快照。</li><li>仅更新标题，再查询同一 ID 的完整结果。</li><li>${replayed?'title 更新正确，priority 与 ownerId 保持原值。':'title 更新正确，priority 从 high 变为 normal；ownerId 未变化。'}</li></ol>${detail('请求、响应与断言',`<pre>PATCH /api/tickets/T201
{ "title": "更新后的标题" }

GET /api/tickets/T201
{ "id": "T201", "priority": "${replayed?'high':'normal'}", "ownerId": "user_a" }

priority_after == priority_before → ${replayed?'true':'false'}</pre><p>已确认更新被接受、账号正确、对象相同、查询完整。请求不包含凭据。</p>`)}${actions(button('复制修复说明','copy-fix'),button('完整证据','proof'))}</section>${replayed?notice('新记录已关联 R014','初始数据已复位，规则和有效映射沿用，重新登录后从第一步复跑；未调用模型。','green'):notice('实验有效，项目业务失败','候选对照验证已通过；修复网站，不放宽规则。', 'amber')}`}${!reviewing?detail('模板适用说明',`字段保持 ${templateVersion} 适用于只修改标题时 priority、ownerId 不变的规则。正常、指定缺陷及证据不足对照通过，HTTP 端到端和项目试运行证据完整。仅在当前受控范围验证，跨网站效果需另行接入和执行。`):''}</div></div>`;
}
function submitReportView() {
  const names={save:'保存结果',duplicate:'重复提交',permission:'权限隔离'};
  const selected=demo.selectedRules||['save','duplicate','permission'];
  return heading('验证报告','工单提交 · 本轮已结束',button('导出','export')+link('修复后复测','verify.html?state=replay-prepare&flow=submit',true))+`<div class="columns"><div class="stack"><section class="card"><h2>已确认检查</h2><div class="status-list">${selected.map(x=>`<div class="status-row"><div><strong>${names[x]}</strong><p>${x==='duplicate'?'同一业务意图连续重试，最终查询出现两张工单。':x==='permission'?'无法以另一账号取得完整查询证据。':'提交后查询 title、content 与预期一致。'}</p></div>${pill(x==='duplicate'?'业务失败':x==='permission'?'无法验证':'通过',x==='duplicate'?'red':x==='permission'?'amber':'green')}</div>`).join('')}</div></section>${notice(selected.includes('duplicate')?'目标负载已暂停':'未自动开展目标负载',selected.includes('duplicate')?'先修复重复创建并通过业务复测。':'仅报告本轮已确认检查，不将未执行项算通过。')}${actions(link('重新接入该流程','index.html?state=mapping'),button('选择下一条流程','next-flow'))}</div><aside class="stack"><section class="card compact-card"><h2>执行范围</h2>${kv('主流程','工单提交')}${kv('已选检查',selected.length+' 项')}${kv('环境','独立测试副本')}${kv('模板','有效已发布版本')}</section>${detail('未确认规则','没有勾选的规则保留待定，不出现在已执行检查中。')}</aside></div>`;
}
function pausedView() {
  const model=state==='model-paused';
  return heading(model?'模型分析已暂停':'已达到内部预算上限','编辑工单 · 已保留进度与证据')+`<div class="columns"><div class="stack">${notice(model?'模型服务暂不可用':'停止新增调用与步骤',model?'依赖 AI 的候选分析暂停。已确认且无需 AI 的有效固定实验仍可执行；不会绕过候选准入。':'候选轮数与累计使用量保留，不自动提高预算或重新计数。')}<section class="card"><h2>保留的状态</h2>${kv('业务规则','v1.0 · 已确认')}${kv('候选任务','第 2 次尝试 · 未发布')}${kv('执行记录','已保存，不计为通过')}${detail('暂停原因',model?'示例：模型调用超时。恢复服务后继续相关分析；被测网站自身模型依赖另按外部服务条件处理。':'示例：达到有限步骤/调用/时间预设之一。实际使用量与预设版本记入记录；当前没有继续执行的预算。')}</section>${actions(model?button('模型恢复后继续候选验证','resume-model',true):button('查看已保留证据','proof'),model?link('复跑已确认实验','verify.html?state=replay-prepare'):'')}</div><aside class="stack">${runContract('R014 · 已保留')}</aside></div>`;
}
function transferView() {
  const ready=state==='transfer-ready';
  return heading(ready?'第二项目映射试运行完成':'接入第二个项目','activity-app · 编辑报名信息')+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><h2>复用字段保持 v1.0</h2>${pill(ready?'映射有效':'待项目确认',ready?'green':'amber')}</div><p class="body-copy">仅修改显示名称，报名类别和报名人必须保持不变。</p><div class="rule-divider"></div><div class="mapping"><span>更新</span><code>PATCH /api/registrations/:id</code><span>查询</span><code>GET /api/registrations/:id</code><span>字段</span><code>title → displayName<br>priority → category<br>ownerId → userId</code></div>${detail('匹配理由与不适用条件','已冻结的参数化实验支持单字段更新后核对其他字段不变。本项目具有登录、创建、更新及完整查询。规则由新项目用户确认，不从旧项目继承通过结论；支付、名额争抢及复杂状态未覆盖。')}<div class="rule-divider"></div>${ready?notice('本项目身份、对象与字段已核对','重新准备专用数据并取得本项目证据；模板步骤与断言未变。','green'):check('transfer-confirm','确认新项目规则、字段语义、身份和查询范围')}</section><div id="form-error" role="alert"></div>${actions(ready?link('查看复用结果','report.html?state=transfer',true):button('确认并试运行新映射','transfer-check',true))}</div><aside class="stack"><section class="card compact-card"><h2>复用边界</h2>${kv('项目','activity-app-test')}${kv('模板','字段保持 v1.0 · 有效')}${kv('新映射','registration-v1')}${kv('数据','独立专用测试数据')}</section>${notice('只改映射才算直接复用','修改实验或断言需另记能力扩展，不混算复用。','green')}</aside></div>`;
}
function transferReport() {
  return heading('验证报告','activity-app · 编辑报名信息 · 迁移示例')+`<div class="columns"><div class="stack"><section class="card"><div class="card-header"><h2>本项目字段保持检查通过</h2>${pill('本次条件内通过','green')}</div><p class="body-copy">显示名称更新正确，报名类别和报名人保持原值。新账号身份、同一对象及完整查询已核对，初始数据复位后可复跑。</p><div class="rule-divider"></div>${kv('复用模板','字段保持 v1.0 · 冻结版本')}${kv('调整内容','登录、接口、字段、查询映射')}${kv('未改变','参数化步骤与判定逻辑')}${detail('验证范围','工单与报名两个受控样例的映射迁移示例，不代表任意真实网站适配；新项目结果由本项目证据得出，未继承工单项目通过结论。',true)}</section>${actions(button('导出','export'),button('选择下一条流程','next-flow'))}</div><aside class="stack">${notice('直接复用与能力扩展分开','本示例只改映射；若新增模板逻辑，应进入新的验证与审核。','green')}</aside></div>`;
}
function qualificationCard(version=variant==='replacement'?'v1.1':'v1.0') {
  return `<section class="card"><div class="card-header"><h2>字段保持模板 ${esc(version)}</h2>${pill('已发布','green')}</div>${notice('固定版本，可按适用条件复用',version==='v1.1'?'当前选用有效的替代版本 v1.1；原包 v1.0 与旧报告保留。':'业务适用确认与开发者技术审核已完成；候选 v0.2 发布为 v1.0。','green')}<div class="rule-divider"></div>${candidateDefinition()}${detail('准入与版本',`正常、指定缺陷和未知对照、受控 HTTP 端到端、项目试运行及复位复跑已核对。规则 v1.0 · 对照 ${esc(demo.reference||'ref-crud-v1')} · 解释器 v1 · demo-8d3c（演示标识）。模板变更后重验，停用后不推荐，旧报告保留。`)}${actions(button('查看验证证据','review-proof'))}</section>`;
}
function reviewCard() {
  return `<section class="card"><div class="card-header"><div><h2>字段保持候选审核</h2><p class="fine">候选 v0.2 · 规则 v1.0 · 已修订 1/2 轮</p></div>${pill('待审核','amber')}</div><div class="review-evidence">${[['定义检查','操作、变量、断言、有限预算'],['独立样本','正常、两个缺陷、证据不足及留出变体'],['受控端到端','HTTP 参考服务与已审核缺陷版本'],['项目试运行','身份、对象、完整查询及复位复跑']].map(([a,b])=>`<div><strong>${a}</strong><span>${b}</span>${pill('通过','green')}</div>`).join('')}</div><button class="text-button" data-action="review-proof">查看分层验证证据</button><div class="rule-divider"></div><div class="review-confirm"><span class="eyebrow">业务适用确认</span>${check('business-confirm','确认仅修改标题，优先级和所有者必须保持不变')}</div><div class="review-confirm"><span class="eyebrow">技术审核 · 开发者</span>${check('technical-confirm','已核对独立对照、端到端、试运行、限制和版本')}</div><p class="fine">普通使用者无需编写脚本；缺审核者或可信依据时保留候选。</p><div id="form-error" role="alert"></div>${actions(button('退回候选','reject'),button('审核并发布固定版本','publish',true,'disabled id="publish-button"'))}</section>`;
}
function modal(title,body,footer='') {
  document.querySelector('#overlay').innerHTML=`<dialog open aria-modal="true" aria-labelledby="dialog-title"><div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="text-button" data-action="close" aria-label="关闭对话框">关闭</button></div><div class="dialog-body">${body}</div>${footer?`<div class="dialog-footer">${footer}</div>`:''}</dialog>`;
  document.querySelector('#app').inert=true; document.querySelector('.dialog-head button')?.focus();
}
function closeModal(){document.querySelector('#app').inert=false;document.querySelector('#overlay').innerHTML='';document.querySelector('main h1')?.focus({preventScroll:true});}
function sceneModal() {
  const groups=[
    ['接入与模型',[['首次接入','index.html'],['初始化受阻','index.html?state=init-blocked'],['映射待确认','index.html?state=mapping'],['模型输出不兼容','settings.html?state=failed'],['第二项目映射复用','index.html?state=transfer'],['凭据存储不可用','settings.html?state=vault-failed']]],
    ['候选完整过程',[['确认新规则','verify.html?state=rules&case=new'],['缺实验，可生成','verify.html?state=gap'],['候选草稿','verify.html?state=generated'],['首次漏检','verify.html?state=validation-failed'],['修订后样本通过','verify.html?state=samples'],['受控端到端','verify.html?state=e2e'],['项目业务失败','verify.html?state=trial'],['等待审核','report.html?state=review'],['已发布','report.html?state=published'],['修复后复跑通过','report.html?state=replayed']]],
    ['缺口与恢复',[['只缺映射','verify.html?state=gap&case=mapping'],['底层能力不足','verify.html?state=gap&case=capability'],['规则待定','verify.html?state=gap&case=rule'],['缺可信对照','verify.html?state=waiting-reference'],['尝试次数耗尽','verify.html?state=exhausted'],['实验中断','verify.html?state=interrupted'],['模型中途不可用','verify.html?state=model-paused'],['内部预算耗尽','verify.html?state=budget-paused'],['无法取得证据','report.html?state=unknown'],['已有模板流程','verify.html?flow=submit']]],
    ['负载与验证包',[['目标确认','verify.html?state=load-plan'],['负载运行','verify.html?state=load-running'],['违规停止','verify.html?state=load-stopped&case=business'],['性能超标停止','verify.html?state=load-stopped&case=performance'],['资源上限停止','verify.html?state=load-stopped&case=resource'],['在途结算','verify.html?state=load-settling'],['结算后通过','report.html?state=load-passed'],['结算未知','report.html?state=load-unknown'],['包检查通过','index.html?state=package-check'],['模板停用','index.html?state=package-check&case=disabled'],['包被改动','index.html?state=package-check&case=damaged'],['版本不兼容','index.html?state=package-check&case=version']]]
  ];
  modal('切换预览示例',`<p class="fine">直接查看某个状态；主流程仍可按页面按钮逐步走完。均为演示，不执行真实操作。</p>${groups.map(([title,items])=>`<section class="scene-group"><h3>${title}</h3><div class="scene-links">${items.map(([name,url])=>`<a href="${url}">${name}</a>`).join('')}</div></section>`).join('')}`,button('重置本次演示','reset-demo'));
}
function packageModal() {
  modal('选择示例验证包',`<p class="fine">仅演示加载检查，不读取本机文件。</p><div class="package-options">${[['valid','有效验证包','规则、映射与模板版本完整'],['disabled','模板已停用','保留旧报告，阻止直接执行'],['damaged','完整性不符','证据摘要被改动'],['version','版本不兼容','解释器版本要求不满足']].map(([id,a,b],i)=>`<label><input type="radio" name="package-case" value="${id}" ${i===0?'checked':''}><span><strong>${a}</strong><small>${b}</small></span></label>`).join('')}</div>`,button('检查示例包','package-select',true));
}
function error(text) { const el=document.querySelector('#dialog-error')||document.querySelector('#form-error');if(el)el.innerHTML=notice(text,'','amber');else toast(text); }
let toastTimer;
function toast(text) {
  document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.textContent=text;document.body.append(el);clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.remove(),3200);
}
function render(){shell(page==='project'?projectView():page==='verify'?verifyView():page==='report'?reportView():settingsView());}
document.addEventListener('change',e=>{
  if(e.target.id==='credential-mode'){document.querySelector('#credential-fields').hidden=e.target.value==='session';document.querySelector('#credential-session').hidden=e.target.value!=='session';}
  if(e.target.id==='repair-change'){const changed=e.target.value==='mapping';document.querySelector('[data-action="replay-start"]').textContent=changed?'重新确认映射':'准备完成，开始复跑';document.querySelector('#form-error').innerHTML=changed?notice('接口变化需重新接入','只核对当前流程的新映射；原规则、报告和验证包保留。'):'';}

  if(e.target.matches('.rule-confirm')){const all=[...document.querySelectorAll('.rule-confirm')];document.querySelector('#rule-count').textContent=`${all.filter(x=>x.checked).length}/${all.length} 已确认`;all.forEach(x=>x.closest('.rule-row').querySelector('.rule-state').textContent=x.checked?'已确认':'待确认');}
  if(e.target.id==='business-confirm'||e.target.id==='technical-confirm')document.querySelector('#publish-button').disabled=!(document.querySelector('#business-confirm').checked&&document.querySelector('#technical-confirm').checked);
  if(e.target.id==='provider'){document.querySelector('#endpoint').value=e.target.value==='custom'?'https://api.example.test':'https://api.deepseek.com';demo.scopeInvalid=true;}
  if(e.target.id==='endpoint')demo.scopeInvalid=true;
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeModal();
  if(e.key==='Tab'&&document.querySelector('dialog')){const els=[...document.querySelectorAll('dialog button:not(:disabled),dialog a,dialog input,dialog textarea,dialog select')];const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}
});
document.addEventListener('input',e=>{if(page==='settings'&&['endpoint','model-name','api-key','provider'].includes(e.target.id))modelDirty=true;});
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]');if(!el)return;
  const action=el.dataset.action;

  if(action==='repair-example'){document.querySelector('#repair-directory').value='C:\\demo\\ticket-app-fixed';document.querySelector('#repair-version').value='demo-2';return;}
  if(action==='reference-note')return modal('待补可信对照',`<div class="field"><label for="reference-brief">交给开发者的补充要求</label><textarea id="reference-brief" class="reference-brief" readonly>${referenceRequirements()}</textarea></div>`,button('复制要求','copy-dialog',true));
  if(action==='reference-recheck')return modal('重新检查可信对照',`<p class="fine">只切换演示结果，不读取参考服务或文件。</p>${field('reference-id','补充对照版本','ref-crud-v2')}<div class="field"><label for="reference-case">示例对照状态</label><select id="reference-case"><option value="missing">仍缺所有者变更对照</option><option value="ready">对照已补齐</option></select></div><div class="check-stack">${check('reference-reviewed','开发者已独立核对正常行为与两类缺陷')}${check('reference-frozen','版本已冻结，规则、隐藏变体与候选次数保持不变')}</div><div id="dialog-error" role="alert"></div>`,button('开始示例重检','reference-check',true));
  if(action==='reference-check'){
    if(!document.querySelector('#reference-id').value.trim()||!document.querySelector('#reference-reviewed').checked||!document.querySelector('#reference-frozen').checked)return error('请补充版本并完成独立审核与冻结确认');
    if(document.querySelector('#reference-case').value!=='ready')return error('仍缺所有者变更对照，候选继续等待，不消耗或重置修订次数');
    demo.reference=document.querySelector('#reference-id').value.trim();saveDemo();closeModal();return go('reference-rechecked');
  }

  if(action==='close')return closeModal();
  if(action==='resume-model')return go('samples');
  if(action==='transfer-check'){if(!document.querySelector('#transfer-confirm').checked)return error('请确认新项目适用条件与映射');return go('transfer-ready');}
  if(action==='scenes')return sceneModal();
  if(action==='package')return packageModal();
  if(action==='reset-demo'){demo={};saveDemo();location.href='index.html';return;}
  if(action==='directory')return modal('示例项目目录',`<p class="body-copy">C:\\demo\\ticket-app</p><p class="fine">预览仅使用该示例，不访问真实项目。</p>`,button('使用示例项目','close',true));
  if(action==='sample-passwords'||action==='replay-passwords'){document.querySelector(action==='sample-passwords'?'#password-a':'#replay-a').value='preview-only';document.querySelector(action==='sample-passwords'?'#password-b':'#replay-b').value='preview-only';return;}
  if(action==='scope')return modal('调整发送范围',`<p class="fine">接收服务：${demo.customService?'api.example.test':'api.deepseek.com'}</p><div class="check-stack">${check('extra-scope','增加 src/services/ticket-service.ts')}</div><p class="fine">扩大范围后，原确认失效；不会包含凭据、环境文件或数据库。</p>`,button('应用范围并重新确认','scope-apply',true));
  if(action==='scope-apply'){demo.extraScope=document.querySelector('#extra-scope').checked;saveDemo();closeModal();render();const box=document.querySelector('#scope-consent');if(box)box.checked=false;toast('范围已调整，请重新确认发送');return;}
  if(action==='sample-model'){document.querySelector('#model-name').value='demo-model';document.querySelector('#api-key').value='preview-only';return;}
  if(action==='model-check'){if(!document.querySelector('#model-name').value.trim())return error('请填写模型名称');if(!document.querySelector('#api-key').value.trim())return error('请填写 API Key 或填入演示配置');const url=document.querySelector('#endpoint').value;try{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw Error();}catch{return error('请填写有效服务地址');}demo.customService=!url.includes('api.deepseek.com');saveDemo();return go('checking');}
  if(action==='model-result'){modelDirty=false;demo.modelReady=true;saveDemo();return go('connected');}
  if(action==='model-save'){if(modelDirty||!document.querySelector('#api-key').value.trim()||!['connected','saved','vault-failed'].includes(state))return error('请先填写模型并完成连接和输出检查');demo.modelReady=true;saveDemo();location.href='index.html';return;}
  if(action==='clear-key'){document.querySelector('#api-key').value='';document.querySelector('#remember-key').checked=false;demo.modelReady=false;saveDemo();go('empty');toast('示例凭据与会话状态已清除，没有保存真实密钥');return;}
  if(action==='analyze'){if(!demo.modelReady)return error('模型尚未配置，请先前往模型设置');if(!document.querySelector('#scope-consent').checked)return error('请确认项目内容发送范围');if(!document.querySelector('#env-consent').checked)return error('请确认测试副本与专用测试数据');if(!document.querySelector('#password-a').value||!document.querySelector('#password-b').value)return error('请提供测试密码或填入示例密码');demo.scopeInvalid=false;saveDemo();return go('checking');}
  if(action==='access-result')return go('mapping');
  if(action==='mapping-check'){if(!document.querySelector('#mapping-confirm').checked)return error('请确认当前项目映射');demo.accessReady=true;if(demo.returnToReplay)demo.repair={...demo.repair,mapping:'v1.4'};saveDemo();return go('ready');}
  if(action==='recheck')return go('mapping');
  if(action==='mapping'){location.href='index.html?state=mapping';return;}
  if(action==='copy-init')return modal('初始化补充说明','<p class="body-copy">准备两个普通用户及各自工单；提供仅针对测试库的初始化与重置入口。清理旧写操作，恢复 seed-v1 后核对身份、归属、完整查询。补齐前暂停依赖检查。</p>',button('复制示例说明','copy-dialog',true));
  if(action==='flow'||action==='next-flow')return modal('选择一条主流程',`<div class="package-options"><label><input type="radio" name="flow" value="edit" checked><span><strong>编辑工单</strong><small>字段保持性质 · 重点展示候选生成</small></span></label><label><input type="radio" name="flow" value="submit"><span><strong>工单提交</strong><small>保存结果、重复提交、权限隔离</small></span></label></div><p class="fine">本轮结束后再选下一条，保留已有运行记录。</p>`,button('选择流程','flow-select',true));
  if(action==='flow-select'){const f=document.querySelector('input[name="flow"]:checked').value;location.href='verify.html?state=rules&flow='+f;return;}
  if(action==='edit-rule')return modal('确认业务预期',`<div class="field"><label for="rule-text">规则描述</label><textarea id="rule-text">${esc(demo.ruleText||'只修改标题时，优先级和所有者保持不变')}</textarea></div><p class="fine">规则变更保存为新依据，不能按当前源码自动放宽；此预览只展示字段保持性质。</p>`,button('保存为待确认规则','rule-save',true));
  if(action==='rule-save'){const text=document.querySelector('#rule-text').value.trim();if(!text)return;demo.ruleText=text;saveDemo();closeModal();return go('rules');}
  if(action==='rules-next'){const selected=[...document.querySelectorAll('.rule-confirm:checked')];if(!selected.length)return error('请至少确认一条规则；待定项不判对错');if(flow==='submit'){demo.selectedRules=selected.map(x=>x.id.replace('rule-',''));saveDemo();return go('business-running');}return go(demo.published&&variant!=='new'?'business-running':'gap');}
  if(action==='rule-return')return go('rules');
  if(action==='capability-note')return modal('底层能力缺口','<p class="body-copy">当前只能执行已注册 HTTP 操作和有限表达式。该业务需要新增浏览器执行或协议适配，记录为开发待办；不会生成任意 JS、SQL 或 shell 绕过。</p>',button('保留缺口','close',true));
  if(action==='save-draft')return go('waiting-reference');
  if(action==='generate')return go('generated');
  if(action==='validate')return go('validation-failed');
  if(action==='revise')return go('samples');
  if(action==='e2e')return go('e2e');
  if(action==='trial')return go('trial');
  if(action==='review'){location.href='report.html?state=review';return;}
  if(action==='review-proof')return modal('候选准入证据',`<div class="status-list">${[['定义检查','操作与引用合法，规则和有限预算冻结'],['独立样本','正常通过；两类缺陷命中对应断言；缺字段为未知'],['留出变体','保留生成时不可见的数值、对象和正常变体'],['端到端','正确 HTTP 参考服务及开发者审核的缺陷版本'],['项目试运行','身份、同一对象、完整字段、复位后复现'],['已知限制','仅更新标题；不覆盖转交、复杂状态、定价']].map(([a,b])=>`<div class="status-row"><div><strong>${a}</strong><p>${b}</p></div>${pill('已核对','green')}</div>`).join('')}</div><p class="fine">规则 v1.0 · 候选 v0.2 · 对照 ${esc(demo.reference||"ref-crud-v1")} · 解释器 v1 · demo-8d3c（演示标识）。模型无权自我发布。</p>`,button('返回审核','close',true));
  if(action==='publish'){if(!document.querySelector('#business-confirm').checked||!document.querySelector('#technical-confirm').checked)return error('业务确认与技术审核缺一不可');demo.published=true;demo.activeVersion='v1.0';reportTab='business';saveDemo();go('published');toast('示例模板 v1.0 已发布，业务失败证据保留');return;}
  if(action==='reject')return modal('退回候选',`<div class="field"><label for="reject-reason">审核原因</label><textarea id="reject-reason" placeholder="例如：对照依据不足或适用条件不明确"></textarea></div><p class="fine">保留规则、证据和尝试次数，不自动重置任务。</p>`,button('退回并保留草稿','reject-confirm',true));
  if(action==='reject-confirm'){if(!document.querySelector('#reject-reason').value.trim())return;location.href='verify.html?state=waiting-reference';return;}
  if(action==='review-tab'){reportTab='qualification';return go(state);}
  if(action==='business-evidence'){if(state==='review')return modal('项目业务证据',`<p class="body-copy">只更新标题后，T201 优先级 high → normal，ownerId 保持。请求已接受，同一对象完整查询；这是真实业务违规的示例，不说明候选无效。</p>`,button('返回审核','close',true));reportTab='business';return go(state);}
  if(action==='copy-fix'||action==='proof')return modal(action==='proof'?'本轮完整证据':'修复说明',`<p class="body-copy">规则：只更新标题不能改变优先级和所有者。R014：创建高优先级 T201 → 更新 title → 查询 priority=normal。检查更新处理是否覆盖未提交字段；修复后沿用规则 v1.0、映射 v1.3、seed-v1 复跑。</p><p class="fine">示例请求、接受记录、初始/最终快照、对象和身份关联、版本及证据摘要均保留；无凭据。</p>`,button('复制示例内容','copy-dialog',true));
  if(action==='copy-unknown')return modal('取证补充说明','<p class="body-copy">补充可返回同一工单完整 ownerId 的 HTTP 查询入口，确认账号身份与字段语义。补齐后重新核对映射并试运行；缺字段不判通过。</p>',button('复制示例说明','copy-dialog',true));
  if(action==='copy-dialog'&&document.querySelector('#reference-brief')){const area=document.querySelector('#reference-brief');area.focus();area.select();const copied=document.execCommand('copy');toast(copied?'已复制待补要求':'文字已选中，请按 Ctrl+C 复制');return;}
  if(action==='copy-dialog'){try{await navigator.clipboard.writeText(document.querySelector('.dialog-body').innerText);toast('已复制示例说明');}catch{toast('可直接选择对话框中的示例文字复制');}return;}
  if(action==='business-stop')return go('interrupted');
  if(action==='recover')return go('replay-prepare');
  if(action==='replay-start'){
    const directory=document.querySelector('#repair-directory').value.trim(),version=document.querySelector('#repair-version').value.trim();
    if(!directory||!version)return error('请补充修复项目目录与本次代码版本');
    if(!['recover-version','recover-env','recover-old','recover-reset'].every(id=>document.querySelector('#'+id).checked))return error('请先确认项目版本、环境、旧操作和初始数据');
    demo.repair={...demo.repair,directory,version};
    if(document.querySelector('#repair-change').value==='mapping'){demo.returnToReplay=true;saveDemo();location.href='index.html?state=mapping&return=replay';return;}
    if(!credentialsValid())return error('测试密码已失效，请补填或使用本次会话示例');
    demo.returnToReplay=false;demo.replayRun={...demo.repair,template:'v1.0',source:'repair'};saveDemo();return go('replay-running');
  }
  if(action==='business-complete'){location.href='report.html?state='+(flow==='submit'?'submit&flow=submit':state==='replay-running'?'replayed':'published')+(variant==='replacement'?'&case=replacement':'');return;}
  if(action==='package-select'){demo.replacement=false;saveDemo();const kind=document.querySelector('input[name="package-case"]:checked').value;location.href='index.html?state=package-check&case='+kind;return;}
  if(action==='package-valid'){demo.replacement=true;saveDemo();variant='valid';go('package-check');toast('已选择有效版本，复跑前需重新确认条件');return;}
  if(action==='project-home')return go('setup');
  if(action==='package-continue')return go('package-passwords');
  if(action==='package-run'){if(!credentialsValid())return error('请重新输入测试密码或填入示例密码');if(!['replay-rule','replay-env','replay-old','replay-reset'].every(id=>document.querySelector('#'+id).checked))return error('请确认环境、旧操作和数据复位条件');demo.published=true;demo.activeVersion=demo.replacement?'v1.1':'v1.0';demo.replayRun={version:'demo-2',mapping:'v1.3',template:demo.activeVersion,source:'package'};saveDemo();location.href='verify.html?state=replay-running'+(demo.replacement?'&case=replacement':'');return;}
  if(action==='load-start'){const rate=+document.querySelector('#load-rate').value,minutes=+document.querySelector('#load-minutes').value,latency=+document.querySelector('#load-latency').value,err=+document.querySelector('#load-error').value;if(!Number.isInteger(rate)||!Number.isInteger(minutes)||rate<=0||minutes<=0||latency<=0||!Number.isFinite(latency)||err<0||err>100||!Number.isFinite(err))return error('请填写有效的目标、时长与性能阈值');if(rate*minutes>1200||minutes>30)return error('目标超过本示例内部上限，不能自动提高预算');if(!document.querySelector('#load-confirm').checked)return error('请确认目标、判定与停止条件');demo.load={rate,minutes,latency,error:err};saveDemo();variant='valid';return go('load-running');}
  if(action==='load-stop')return go('load-settling',{case:'manual'});
  if(action==='load-finish')return go('load-settling');
  if(action==='to-settle')return go('load-settling');
  if(action==='settle'){const cfg=demo.load||{latency:1500,error:1};const out=variant==='unknown'?'load-unknown':variant==='business'?'load-failed':variant==='manual'?'load-stopped':variant==='performance'||variant==='resource'||cfg.latency<820||cfg.error<0.3?'load-unmet':'load-passed';demo.loadReport={state:out,variant,config:{...demo.load},replay:{...demo.replayRun}};saveDemo();location.href='report.html?state='+out+'&case='+variant;return;}
  if(action==='export')return modal('导出预览',`<div class="status-list"><div class="status-row"><div><strong>Markdown 报告</strong><p>规则、预期/实际、证据、条件及未知项</p></div>${pill('示例内容')}</div><div class="status-row"><div><strong>验证包</strong><p>规则、映射、模板、复位及环境合同、证据引用</p></div>${pill('本工具内复跑')}</div></div><p class="fine">同一运行记录派生，不包含凭据或隐藏答案。此预览不导出真实验证成果。</p>`,button('预览验证包加载','package',true));
});
render();
