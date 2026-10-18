import {useEffect,useState} from 'react';
import {api,ruleNames,type Data} from '../api/client';
import {compareRuns,differenceFor} from '../reportEvidence';

export default function RunComparison({run,state,select}:{run:Data;state:Data;select:(projectId:string,runId?:string,page?:string)=>void}){
 const saved=state.runs.find((r:Data)=>r.id===run.parentRunId&&r.projectId===run.projectId);
 const [loaded,setLoaded]=useState<Data>(),[loading,setLoading]=useState(false),[readError,setReadError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  setLoaded(undefined);setReadError(false);if(saved||!run.parentRunId){setLoading(false);return;}
  const controller=new AbortController();setLoading(true);
  void api(`/runs/${encodeURIComponent(run.parentRunId)}`,undefined,'GET',controller.signal).then(value=>{if(!controller.signal.aborted&&value.id===run.parentRunId&&value.projectId===run.projectId)setLoaded(value);}).catch(()=>{if(!controller.signal.aborted)setReadError(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[run.id,run.parentRunId,run.projectId,!!saved,attempt]);
 const previous=saved??(loaded&&loaded.id===run.parentRunId&&loaded.projectId===run.projectId?loaded:undefined),comparison=compareRuns(previous,run);
 return <section className="card retest-comparison" aria-label="原运行与本次复测对比"><h2>复测对比</h2>{loading?<p role="status">正在读取原运行记录…</p>:!comparison.available?<div className="notice"><p>{readError?'暂时无法读取原运行；本次结果仍可查看，尚不能进行对比。':comparison.reason}</p>{readError&&<button className="btn" onClick={()=>setAttempt(value=>value+1)}>重新读取原运行</button>}</div>:<><p>按固定业务预期与检查方法核对两次结果。局部通过仅说明本次条件下的结果。</p><div className="comparison-meta"><p>上次：{previous!.id.slice(0,8)} · {new Date(previous!.startedAt).toLocaleString('zh-CN',{hour12:false})}</p><p>本次：{run.id.slice(0,8)} · {new Date(run.startedAt).toLocaleString('zh-CN',{hour12:false})}</p></div>{comparison.sourceChanged&&<p className="notice">源码已变化。本次结果绑定新源码，旧运行与证据保留。</p>}{comparison.mappingChanged&&<p className="notice">接口映射已变化；两次结果分别保留，不能直接判定已修复。</p>}<div className="comparison-table" role="region" aria-label="逐项复测对照" tabIndex={0}><table><thead><tr><th scope="col">检查</th><th scope="col">上次</th><th scope="col">本次</th><th scope="col">结论</th></tr></thead><tbody>{comparison.rows.map(row=><tr key={row.ruleId}><th scope="row">{ruleNames[row.ruleId]??row.ruleId}</th><td>{row.previous}</td><td>{row.current}</td><td>{row.conclusion}<ComparisonEvidence row={row}/></td></tr>)}</tbody></table></div><details><summary>核对两次固定版本与范围</summary><p>上次源码：{previous!.plan.sourceHash}</p><p>本次源码：{run.plan.sourceHash}</p>{comparison.rows.map(row=><div key={row.ruleId}><h3>{ruleNames[row.ruleId]??row.ruleId}</h3><p>上次方案：{row.previousCheck?.templateRef?.id??'未记录'} @ {row.previousCheck?.templateRef?.version??'未记录'}</p><p>本次方案：{row.currentCheck?.templateRef?.id??'未记录'} @ {row.currentCheck?.templateRef?.version??'未记录'}</p><p>上次数据基线：{row.previousCheck?.preparation?.baseline?.summary?.hash??'未记录'}</p><p>本次数据基线：{row.currentCheck?.preparation?.baseline?.summary?.hash??'未记录'}</p><p>上次预期：{[...(row.previousCheck?.rule.expectedChanges??[]),...(row.previousCheck?.rule.invariants??[])].join('；')||'未记录'}</p><p>本次预期：{[...(row.currentCheck?.rule.expectedChanges??[]),...(row.currentCheck?.rule.invariants??[])].join('；')||'未记录'}</p></div>)}</details><button className="text-button" onClick={()=>select(run.projectId,previous!.id,'step:11')}>查看原运行与证据</button></>}</section>;
}

function ComparisonEvidence({row}:{row:Data}){
 const assertions=[...new Set<string>([...(row.previousCheck?.verdicts??[]),...(row.currentCheck?.verdicts??[])].map((v:Data)=>v.assertionRef))];
 if(!assertions.length)return null;
 return <details><summary>查看两次实际值与证据</summary>{assertions.map(id=>{
  const old=row.previousCheck?.verdicts.find((v:Data)=>v.assertionRef===id),next=row.currentCheck?.verdicts.find((v:Data)=>v.assertionRef===id);
  const before=old?differenceFor(row.previousCheck,old):undefined,after=next?differenceFor(row.currentCheck,next):undefined;
  return <div className="comparison-values" key={id}><p>检查依据：{id}</p><p>上次操作前：{before?.before??'未取得'}</p><p>上次预期值：{before?.expected??'未取得'}</p><p>上次实际值：{before?.actual??'未取得'}</p><p>本次操作前：{after?.before??'未取得'}</p><p>本次预期值：{after?.expected??'未取得'}</p><p>本次实际值：{after?.actual??'未取得'}</p><p>上次证据引用：{old?.evidenceRefs?.join('、')||'未取得'}</p><p>本次证据引用：{next?.evidenceRefs?.join('、')||'未取得'}</p></div>;
 })}</details>;
}
