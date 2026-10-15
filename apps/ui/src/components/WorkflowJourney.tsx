import {useState} from 'react';
import type {Data} from '../api/client';
import {journeySteps,navigationSteps,journeyState,stepStatusLabels} from '../workflowJourney';
export default function WorkflowJourney({step=1,project,run,state,onStep,repairEnabled=false}:{step?:number;page?:string;project?:Data;run?:Data;state:Data;onStep?:(step:number)=>void;repairEnabled?:boolean}){
 const [expanded,setExpanded]=useState(false);
 const statuses=journeyState(project,state,run,repairEnabled);
 return <><button className="btn workflow-toggle" aria-expanded={expanded} aria-controls="workflow-navigation" onClick={()=>setExpanded(!expanded)}>{String(step).padStart(2,'0')} {journeySteps[step-1].title} · {expanded?'收起步骤':'全部步骤'}</button><nav id="workflow-navigation" className={expanded?'workflow-nav expanded':'workflow-nav'} aria-label="完整业务验证流程">{[...new Set(navigationSteps.map(s=>s.group))].map(group=><section key={group}><h2>{group}</h2><ol>{navigationSteps.filter(s=>s.group===group).map(s=><li key={s.id}><button type="button" aria-current={step===s.id?'step':undefined} className={step===s.id?'active':''} onClick={()=>{setExpanded(false);onStep?.(s.id);}} title={statuses[s.id].reason}><span className="step-number">{String(s.id).padStart(2,'0')}</span><span>{s.title}<small>{stepStatusLabels[statuses[s.id].status]}{step===s.id?' · 当前查看':''}</small></span></button></li>)}</ol></section>)}</nav></>;
}
