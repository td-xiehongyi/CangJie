import type {Data} from '../api/client';
import {journeyState,stageForStep,stepStatusLabels} from '../workflowJourney';

const tasks=[{step:2,title:'整理业务'},{step:3,title:'确认范围与预期'},{step:4,title:'运行条件'},{step:5,title:'检查方法'},{step:9,title:'方案审核'},{step:10,title:'开始检查'}];
export default function WorkflowTasks({step,project,state,run,onStep}:{step:number;project?:Data;state:Data;run?:Data;onStep:(step:number)=>void}){
 const stage=stageForStep(step),visible=tasks.filter(task=>stageForStep(task.step).id===stage.id),statuses=journeyState(project,state,run,false);
 if(!visible.length)return null;
 return <nav className="workflow-tasks" aria-label="当前阶段任务"><ol>{visible.map(task=><li key={task.step}><button type="button" data-step={task.step} title={statuses[task.step].reason} aria-current={task.step===step?'step':undefined} onClick={()=>onStep(task.step)}><strong>{task.title}</strong><small>{task.step===step?'当前任务 · ':''}{stepStatusLabels[statuses[task.step].status]}</small></button></li>)}</ol></nav>;
}
