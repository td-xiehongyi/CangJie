let token='';
export async function connect(){const r=await fetch('/api/session');if(!r.ok)throw new Error('本机会话连接失败');token=(await r.json()).token;}
export async function api(path:string,body?:unknown,method=body===undefined?'GET':'POST',signal?:AbortSignal):Promise<any>{
  const r=await fetch('/api'+path,{method,signal,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!r.ok){const e=await r.json().catch(()=>({error:'请求失败'}));throw new Error(e.error);}return r.headers.get('content-type')?.includes('application/json')?r.json():r.text();
}
export function download(name:string,value:unknown,type='application/json'){const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export type Data=Record<string,any>;
export const ruleNames:Record<string,string>={'save-rule':'提交结果保存','duplicate-rule':'重复提交不重复创建','permission-rule':'账号之间权限隔离','title-update-rule':'只改标题，优先级和所有者不变'};
export const statusNames:Record<string,string>={completed:'已完成',running:'进行中',preparing:'准备中',blocked:'受阻',paused:'已暂停',cancelled:'已停止',interrupted:'上次运行未完成',pass:'通过',fail:'发现问题',inconclusive:'无法验证',ready_for_review:'等待双重审核',draft:'草稿',rejected:'未获准入',needs_rule:'等待规则确认',needs_capability:'缺少能力',validating:'验证中',not_checked:'尚未检查',connected:'连接已通过',failed:'连接失败'};
export type CommonProps={state:Data;project?:Data;run?:Data;refresh:()=>Promise<void>;act:(work:()=>Promise<void>)=>void;settingsReturn?:string;select:(projectId:string,runId?:string,page?:string)=>void};

export function friendlyError(code:string):string{
  const messages:Record<string,string>={
    TEST_PASSWORD_REQUIRED:'请补填两个测试用户的会话密码后，重新准备环境。',
    STARTUP_OR_BASELINE_FAILED:'测试网站启动或数据基线准备失败，请检查项目启动与初始化配置后重试。',
    AUTHENTICATION_FAILED:'模型服务未接受密钥，请在模型设置中核对后重试。',
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
