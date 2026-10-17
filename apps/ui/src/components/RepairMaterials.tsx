import {useEffect,useState} from 'react';
import {api,download,friendlyError,type Data} from '../api/client';
import DetailPanel from './DetailPanel';

export default function RepairMaterials({run,primary=false}:{run:Data;primary?:boolean}){
 return <DetailPanel label="预览修复材料" title="修复材料预览" triggerClassName={primary?'btn primary':'btn'}><MaterialContent key={run.id} run={run}/></DetailPanel>;
}
function MaterialContent({run}:{run:Data}){
 const [material,setMaterial]=useState<string>(),[error,setError]=useState(''),[notice,setNotice]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const controller=new AbortController();setMaterial(undefined);setError('');setNotice('');void api(`/runs/${run.id}/repair-report`,undefined,'GET',controller.signal).then(value=>{if(controller.signal.aborted)return;if(typeof value!=='string'||!value.trim())throw new Error('修复材料格式不完整，请重新读取。');setMaterial(value);}).catch(e=>{if(!controller.signal.aborted)setError(friendlyError(e.message));});return()=>controller.abort();},[run.id,attempt]);
 return <><p>以下是本次实际导出的完整材料。包含业务观察和证据引用；分享前请核对内容。平台不会自动发送给其他工具。</p><p className="fine">运行：{run.id} · 项目：{run.projectId}</p>{error?<div role="alert" className="notice error"><p>无法读取修复材料：{error}</p><button className="btn" onClick={()=>setAttempt(value=>value+1)}>重新读取材料</button></div>:material===undefined?<p role="status">正在读取本次修复材料…</p>:<><pre className="repair-preview" tabIndex={0} aria-label="完整修复材料">{material}</pre><div className="actions"><button className="btn" onClick={()=>void navigator.clipboard.writeText(material).then(()=>setNotice('修复材料已复制；尚未发送给其他工具。')).catch(()=>setNotice('未能复制，请下载材料。'))}>复制修复材料</button><button className="btn primary" onClick={()=>download(run.id+'-repair.md',material,'text/markdown')}>下载当前修复材料</button></div></>}{notice&&<p role="status">{notice}</p>}</>;
}
