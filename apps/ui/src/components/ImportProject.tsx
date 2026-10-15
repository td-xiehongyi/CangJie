import {normalizeProjectDirectory} from '../projectDirectory';
import {useEffect,useRef,useState} from 'react';
import {useLeaveGuard} from '../navigation';
import {api,type CommonProps} from '../api/client';
export default function ImportProject({project,act,refresh,select}:CommonProps){
 const picker=useRef<AbortController|undefined>(undefined);
 const [picking,setPicking]=useState(false);
 useLeaveGuard('import-picker',async()=>{picker.current?.abort();return true;});
 useEffect(()=>()=>picker.current?.abort(),[]);
 const [directory,setDirectory]=useState(()=>{try{return project?.directory??sessionStorage.getItem('cangjie-import-directory')??''}catch{return project?.directory??''}});
 return <section className="card"><h2>01 导入源码</h2><p>这里只索引文件，不发送模型、不启动项目，也不需要测试账号。</p><label className="field">项目目录<input value={directory} onChange={e=>{setDirectory(e.target.value);try{sessionStorage.setItem('cangjie-import-directory',e.target.value)}catch{}}} placeholder="粘贴完整路径，也支持资源管理器的“复制为路径”"/></label><p className="fine">可直接粘贴路径；Windows 选择窗口中可按 Ctrl+L 或 Alt+D 输入路径，回车后点击“选择文件夹”。</p><button className="btn" onClick={()=>act(async()=>{const controller=new AbortController();picker.current=controller;setPicking(true);try{const result=await api('/projects/pick-directory',{},'POST',controller.signal);if(!controller.signal.aborted&&result.directory)setDirectory(result.directory);}catch(e){if(!controller.signal.aborted)throw e;}finally{setPicking(false);if(picker.current===controller)picker.current=undefined;}})} disabled={picking}>选择文件夹</button>{picking&&<button className="text-button" onClick={()=>picker.current?.abort()}>取消选择文件夹</button>}<button className="btn primary" disabled={!directory.trim()} onClick={()=>act(async()=>{const value=await api('/source-projects',{directory:normalizeProjectDirectory(directory),...(project&&normalizeProjectDirectory(directory)===project.directory?{id:project.id,expectedRevision:project.sourceRevision}:{})});await refresh();select(value.id,undefined,'step:1');})}>导入源码</button>{project&&<div className="info-strip"><p>已导入：{project.name}。继续了解业务或直接确认已知的检查要求。</p><button className="btn" onClick={()=>select(project.id,undefined,'step:2')}>前往02 了解与分析业务</button></div>}</section>;
}
