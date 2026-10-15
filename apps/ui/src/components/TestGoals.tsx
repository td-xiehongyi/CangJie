import {useCallback,useEffect,useRef,useState} from 'react';
import {api,friendlyError,type CommonProps} from '../api/client';
import {useLeaveGuard} from '../navigation';
export default function TestGoals({project,act,refresh}:CommonProps){
 const saved=project?.journey??{revision:0,goal:'correctness',rate:'',durationSeconds:'',repairEnabled:false};
 const [notes,setNotes]=useState(saved.businessNotes??'');
 const [goal,setGoal]=useState(saved.goal),[rate,setRate]=useState(saved.rate),[duration,setDuration]=useState(saved.durationSeconds),[dirty,setDirty]=useState(false);
 const revision=useRef(saved.revision),saving=useRef<Promise<void>|undefined>(undefined);
 const [error,setError]=useState(''),[savingInputs,setSavingInputs]=useState(false);
 const save=useCallback(async()=>{
  if(!project||!dirty)return;
  if(saving.current)return saving.current;
  setSavingInputs(true);
  const job=(async()=>{setError('');try{const result=await api('/projects/'+project.id+'/journey',{...saved,revision:revision.current,businessNotes:notes,goal,rate,durationSeconds:duration});revision.current=result.revision;await refresh();setDirty(false);}catch(e){setError(friendlyError((e as Error).message));throw e;}})();
  saving.current=job;try{await job;}finally{saving.current=undefined;setSavingInputs(false);}
 },[project?.id,saved,dirty,notes,goal,rate,duration,refresh]);
 useLeaveGuard('test-goals',useCallback(async()=>{try{await save();return true;}catch{return false;}},[save]));
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 useEffect(()=>{if(!dirty){setNotes(saved.businessNotes??'');setGoal(saved.goal);setRate(saved.rate);setDuration(saved.durationSeconds);revision.current=saved.revision;}},[saved.revision,dirty]);
 if(!project)return null;
 return <section className="card"><h2>这次检查什么？</h2><fieldset disabled={savingInputs} style={{border:0,padding:0,margin:0,minWidth:0}}><label className="field">测试目标<select aria-label="测试目标" value={goal} onChange={e=>{setGoal(e.target.value);setDirty(true);}}><option value="correctness">业务是否正确</option><option value="load">指定访问量下的表现</option><option value="both">两项都检查</option></select></label>{goal!=='correctness'&&<div className="form-grid"><label className="field">计划每秒完整检查次数<input type="number" min="0.01" step="any" value={rate} onChange={e=>{setRate(e.target.value);setDirty(true);}}/></label><label className="field">计划持续秒数<input type="number" min="1" max="300" value={duration} onChange={e=>{setDuration(e.target.value);setDirty(true);}}/></label></div>}<details><summary>补充业务说明（可选）</summary><label className="field">业务说明（人工输入）<textarea aria-label="业务说明（人工输入）" maxLength={8000} value={notes} onChange={e=>{setNotes(e.target.value);setDirty(true);}}/></label><p className="fine">只保存为需求草稿，不发送模型，也不把自由文本当成可执行规则。请勿填写密码或密钥；正式检查仍须选择并确认受支持的规则。</p></details><button className="btn" onClick={()=>act(save)}>保存测试目标</button><button hidden={!dirty} className="text-button" onClick={()=>{setNotes(saved.businessNotes??'');setGoal(saved.goal);setRate(saved.rate);setDuration(saved.durationSeconds);revision.current=saved.revision;setDirty(false);setError('');}}>放弃本页修改并加载已保存目标</button></fieldset><p className="notice error" role="alert" hidden={!error}>{error}</p><p role="status">{dirty?'目标尚未保存；继续时会保存。':'当前目标已保存；没有启动任何检查。'}</p></section>;
}
