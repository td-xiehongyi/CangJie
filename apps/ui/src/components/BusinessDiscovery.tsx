import DetailPanel from './DetailPanel';
import {useEffect,useRef,useState} from 'react';
import {api,discoveryApi,friendlyError,type CommonProps,type Data} from '../api/client';
import {businessName,businessText} from '../businessNames';

function Citation({session,refValue}:{session:Data;refValue:Data}){
  const [excerpt,setExcerpt]=useState<Data>(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const label=`${refValue.path}:${refValue.startLine}-${refValue.endLine}`;
  const index=session.reads.findIndex((read:Data)=>read.ref.excerptHash===refValue.excerptHash&&read.ref.path===refValue.path&&read.ref.startLine===refValue.startLine&&read.ref.endLine===refValue.endLine);
  return <div className="source-citation"><button className="text-button" disabled={loading||index<0} onClick={()=>{if(excerpt){setExcerpt(undefined);return;}setLoading(true);void discoveryApi.excerpt(session.id,index).then(setExcerpt).catch(e=>setError(friendlyError(e.message))).finally(()=>setLoading(false));}}>{loading?'正在核对源码…':excerpt?'收起源码 '+label:'展开源码 '+label}</button>{error&&<p role="alert">{error}</p>}{excerpt&&<div role="region" aria-label={'源码片段 '+label}><p className="fine">{excerpt.valid&&session.referencesValid?'引用与当前源码一致':'历史片段：当前源码引用已失效'}</p><pre>{excerpt.text}</pre></div>}</div>;
}
export default function BusinessDiscovery({state,project,refresh,select}:{state:CommonProps['state'];project:Data;refresh:CommonProps['refresh'];select:CommonProps['select'];onPrepareRuntime?:()=>void}){
  const [preview,setPreview]=useState<Data>(),[working,setWorking]=useState(false),[error,setError]=useState(''),[fullInput,setFullInput]=useState<Data>();
  const busy=useRef(false),scopeRevision=useRef<number|undefined>(undefined),errorNotice=useRef<HTMLDivElement>(null),previewHeading=useRef<HTMLHeadingElement>(null);
  const session=project.discovery,active=!!session&&['running','draft'].includes(session.status),configured=!!(state.settings.model&&state.settings.hasKey),result=session?.result;
  const t=(value:string)=>businessText(value,result?.translations);
  const modelContext=state.settings.serviceUrl+'|'+state.settings.model,previousModel=useRef(modelContext);
  useEffect(()=>{if(previousModel.current!==modelContext){previousModel.current=modelContext;setFullInput(undefined);}},[modelContext]);
  useEffect(()=>{if(error){errorNotice.current?.focus({preventScroll:true});errorNotice.current?.scrollIntoView({block:'nearest'});}},[error]);
  useEffect(()=>{if(fullInput){previewHeading.current?.focus({preventScroll:true});previewHeading.current?.scrollIntoView({block:'start'});}},[fullInput]);
  useEffect(()=>{let current=true;void discoveryApi.scope(project.id).then(value=>{
    if(!current)return;setPreview(value);scopeRevision.current=value.revision;
  }).catch(e=>{if(current)setError(friendlyError(e.message))});return()=>{current=false};},[project.id]);
  async function work(task:()=>Promise<void>){if(busy.current)return;busy.current=true;setWorking(true);setError('');try{await task()}catch(e){setError(friendlyError((e as Error).message))}finally{busy.current=false;setWorking(false)}}
  async function checkMaterials(){
    if(!preview)return;setFullInput(undefined);
    // One explicit local action refreshes the source and scope, never sends it.
    const value=await api('/source-projects',{id:project.id,directory:project.directory,expectedRevision:scopeRevision.current,allowedPaths:['.'],excludedPaths:[],includeProjectTests:true});
    scopeRevision.current=value.revision;setPreview(value);
    const material=await api('/projects/'+project.id+'/discovery-input',{expectedRevision:value.revision,mode:'automatic',prompt:''});
    setFullInput(material);await refresh();
  }
  async function manual(){await api('/projects/'+project.id+'/journey',{...project.journey,skipAnalysis:true});await refresh();select(project.id,undefined,'step:3');}
  const reads=session?.reads??[],readPaths=new Set(reads.map((r:Data)=>r.ref.path)),indexed=preview?.snapshot.files??project.sourceSnapshot?.files??[],unread=indexed.filter((f:Data)=>!readPaths.has(f.path));
  const labels:Record<string,string>={draft:'正在准备分析',running:'正在梳理业务',partial:'分析尚未完成',paused:'分析已暂停',completed:'业务草稿已生成',stale:'源码已变化，请重新检查材料',failed:'分析未完成'};
  const recovery=session?.recovery;
  const canResume=!!recovery?.allowed&&['paused','partial','failed'].includes(session?.status);
  return <section className="business-discovery stack" aria-label="源码业务分析">
    <div className="form-grid">
      <section className="card stack"><h2>AI读取项目分析</h2><p>读取项目源码与测试文件，由AI整理业务、预期和待确认问题。</p><button className="btn primary" disabled={working||active||!preview} onClick={()=>void work(checkMaterials)}>{working?'正在准备…':'读取项目'}</button><p className="fine">自动排除密钥、依赖、数据库及构建产物。发送前只需确认一次。</p></section>
      <section className="card stack"><h2>自行填写业务</h2><p>你已了解项目，直接填写业务说明，确认这次要检查的业务。</p><button className="btn" disabled={working||active} onClick={()=>void work(manual)}>自行填写并确认业务</button><p className="fine">不调用AI。检查方法在“运行检查”中选择或生成。</p></section>
    </div>
    {error&&<div ref={errorNotice} tabIndex={-1} className="notice error" role="alert"><p>{error}</p>{error.includes('另一页面')&&<button className="text-button" disabled={working} onClick={()=>void work(async()=>{const value=await discoveryApi.scope(project.id);setPreview(value);scopeRevision.current=value.revision;setFullInput(undefined);setError('');})}>加载最新项目状态</button>}</div>}
    {session&&<section className="card" aria-label="分析状态"><h2>{labels[session.status]??session.status}</h2>
      <p role="status">{active?'正在分析已确认的材料，可暂停后继续。':recovery?.message??(session.status==='completed'?'请核对业务预期，AI建议尚未成为已确认规则。':friendlyError(session.unresolved?.at(-1)??''))}</p>
      {!active&&session.status!=='completed'&&<p>{result?'已保留业务草稿，尚未完整；可先核对业务。':'尚未形成业务草稿；读取与调用记录已保留。'}</p>}
      <div className="actions">{active?<button className="btn" disabled={working} onClick={()=>void work(async()=>{await discoveryApi.pause(session.id);await refresh()})}>暂停分析</button>:<>
        {canResume&&<button className="btn primary" disabled={working||!configured&&recovery.reason!=='saved_response'} onClick={()=>void work(async()=>{try{await discoveryApi.resume(session.id,session.revision)}finally{await refresh()}})}>{recovery.reason==='saved_response'?'恢复已保存的业务草稿（不调用模型）':'继续原分析（调用模型）'}</button>}
        {result&&<button className="btn primary" onClick={()=>select(project.id,undefined,'step:3')}>继续：确认范围与预期</button>}
      </>}</div>
      {canResume&&session.unresolved?.length>0&&<p>{friendlyError(session.unresolved.at(-1))}</p>}
      {canResume&&!configured&&<button className="text-button" onClick={()=>select(project.id,undefined,'settings')}>配置模型后继续</button>}
    </section>}
    {fullInput&&<section className="card stack" aria-label="待发送材料"><h3 ref={previewHeading} tabIndex={-1}>确认发送项目</h3><p>{project.name} · {fullInput.reads.length} 个文件 · {(fullInput.totalBytes/1024).toFixed(1)} KB</p><p>接收方：{preview?.scope.serviceUrl} · {state.settings.model||'尚未配置模型'}</p>
        <DetailPanel label="查看完整文件清单与正文">{fullInput.reads.map((read:Data)=><details key={read.ref.path}><summary>{read.ref.path} · {read.bytes}字节</summary><pre>{read.text}</pre></details>)}</DetailPanel>
        <p className="fine">点击下方按钮，即同意发送这些材料并调用模型。分析结果仍需你核对。</p>
        {!configured&&<p className="notice">请先配置模型和密钥，才能发送材料。<button className="text-button" onClick={()=>select(project.id,undefined,'settings')}>配置分析模型</button></p>}
        <button className="btn primary" disabled={!configured||working||active} onClick={()=>void work(async()=>{if(project.journey?.skipAnalysis)await api('/projects/'+project.id+'/journey',{...project.journey,skipAnalysis:false});await discoveryApi.start(project.id,{confirmed:true,scopeHash:preview!.scope.scopeHash,expectedRevision:preview!.revision,requestId:crypto.randomUUID(),input:{mode:'automatic',prompt:'',manifestHash:fullInput.manifestHash}});setFullInput(undefined);await refresh();const latest=await discoveryApi.scope(project.id);setPreview(latest);scopeRevision.current=latest.revision;})}>{working?'正在启动…':'同意发送并开始分析'}</button>
        <button className="text-button" disabled={working} onClick={()=>setFullInput(undefined)}>取消</button>
    </section>}
    {result&&<>
      <section className="card"><h2>业务草稿</h2><p>{t(result.summary)}</p><dl><dt>业务对象</dt><dd>{result.objects.map(t).join('、')}</dd><dt>角色</dt><dd>{result.roles.map(t).join('、')}</dd></dl>{result.flows.map((flow:Data,i:number)=><article key={i} className="discovery-flow"><h3>{businessName(t(flow.name),i)}</h3><p>操作流程：{flow.steps.map(t).join(' → ')}</p><p>相关数据：{flow.data.map(t).join('、')}</p>{flow.sourceRefs.map((ref:Data,j:number)=><Citation key={j} session={session} refValue={ref}/>)}</article>)}</section>
      <section className="card"><h2>建议核对的业务</h2><p className="notice">仅建议，尚未确认业务预期，也未执行检查。</p>{result.suggestions.length===0&&<p>当前材料不足以提出有依据的检查，请先补充未决事项。</p>}{result.suggestions.map((s:Data,index:number)=><article key={s.id} className="discovery-suggestion"><span className="pill">建议 · 待确认</span><h3>{businessName(t(s.flow),index)}</h3><p>{t(s.priorityReason)}</p><details><summary>查看源码事实与依据</summary><h4>源码事实</h4>{s.facts.map((f:Data,i:number)=><div key={i}><p>{t(f.text)}</p>{f.sourceRefs.map((ref:Data,j:number)=><Citation key={j} session={session} refValue={ref}/>)}</div>)}</details><h4>候选预期 · 待你确认</h4>{s.expectations.map((e:Data,i:number)=><div key={i}><p className="fine">{e.source==='documentation'?'文档中的预期 · 待核对':e.source==='project_test'?'项目测试预期 · 待核对':'AI 候选预期 · 待确认'}</p><p>{t(e.text)}</p>{e.sourceRefs.map((ref:Data,j:number)=><Citation key={j} session={session} refValue={ref}/>)}</div>)}<details><summary>风险与业务边界</summary><h4>AI 风险假设 · 未验证</h4>{s.risks.map((r:Data,i:number)=><div key={i}><p>{t(r.text)}</p>{r.sourceRefs.map((ref:Data,j:number)=><Citation key={j} session={session} refValue={ref}/>)}</div>)}<h4>业务边界梳理 待核对</h4><p>前置条件：{s.preconditions?.map(t).join('；')||'历史记录未单列，请核对'}</p><p>异常分支：{s.exceptions?.map(t).join('；')||'尚未识别，不代表不存在'}</p><p>状态变化：{s.stateChanges?.map(t).join('；')||'尚未识别，不代表无变化'}</p></details><h4>需要你确认的问题</h4><ul>{s.openQuestions.map((q:string,i:number)=><li key={i}>{t(q)}</li>)}</ul><p className="fine">操作前提：{s.operationNeeds.map(t).join('；')||'尚待补充'}</p><p className="fine">需要观察：{s.observationNeeds.map(t).join('；')||'尚待补充'}</p>{s.sourceRefs.map((ref:Data,i:number)=><Citation key={i} session={session} refValue={ref}/>)}<button className="btn" disabled={working||active||session.status==='stale'} onClick={()=>void work(async()=>{await discoveryApi.select(session.id,s.id,session.revision);await refresh();select(project.id,undefined,'step:3');})}>核对这项业务</button></article>)}</section>
    </>}
    <DetailPanel label="查看分析详情与记录"><h2>分析范围与记录</h2><p>模型：{state.settings.model||'未配置'} · {state.settings.serviceUrl}</p><button className="text-button" onClick={()=>select(project.id,undefined,'settings')}>修改分析模型</button><p>正文总量及单文件上限64 KB；请求最多96 KB。累计上限8次、10分钟、120000 token。超限不会静默截断。</p>
      {session&&<><p>已用 {session.budget.calls}/8 次 · {session.budget.tokens}/120000 token。读取与调用记录不代表模型已完成理解。</p><h3>历史停止记录</h3><ul>{session.unresolved.map((v:string,i:number)=><li key={i}>{friendlyError(v)}</li>)}</ul><p>已索引 {indexed.length} 个文件，提供正文 {readPaths.size} 个，尚未提供 {unread.length} 个。</p><ul>{reads.map((r:Data,i:number)=><li key={i}>{r.ref.path}:{r.ref.startLine}-{r.ref.endLine}</li>)}</ul></>}
      <h3>排除与索引问题</h3><ul>{(preview?.snapshot.indexIssues??project.sourceSnapshot?.indexIssues??[]).map((v:Data,i:number)=><li key={i}>{v.path} · {v.code} · {v.detail}</li>)}</ul><p>静态读取不保证发现全部业务；非JS/TS文件不做语法关系解析。</p>
    </DetailPanel>
    {result&&<section className="notice"><h3>仍需核对的范围</h3><ul>{[...(result.limitations??[]),...(result.unresolved??[])].map((v:string,i:number)=><li key={i}>{t(v)}</li>)}</ul>{unread.length>0&&<p>还有 {unread.length} 个文件未提供正文，相关业务可能未覆盖。</p>}</section>}
  </section>;
}
