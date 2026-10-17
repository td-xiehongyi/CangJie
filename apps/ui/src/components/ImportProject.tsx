import {normalizeProjectDirectory} from '../projectDirectory';
import {useEffect,useRef,useState} from 'react';
import {useLeaveGuard} from '../navigation';
import {api,type CommonProps} from '../api/client';
import ProjectSupport from './ProjectSupport';
export default function ImportProject({project,act,refresh,select,step}:CommonProps){
 const picker=useRef<AbortController|undefined>(undefined);
 const [picking,setPicking]=useState(false);
 const exampleRequest=useRef<AbortController|undefined>(undefined),previousProject=useRef(project?.id);
 const [example,setExample]=useState<string>(),[copying,setCopying]=useState(false),[importing,setImporting]=useState(false);
 useLeaveGuard('import-picker',async()=>{picker.current?.abort();exampleRequest.current?.abort();return true;});
 useEffect(()=>()=>{picker.current?.abort();exampleRequest.current?.abort();},[]);
 const [directory,setDirectory]=useState(()=>{try{return project?.directory??sessionStorage.getItem('cangjie-import-directory')??''}catch{return project?.directory??''}});
 useEffect(()=>{if(previousProject.current!==project?.id){previousProject.current=project?.id;picker.current?.abort();exampleRequest.current?.abort();setDirectory(project?.directory??'');setExample(undefined);}},[project?.id]);
 const current=project&&normalizeProjectDirectory(directory)===project.directory;
 async function prepareExample(){const controller=new AbortController();exampleRequest.current=controller;setCopying(true);try{const value=await api('/examples/ticket',{confirmed:true},'POST',controller.signal);if(!controller.signal.aborted){setDirectory(value.directory);setExample(value.directory);}}catch(e){if(!controller.signal.aborted)throw e;}finally{if(exampleRequest.current===controller)exampleRequest.current=undefined;setCopying(false);}}
 return <section className="card import-paper"><h2>选择项目源码</h2><p>导入后会在本机只读核对支持范围，不发送模型、不启动项目，也不需要测试账号。</p>
  <label className="field">项目目录<input value={directory} disabled={importing} onChange={e=>{picker.current?.abort();exampleRequest.current?.abort();setDirectory(e.target.value);try{sessionStorage.setItem('cangjie-import-directory',e.target.value)}catch{}}} placeholder="粘贴完整路径，也支持资源管理器的“复制为路径”"/></label>
  <p className="fine">可直接粘贴路径；Windows 选择窗口中可按 Ctrl+L 或 Alt+D 输入路径，回车后点击“选择文件夹”。</p>
  <div className="actions"><button className="btn" onClick={()=>act(async()=>{const controller=new AbortController();picker.current=controller;setPicking(true);try{const result=await api('/projects/pick-directory',{},'POST',controller.signal);if(!controller.signal.aborted&&result.directory)setDirectory(result.directory);}catch(e){if(!controller.signal.aborted)throw e;}finally{setPicking(false);if(picker.current===controller)picker.current=undefined;}})} disabled={picking||copying||importing}>选择文件夹</button>{picking&&<button className="text-button" onClick={()=>picker.current?.abort()}>取消选择文件夹</button>}
  <button className={current?'btn':'btn primary'} disabled={!directory.trim()||importing||copying||picking} onClick={()=>act(async()=>{setImporting(true);try{const value=await api('/source-projects',{directory:normalizeProjectDirectory(directory),...(current?{id:project.id,expectedRevision:project.sourceRevision}:{})});await refresh();select(value.id,undefined,'step:1');}finally{setImporting(false);}})}>{importing?'正在导入源码…':'导入源码'}</button></div>
  {current?<div className="imported-project"><p>已导入：<strong>{project.name}</strong></p><ProjectSupport project={project} visible={step===1}/><button className="btn primary" onClick={()=>select(project.id,undefined,'step:2')}>继续：确认检查</button></div>:project&&<p className="notice">目录已更换，请先导入这个目录，再继续确认检查。</p>}
  <details className="example-entry"><summary>没有合适的项目？用示例练习</summary><p>使用已有工单网站，练习提交、核对保存结果和修复后复测。示例结果只代表练习副本，不代表你的网站。</p><p className="fine">只创建本机练习副本，不自动导入、发送或运行。</p><button className="btn" disabled={copying||picking||importing} onClick={()=>act(prepareExample)}>{copying?'正在准备独立副本…':'用工单示例体验'}</button>
   {example===directory&&<p role="status">独立工单示例已准备，路径已填入上方。请点击“导入源码”，再沿四阶段流程继续。</p>}
   <ol><li>导入这份副本，核对静态支持情况；示例可跳过 AI 业务分析。</li><li>在“运行检查 → 运行条件”明确准备环境，再到“确认检查”加入“提交结果保存”，核对预期。</li><li>准备检查方法；已有有效方案可复用，新方法仍需独立验证和具备相应能力的人员审核。</li><li>明确开始检查，在“处理结果”核对实际证据。与开发者或编码工具一起只修改练习副本，再从原结果准备复测。</li></ol>
   <p className="fine">检查方法仍须独立验证和实际审核，不提供预先通过的结果。练习修复只修改这份副本，保留原业务预期与历史证据。</p>
  </details>
 </section>;
}
