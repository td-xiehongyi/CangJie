import {useCallback,useEffect,useRef,useState} from 'react';
import {api,friendlyError,type Data} from './api/client';
import {useLeaveGuard} from './navigation';
export type Choice={enabled:boolean;confirmed:boolean;version?:string;ruleHash:string;environmentHash:string};
type Draft={revision:number;flow:string;flows:Record<string,Record<string,Choice>>};
const empty=():Draft=>({revision:0,flow:'submit',flows:{}});

export function useWorkflow(project:Data|undefined){
  const [draft,setDraft]=useState<Draft>(()=>project?.workflow?{...project.workflow,flow:project.workflow.revision===0&&project.candidate?.ruleId==='title-update-rule'?'edit':project.workflow.flow}:empty()),[status,setStatus]=useState('检查选择已保存'),[error,setError]=useState('');
  const working=useRef(draft),revision=useRef(draft.revision),sequence=useRef(0),savedSequence=useRef(0),saving=useRef<Promise<void>|undefined>(undefined),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),mounted=useRef(true);
  const notify=(value:string)=>{if(mounted.current)setStatus(value);};
  const flush=useCallback(async()=>{
    clearTimeout(timer.current);if(!project)return;
    if(saving.current)return saving.current;
    if(savedSequence.current===sequence.current)return;
    const job=(async()=>{
      while(savedSequence.current!==sequence.current){
        const snapshot=working.current,seq=sequence.current;notify('正在保存检查选择…');if(mounted.current)setError('');
        try{const next=await api(`/projects/${project.id}/workflow`,{revision:revision.current,flow:snapshot.flow,choices:snapshot.flows[snapshot.flow]??{}}) as Draft;
          revision.current=next.revision;savedSequence.current=seq;
          if(seq===sequence.current){working.current=next;if(mounted.current)setDraft(next);notify('检查选择已保存');}
        }catch(e){notify('检查选择尚未保存');if(mounted.current)setError(friendlyError((e as Error).message));throw e;}
      }
    })();saving.current=job;try{await job;}finally{if(saving.current===job)saving.current=undefined;}
  },[project?.id]);
  const guard=useCallback(async()=>{try{await flush();return true;}catch{return false;}},[flush]);useLeaveGuard('workflow',guard);
  useEffect(()=>{mounted.current=true;const before=(e:BeforeUnloadEvent)=>{if(savedSequence.current!==sequence.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',before);return()=>{mounted.current=false;clearTimeout(timer.current);window.removeEventListener('beforeunload',before);};},[]);
  useEffect(()=>{const incoming=project?.workflow as Draft|undefined;if(incoming&&incoming.revision>revision.current&&sequence.current===savedSequence.current&&!saving.current){revision.current=incoming.revision;working.current=incoming;setDraft(incoming);}},[project?.workflow]);
  function update(next:Draft){working.current=next;sequence.current++;setDraft(next);setStatus('正在保存检查选择…');clearTimeout(timer.current);timer.current=setTimeout(()=>void flush().catch(()=>{}),200);}
  function setSelected(value:Record<string,Choice>|((previous:Record<string,Choice>)=>Record<string,Choice>)){
    const previous=working.current,choices=typeof value==='function'?value(previous.flows[previous.flow]??{}):value;
    if(JSON.stringify(choices)===JSON.stringify(previous.flows[previous.flow]??{}))return;
    update({...previous,flows:{...previous.flows,[previous.flow]:choices}});
  }
  async function setFlow(flow:string){try{await flush();update({...working.current,flow});}catch{/* Keep the edited flow visible until its draft is saved. */}}
  async function retry(){try{const state=await api('/state'),latest=state.projects.find((p:Data)=>p.id===project!.id);revision.current=latest.workflow.revision;await flush();}catch{/* Error is presented next to the preserved local selection. */}}
  async function loadSaved(){const state=await api('/state'),latest=state.projects.find((p:Data)=>p.id===project!.id);working.current=latest.workflow;revision.current=latest.workflow.revision;savedSequence.current=sequence.current;setDraft(latest.workflow);setError('');setStatus('检查选择已保存');}
  return {snapshot:()=>working.current,flow:draft.flow,selected:draft.flows[draft.flow]??{},setFlow,setSelected,flush,status,error,retry,loadSaved};
}
