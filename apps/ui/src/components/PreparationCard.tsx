import {useState} from 'react';
import {api,type Data} from '../api/client';
export default function PreparationCard({project,title='执行前准备',onReady,includeSending=false}:{project:Data;title?:string;onReady:()=>Promise<void>;includeSending?:boolean}){
  const [environment,setEnvironment]=useState(false),[sending,setSending]=useState(false),[disclosure,setDisclosure]=useState<Data>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[passwords,setPasswords]=useState<Record<string,string>>({});
  async function prepare(){setError('');setBusy(true);try{
    if(!project.environmentConfirmed&&!environment)throw new Error('请确认测试环境和数据复位条件');
    if(Object.values(passwords).some(Boolean))await api(`/projects/${project.id}/passwords`,passwords);
    if(includeSending&&!project.consent){const d=await api(`/projects/${project.id}/disclosure`);setDisclosure(d);if(!sending||disclosure?.scopeHash!==d.scopeHash)throw new Error('请查看发送范围后勾选同意');}
    await api(`/projects/${project.id}/confirm`,{environment:environment||project.environmentConfirmed,environmentHash:project.environmentHash,send:includeSending&&sending,scopeHash:disclosure?.scopeHash});await onReady();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="card preparation"><h2>{title}</h2><p className="muted">将在独立测试副本中重新初始化合成数据并核对账号身份。原项目和已有报告保留。</p><dl><dt>测试项目</dt><dd>{project.name}</dd><dt>数据基线</dt><dd>{project.data.seedVersion} · {project.data.count} 条</dd><dt>映射版本</dt><dd>{project.mapping.id} v{project.mapping.version}</dd></dl>
    {!project.environmentConfirmed&&<label className="check"><input type="checkbox" checked={environment} onChange={e=>setEnvironment(e.target.checked)}/>确认项目、账号、映射及合成数据复位条件</label>}
    {project.environmentConfirmed&&<p className="success">当前环境条件已确认；每轮仍重新复位。</p>}
    {project.accounts.filter((a:Data)=>!a.hasPassword).map((a:Data)=><label className="field" key={a.actorRef}>{a.username} 的测试密码<input type="password" autoComplete="off" value={passwords[a.actorRef]??''} onChange={e=>setPasswords({...passwords,[a.actorRef]:e.target.value})}/></label>)}
    {includeSending&&!project.consent&&<><button className="text-button" onClick={()=>void api(`/projects/${project.id}/disclosure`).then(setDisclosure).catch(e=>setError(e.message))}>查看本次发送范围</button>{disclosure&&<div className="notice"><p>接收地址：{disclosure.serviceUrl}</p>{disclosure.entries.map((e:Data)=><p key={e.path}>{e.path} · {e.contentType}</p>)}<label className="check"><input type="checkbox" checked={sending} onChange={e=>setSending(e.target.checked)}/>同意向该服务发送以上范围内经过过滤的内容</label></div>}</>}
    {error&&<p role="alert" className="error">{error}</p>}<div className="actions"><button className="btn primary" disabled={busy} onClick={()=>void prepare()}>{busy?'核对中…':'确认并继续'}</button></div></section>;
}
