import {useState} from 'react';
import {workflowStages,stageForStep,stageEntry} from '../workflowJourney';
export default function WorkflowJourney({step=1,onStep}:{step?:number;onStep?:(step:number)=>void}){
 const [expanded,setExpanded]=useState(false),current=stageForStep(step);
 return <><button className="btn workflow-toggle" aria-expanded={expanded} aria-controls="workflow-navigation" onClick={()=>setExpanded(!expanded)}>{current.id} {current.title} · {expanded?'收起流程':'查看流程'}</button><nav id="workflow-navigation" className={expanded?'workflow-nav expanded':'workflow-nav'} aria-label="项目检查流程"><ol>{workflowStages.map(stage=><li key={stage.id}><button type="button" aria-current={stage.id===current.id?'step':undefined} className={stage.id===current.id?'active':''} onClick={()=>{setExpanded(false);onStep?.(stageEntry(stage.id,step));}}><span className="step-number">{stage.id}</span><span>{stage.title}<small>{stage.id===current.id?'当前阶段':stage.purpose}</small></span></button></li>)}</ol></nav></>;
}
