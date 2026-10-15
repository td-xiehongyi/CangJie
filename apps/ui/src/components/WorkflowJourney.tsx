import type {Data} from '../api/client';
import {journeySteps,journeyState,stepStatusLabels} from '../workflowJourney';
export default function WorkflowJourney({step=1,project,run,state,onStep,repairEnabled=false}:{step?:number;page?:string;project?:Data;run?:Data;state:Data;onStep?:(step:number)=>void;repairEnabled?:boolean}){
 const statuses=journeyState(project,state,run,repairEnabled);
 return <nav className="workflow-nav" aria-label="完整业务验证流程">{[...new Set(journeySteps.map(s=>s.group))].map(group=><section key={group}><h2>{group}</h2><ol>{journeySteps.filter(s=>s.group===group).map(s=><li key={s.id}><button type="button" aria-current={step===s.id?'step':undefined} className={step===s.id?'active':''} onClick={()=>onStep?.(s.id)} title={statuses[s.id].reason}><span className="step-number">{String(s.id).padStart(2,'0')}</span><span>{s.title}<small>{stepStatusLabels[statuses[s.id].status]}{step===s.id?' · 当前查看':''}</small></span></button></li>)}</ol></section>)}</nav>;
}
