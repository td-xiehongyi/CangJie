import {useEffect,useState} from 'react';
import {api,download,type Data} from '../api/client';

export default function ProjectSupport({project,visible}:{project:Data;visible:boolean}){
 const [result,setResult]=useState<Data>(),[error,setError]=useState(false),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
 const key=`${project.id}:${project.sourceRevision}:${project.sourceHash}:${project.directory}`;
 useEffect(()=>{
  setResult(undefined);setError(false);if(!visible)return;
  const controller=new AbortController();setLoading(true);
  void api(`/projects/${encodeURIComponent(project.id)}/support`,undefined,'GET',controller.signal).then(value=>{
   if(value.projectId!==project.id||!['compatible','needs_configuration','unsupported'].includes(value.status)||!Array.isArray(value.gaps))throw new Error('INVALID_SUPPORT_RESULT');
   if(!controller.signal.aborted)setResult({...value,key});
  }).catch(()=>{if(!controller.signal.aborted)setError(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[key,visible,attempt]);
 const support=result?.key===key?result:undefined;
 return <section className="project-support" aria-label="当前项目的静态支持情况"><h3>现在能检查到哪一步？</h3>
  {error?<p role="alert">暂时无法核对支持范围；这不代表网站有问题。可重新读取，或先整理业务。</p>:loading||!support?<p role="status">正在本机只读核对支持范围…</p>:<>
   <p className="support-verdict"><strong>{support.status==='compatible'?'符合当前静态支持条件':support.status==='needs_configuration'?'还需补充运行配置':'超出当前自动准备范围'}</strong></p>
   <p>{support.status==='compatible'?'可以继续确认业务；真正启动、账号和数据核验仍在运行条件中进行。':'请开发者核对下列条件。仍可先整理业务，补齐并重新核对前不能执行检查。'}</p>
   {!!support.gaps.length&&<ul>{support.gaps.map((gap:Data,i:number)=><li key={i}>{gap.detail}</li>)}</ul>}
   {project.sourceHash&&project.sourceHash!==support.sourceHash&&<p className="notice">源码与上次接入记录不同，请重新导入并核对运行条件；历史证据保留。</p>}
   {support.gapMarkdown&&<button className="btn" onClick={()=>download('project-support-gap.md',support.gapMarkdown,'text/markdown')}>下载接入补充说明</button>}
   <details><summary>查看静态核对依据</summary><p>核对时间：{new Date(support.checkedAt).toLocaleString('zh-CN',{hour12:false})}</p><p className="break">源码指纹：{support.sourceHash}</p>{support.gapMarkdown&&<pre>{support.gapMarkdown}</pre>}</details>
  </>}
  <p className="fine">仅核对此刻的本机源码；不代表网站已可运行或业务通过。当前自动运行限已核对的 Node 24／Express 5／Token／HTTP JSON／SQLite 路径；不构成恶意代码安全沙箱。实际执行前仍须重新核对并明确授权。</p>
  <button className="text-button" disabled={loading&&!error} onClick={()=>setAttempt(n=>n+1)}>重新检查支持范围</button>
 </section>;
}
