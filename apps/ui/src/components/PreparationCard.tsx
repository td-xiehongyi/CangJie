import {useEffect,useRef,useState} from 'react';
import {api,friendlyError,type Data} from '../api/client';
export default function PreparationCard({project,title='执行前准备',onReady,includeSending=false,actionLabel='开始检查'}:{project:Data;title?:string;onReady:()=>Promise<void>;includeSending?:boolean;actionLabel?:string}){
  const [environment,setEnvironment]=useState(false),[sending,setSending]=useState(false),[disclosure,setDisclosure]=useState<Data>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[passwords,setPasswords]=useState<Record<string,string>>({});
  const active=useRef(false);
  useEffect(()=>{if(includeSending&&!project.consent)void api(`/projects/${project.id}/disclosure`).then(setDisclosure).catch(e=>setError(e.message));},[project.id,project.consent,includeSending]);
  async function prepare(){if(active.current)return;active.current=true;setError('');setBusy(true);try{
    if(!project.environmentConfirmed&&!environment)throw new Error('请确认测试环境和数据复位条件');
    if(Object.values(passwords).some(Boolean))await api(`/projects/${project.id}/passwords`,passwords);
    if(includeSending&&!project.consent){const d=await api(`/projects/${project.id}/disclosure`);setDisclosure(d);if(!sending||disclosure?.scopeHash!==d.scopeHash)throw new Error('请查看发送范围后勾选同意');}
    await api(`/projects/${project.id}/confirm`,{environment:environment||project.environmentConfirmed,environmentHash:project.environmentHash,send:includeSending&&sending,scopeHash:disclosure?.scopeHash});await api(`/projects/${project.id}/prepare`,{});await onReady();
  }catch(e){setError((e as Error).message);}finally{active.current=false;setBusy(false);}}
  return <section className="card preparation"><h2>{title}</h2><p className="muted">工具会创建独立测试副本、准备测试数据，并检查两个用户能否正常登录。</p><details><summary>查看测试环境详情</summary><dl><dt>测试项目</dt><dd>{project.name}</dd><dt>数据基线</dt><dd>{project.data.seedVersion} · {project.data.count} 条</dd><dt>映射版本</dt><dd>{project.mapping.id} v{project.mapping.version}</dd></dl></details>
    {!project.environmentConfirmed&&<label className="check"><input type="checkbox" checked={environment} onChange={e=>setEnvironment(e.target.checked)}/>我同意在独立测试副本中创建用户并重置测试数据</label>}
    {project.environmentConfirmed&&<p className="success">已确认使用独立测试环境；每次检查前会重新准备数据。</p>}
    {project.accounts.filter((a:Data)=>project.accountMode!=='automatic'&&!a.hasPassword).map((a:Data)=><label className="field" key={a.actorRef}>{a.username} 的测试密码<input type="password" autoComplete="off" value={passwords[a.actorRef]??''} onChange={e=>setPasswords({...passwords,[a.actorRef]:e.target.value})}/></label>)}
    {includeSending&&!project.consent&&<><button className="text-button" onClick={()=>void api(`/projects/${project.id}/disclosure`).then(setDisclosure).catch(e=>setError(e.message))}>刷新 AI 读取范围</button>{disclosure&&<div className="notice"><p>AI 服务：{disclosure.serviceUrl}</p>{disclosure.entries.map((e:Data)=><p key={e.path}>{e.path} · {e.contentType}</p>)}<label className="check"><input type="checkbox" checked={sending} onChange={e=>setSending(e.target.checked)}/>同意向该服务发送以上范围内经过过滤的内容</label></div>}</>}
    {error&&<p role="alert" className="error">{friendlyError(error)}</p>}<div className="actions"><button className="btn primary" disabled={busy} onClick={()=>void prepare()}>{busy?'正在准备环境并验证登录…':actionLabel}</button></div></section>;
}
