import {useEffect,useRef} from 'react';
import {journeySteps,journeyState,stepStatusLabels} from '../workflowJourney';
import type {CommonProps} from '../api/client';
export default function JourneyDetails({step=1,state,project,run,onClose}:CommonProps&{onClose:()=>void}){
 const close=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();close.current?.focus();},[]);
 function dismiss(){dialog.current?.close();onClose();}
 const current=journeySteps[step-1],status=journeyState(project,state,run,!!run&&project?.journey?.repairEnabled===true&&project.journey.repairRunId===run.id)[step];
 return <dialog ref={dialog} className="detail-panel" onCancel={e=>{e.preventDefault();dismiss();}} aria-label="当前步骤说明与证据" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();dismiss();}}}><button ref={close} className="btn" onClick={dismiss}>关闭详情</button><h2>{String(step).padStart(2,'0')} {current.title}</h2><p>{current.purpose}</p><p>{stepStatusLabels[status.status]}：{status.reason}</p><h3>项目与版本</h3><p>{project?.name??'尚未导入'}</p><p className="fine">{project?.sourceHash??project?.sourceSnapshot?.sourceHash??'尚无源码快照'}</p>{step===2&&<><h3>授权文件</h3><ul>{project?.sourceSnapshot?.files?.map((f:any)=><li key={f.path}>{f.path} · {f.bytes}字节</li>)}</ul><p>完整发送内容须在02预览并确认，打开此面板不会发送文件。</p></>}{[5,6,7,8,9].includes(step)&&<><h3>当前候选</h3><p>{project?.candidate?.id??'尚无候选记录'}</p><p>独立验证：{project?.candidate?.validation?.recordRef??'尚无记录'}</p><p>项目试运行：{project?.candidate?.trial?.completed?'已有记录，请核对判定':'尚未完成'}</p></>}{run&&project&&run.projectId===project.id&&<><h3>当前运行</h3><p>{run?.id}</p><p>{run?.status}</p><p>返回11查看真实业务结论及未覆盖范围。运行结束不等于业务通过。</p></>}<p className="fine">查看详情和切换步骤均不会启动模型、验证或负载任务。</p></dialog>;
}
