let token='';
export async function connect(){const r=await fetch('/api/session');if(!r.ok)throw new Error('本机会话连接失败');token=(await r.json()).token;}
export async function api(path:string,body?:unknown,method=body===undefined?'GET':'POST'):Promise<any>{
  const r=await fetch('/api'+path,{method,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!r.ok){const e=await r.json().catch(()=>({error:'请求失败'}));throw new Error(e.error);}return r.headers.get('content-type')?.includes('application/json')?r.json():r.text();
}
export function download(name:string,value:unknown,type='application/json'){const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export type Data=Record<string,any>;
export const ruleNames:Record<string,string>={'save-rule':'提交结果保存','duplicate-rule':'重复提交不重复创建','permission-rule':'账号之间权限隔离','title-update-rule':'只改标题，优先级和所有者不变'};
export const statusNames:Record<string,string>={completed:'已完成',running:'进行中',preparing:'准备中',blocked:'受阻',paused:'已暂停',cancelled:'已停止',interrupted:'上次运行未完成',pass:'通过',fail:'发现问题',inconclusive:'无法验证',ready_for_review:'等待双重审核',draft:'草稿',rejected:'未获准入',needs_rule:'等待规则确认',needs_capability:'缺少能力',validating:'验证中',not_checked:'尚未检查',connected:'连接已通过',failed:'连接失败'};
export type CommonProps={state:Data;project?:Data;run?:Data;refresh:()=>Promise<void>;act:(work:()=>Promise<void>)=>void;select:(projectId:string,runId?:string,page?:string)=>void};
