let token='',sessionExpired=false;
const sessionListeners=new Set<(expired:boolean)=>void>();
export const isSessionExpired=()=>sessionExpired;
export function subscribeSession(listener:(expired:boolean)=>void){sessionListeners.add(listener);return()=>{sessionListeners.delete(listener);};}
function setSessionExpired(value:boolean){sessionExpired=value;for(const listener of sessionListeners)listener(value);}
export async function connect(){
  try{const r=await fetch('/api/session');if(!r.ok)throw new Error('CONNECTION_FAILED');const next=await r.json();if(typeof next.token!=='string'||!next.token)throw new Error('CONNECTION_FAILED');token=next.token;setSessionExpired(false);}
  catch{setSessionExpired(true);throw new Error('CONNECTION_FAILED');}
}
export async function api(path:string,body?:unknown,method=body===undefined?'GET':'POST',signal?:AbortSignal):Promise<any>{
  if(sessionExpired)throw new Error('SESSION_REQUIRED');
  const requestToken=token;
  const r=await fetch('/api'+path,{method,signal,headers:{authorization:`Bearer ${requestToken}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!r.ok){const e=await r.json().catch(()=>({error:'请求失败'}));if(r.status===401&&e.error==='SESSION_REQUIRED'&&requestToken===token)setSessionExpired(true);throw new Error(e.error);}return r.headers.get('content-type')?.includes('application/json')?r.json():r.text();
}
export function download(name:string,value:unknown,type='application/json'){const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export type Data=Record<string,any>;
export const discoveryApi={
  scope:(id:string)=>api(`/projects/${id}/discovery-scope`),
  saveScope:(id:string,body:unknown)=>api(`/projects/${id}/discovery-scope`,body),
  start:(id:string,body:unknown)=>api(`/projects/${id}/discovery`,body),
  pause:(id:string)=>api(`/discovery/${id}/pause`,{}),
  resume:(id:string,revision:number)=>api(`/discovery/${id}/resume`,{revision}),
  select:(id:string,suggestionId:string,revision:number)=>api(`/discovery/${id}/selection`,{suggestionId,revision}),
  excerpt:(id:string,index:number)=>api(`/discovery/${id}/excerpts/${index}`)
};
export const projectRulesApi={
  list:(projectId:string)=>api(`/projects/${encodeURIComponent(projectId)}/rules`),
  confirm:(projectId:string,body:unknown)=>api(`/projects/${encodeURIComponent(projectId)}/rules/confirm`,body),
  revise:(projectId:string,ruleId:string,body:unknown)=>api(`/projects/${encodeURIComponent(projectId)}/rules/${encodeURIComponent(ruleId)}/revise`,body),
  confirmVersion:(projectId:string,ruleId:string,body:unknown)=>api(`/projects/${encodeURIComponent(projectId)}/rules/${encodeURIComponent(ruleId)}/confirm-version`,body),
  select:(projectId:string,body:unknown)=>api(`/projects/${encodeURIComponent(projectId)}/rules/selection`,body),
  version:(projectId:string,ruleId:string,version:number)=>api(`/projects/${encodeURIComponent(projectId)}/rules/${encodeURIComponent(ruleId)}/versions/${version}`)
};
export const ruleNames:Record<string,string>={'save-rule':'提交结果保存','duplicate-rule':'重复提交不重复创建','permission-rule':'账号之间权限隔离','title-update-rule':'只改标题，优先级和所有者不变'};
export const statusNames:Record<string,string>={completed:'已完成',running:'进行中',preparing:'准备中',blocked:'受阻',paused:'已暂停',cancelled:'已停止',interrupted:'上次运行未完成',pass:'通过',fail:'发现问题',inconclusive:'无法验证',ready_for_review:'等待双重审核',draft:'草稿',rejected:'未获准入',needs_rule:'等待规则确认',needs_capability:'缺少能力',validating:'验证中',not_checked:'尚未检查',connected:'连接已通过',failed:'连接失败'};
export type CommonProps={state:Data;project?:Data;run?:Data;refresh:()=>Promise<void>;act:(work:()=>Promise<void>)=>void;settingsReturn?:string;select:(projectId:string,runId?:string,page?:string)=>void};

export function friendlyError(code:string):string{
  const messages:Record<string,string>={
    SESSION_REQUIRED:'工作台连接已失效，当前输入已保留。请先重新连接，再决定如何保存。',
    RULE_ALREADY_EXISTS:'此分析建议已保存为项目规则，请核对最新版本并修订已有规则。',
    RULE_ALREADY_CONFIRMED:'此版本已确认，请加载最新规则，选择当前精确版本。',
    RULE_CORRECTION_REQUIRED:'请填写本次业务预期修订的纠正说明。',
    STALE_PROJECT_RULE:'此规则已有新版本，本页输入已保留，请核对最新版本后再保存。',
    INVALID_PROJECT_RULE:'项目规则内容无效，请核对关键问题、预期行为和规则结构。',
    CORRUPT_PROJECT_RULES:'项目规则存档完整性核对失败，已阻止保存和使用。请保留存档并联系开发者核对。',
    RULE_NOT_FOUND:'未找到该规则版本，请核对当前项目与历史版本。',
    SUGGESTION_NOT_FOUND:'未找到此分析建议，请加载最新分析后核对。',
    RULE_REVISION_CONFLICT:'另一页面已更新项目规则。本页输入已保留，请核对最新版本，再显式确认或保存。',
    RULE_CONFIRMATION_REQUIRED:'项目规则尚未确认。请回答关键问题并核对业务预期；修订后需要重新确认。',
    RULE_CAPABILITY_GAP:'当前能力不能可靠执行此规则，请补齐动作、角色、参数和观察字段。',
    VALIDATION_RESOURCE_GAP:'缺少此规则精确版本的独立验证资源，暂不能生成合格方案或执行。',
    RULE_VERSION_MISMATCH:'规则版本或内容已变化，请核对最新版本并重新选择。',
    RULE_PROJECT_MISMATCH:'这条规则属于其他项目，请选择当前项目的规则。',
    INVALID_RULE_INPUT:'项目规则内容无效，请核对关键问题、预期行为和纠正说明。',
    ANALYSIS_CONFLICT:'另一页面已修改分析范围。本页输入已保留，请加载最新范围或保留本页重新保存。',
    ANALYSIS_BUDGET_EXHAUSTED:'本次分析预算已耗尽，已保存读取记录和部分结果；继续原任务不会重置预算。',
    ANALYSIS_PAUSED:'分析已暂停，在途请求已取消或记录未知用量。',
    STALE_SOURCE:'源码已变化，请重新索引后创建新分析。',
    INVALID_DISCOVERY_OUTPUT:'模型返回的业务分析格式无效，进度已保留；可在原预算内显式重试。',
    INVALID_DISCOVERY_ACTION:'模型请求了不允许的动作；没有执行命令或扩大读取权限。',
    INVALID_SOURCE_REF:'来源引用无效或不属于实际读取的片段，不能作为业务依据。',
    SOURCE_REINDEX_REQUIRED:'纳入项目测试前，请重新索引并查看新的读取范围。',
    SENSITIVE_FILE:'该材料含敏感内容或属于永久排除范围，已拒绝读取或发送。',
    SCOPE_NOT_ALLOWED:'该路径不在已确认的分析范围内，请核对读取范围。',
    SERVICE_CONFIRMATION_REQUIRED:'模型或服务已变化，请核对读取范围并新建分析。',
    INTERRUPTED_ANALYSIS:'上次分析准备中断，尚未调用模型。可继续原分析，预算不会重置。',
    INTERRUPTED_MODEL_CALL:'上次模型请求中断，请核对已保留的用量后继续原分析。',
    ANALYSIS_SAVE_FAILED:'分析进度保存失败，已停止发送。请检查本机磁盘与文件权限后继续原分析。',
    ANALYSIS_START_FAILED:'分析未能启动，进度已保留。请检查本机服务后重试。',
    CONNECTION_FAILED:'暂时无法重新连接，请确认工作台正在运行后重试。',
    WORKFLOW_RECONNECTED:'连接已恢复，本页选择尚未保存。请选择保留本页，或加载已保存的选择。',
    TEST_PASSWORD_REQUIRED:'请补填两个测试用户的会话密码后，重新准备环境。',
    STARTUP_OR_BASELINE_FAILED:'测试网站启动或数据基线准备失败，请检查项目启动与初始化配置后重试。',
    AUTHENTICATION_FAILED:'模型服务未接受密钥，请在模型设置中核对后重试。',
    INVALID_MODEL_KEY:'密钥格式不正确：请粘贴完整密钥，不要包含换行。',
    MODEL_KEY_REQUIRED:'请在本机输入模型 API 密钥后，再保存并检查连接。',
    CREDENTIAL_SESSION_CLOSED:'本机密钥会话已关闭，请重启工作台服务并刷新页面后重新输入密钥。',
    MODEL_NOT_FOUND:'模型服务未找到所填模型，请核对精确名称。',
    PROVIDER_UNAVAILABLE:'暂时无法连接模型服务。进度已保留，请检查连接后继续。',
    INVALID_SERVICE_URL:'请填写支持的模型接口地址。',
    STALE_CANDIDATE:'方案内容已发生变化。本页编辑仍保留，请核对最新方案后再保存。',
    REVIEW_REQUIRED:'请先保存当前方案的审核材料，并完成业务和技术两项确认。',
    WORKFLOW_CONFLICT:'另一页面已更新检查选择。本页输入已保留，请选择保留本页并重新保存，或加载已保存的选择。',
    INVALID_WORKFLOW:'检查选择的格式无效，请重新核对规则与版本。',
    FOLDER_PICKER_UNAVAILABLE:'当前工作台无法显示文件夹窗口。请粘贴本机项目的完整路径，或从本机终端启动工作台后重试。',
    FOLDER_PICKER_BUSY:'文件夹选择器已打开，请先完成选择或取消。',
    PREPARATION_INTERRUPTED:'上次环境准备中断，请重新检查环境。',
    TEST_ACCOUNT_CONFIG_GAP:'测试账号信息不完整，请补齐两个不同的测试用户，或选择自动生成。',
    PROJECT_UNSUPPORTED:'项目还缺少测试条件，请返回项目接入，查看并补充初始化说明。',
    LOGIN_REJECTED:'测试用户登录失败，请检查账号配置和网站的测试初始化入口。',
    LOGIN_IDENTITY_UNVERIFIED:'登录后的用户身份与预期不一致，请检查账号身份 ID 和查询接口。',
    PROJECT_BUSY:'这个项目正在执行任务，请等待完成后再试。',
    MODEL_REQUIRED:'请先在模型设置中填写模型名称和密钥。',
    SENDING_NOT_CONFIRMED:'请先查看并确认本次发送给 AI 的文件范围。',
    CONDITIONS_CHANGED_RECONNECT_REQUIRED:'项目文件已经变化，请重新检查项目并确认测试条件。',
    BUDGET_EXHAUSTED:'本次分析已达到调用上限，进度已保留。请查看任务详情后处理。',
    INVALID_PROPOSAL:'AI 返回的分析格式不符合要求，请检查模型配置后继续原任务。',
    PROJECT_CONFIRMATION_REQUIRED:'请先确认独立测试环境，再开始检查。',
    TARGET_TRIAL_EVIDENCE_INCOMPLETE:'试运行暂时无法得出结论，请查看下方具体原因与技术证据，处理后继续原方案。',
    TARGET_TRIAL_INCOMPLETE:'试运行未完成，请检查测试环境后继续原方案。',
    TEMPLATE_SCHEMA_OR_RULE_BINDING_INVALID:'方案定义或默认参数无效，请开发者修正并重新验证后继续。',
    VERSION_EXISTS:'该固定版本已经发布，请查看已发布的方案；不同版本需重新保存审核材料。'
  };return messages[code]??code;
}

export const ruleDescriptions:Record<string,string>={
  'save-rule':'提交后，保存的内容应与输入一致。',
  'duplicate-rule':'重复提交同一次业务请求，不应重复创建记录。',
  'permission-rule':'一个用户不能越权读取或修改另一个用户的数据。',
  'title-update-rule':'修改标题后，优先级和记录所有者应保持不变。'
};

export function operationLabels(project:Data){
  const record=String(project.name??'').includes('工单')?'工单':'记录';
  return {submit:`新增${record}`,edit:`修改${record}标题`,proposal:'AI 推荐的业务操作'};
}
