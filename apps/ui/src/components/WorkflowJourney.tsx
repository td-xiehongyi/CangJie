import type {Data} from '../api/client';
export default function WorkflowJourney({page,project,run,state}:{page:string;project?:Data;run?:Data;state:Data}){
  if(page==='settings')return null;
  if(project?.sourceOnly){const current=project.discovery?.result?3:project.discovery?2:1;return <ol className="journey workflow-journey" aria-label="源码分析步骤">{['选择源码','确认范围','分析业务','查看建议'].map((label,i)=><li key={label} className={current===i?'current':i<current?'done':''} aria-current={current===i?'step':undefined}><span aria-hidden="true">{i<current?'✓':i+1}</span><div>{label}{i===current&&<small>当前步骤</small>}</div></li>)}</ol>;}
  const draft=project?.workflow,choices=Object.entries(draft?.flows?.[draft.flow]??{}).filter(([,c])=>(c as Data).enabled) as [string,Data][],hasSelection=choices.length>0;
  const prepared=project?.supported&&project.preparation?.status==='ready'&&project.preparation.environmentHash===project.environmentHash;
  const plansReady=hasSelection&&choices.every(([id,c])=>state.catalog.matches.some((m:Data)=>m.ref.hash===c.version&&m.ruleHash===state.rules.find((r:Data)=>r.id===id)?.hash));
  const currentRun=page!=='project'&&run&&project&&run.projectId===project.id?run:undefined;
  let current=0;
  if(prepared)current=hasSelection?plansReady?3:2:1;
  if(page==='verify'&&project?.supported)current=hasSelection?plansReady?3:2:1;
  if(currentRun)current=currentRun.status==='running'?3:4;
  const done=[!!prepared||!!currentRun,hasSelection||!!currentRun,plansReady||!!currentRun,currentRun?.status==='completed',false];
  return <ol className="journey workflow-journey" aria-label="本轮检查步骤">{['接入项目','选择检查','准备方案','运行检查','查看结果'].map((label,i)=><li key={label} className={current===i?'current':done[i]?'done':''} aria-current={current===i?'step':undefined}><span aria-hidden="true">{done[i]&&current!==i?'✓':i+1}</span><div>{label}{i===current&&<small>当前步骤</small>}</div></li>)}</ol>;
}
