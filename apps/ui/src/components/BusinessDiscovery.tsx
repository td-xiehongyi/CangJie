import DetailPanel from './DetailPanel';
import {useEffect,useRef,useState} from 'react';
import {api,discoveryApi,friendlyError,type CommonProps,type Data} from '../api/client';

function Citation({session,refValue}:{session:Data;refValue:Data}){
  const [excerpt,setExcerpt]=useState<Data>(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const label=`${refValue.path}:${refValue.startLine}-${refValue.endLine}`;
  const index=session.reads.findIndex((read:Data)=>read.ref.excerptHash===refValue.excerptHash&&read.ref.path===refValue.path&&read.ref.startLine===refValue.startLine&&read.ref.endLine===refValue.endLine);
  return <div className="source-citation"><button className="text-button" disabled={loading||index<0} onClick={()=>{if(excerpt){setExcerpt(undefined);return;}setLoading(true);void discoveryApi.excerpt(session.id,index).then(setExcerpt).catch(e=>setError(friendlyError(e.message))).finally(()=>setLoading(false));}}>{loading?'正在核对源码…':excerpt?'收起源码 '+label:'展开源码 '+label}</button>{error&&<p role="alert">{error}</p>}{excerpt&&<div role="region" aria-label={'源码片段 '+label}><p className="fine">{excerpt.valid&&session.referencesValid?'引用与当前源码一致':'历史片段：当前源码引用已失效'}</p><pre>{excerpt.text}</pre></div>}</div>;
}
export default function BusinessDiscovery({state,project,refresh,select}:{state:CommonProps['state'];project:Data;refresh:CommonProps['refresh'];select:CommonProps['select'];onPrepareRuntime?:()=>void}){
  const [preview,setPreview]=useState<Data>(),[expanded,setExpanded]=useState(false),[paths,setPaths]=useState('.'),[excluded,setExcluded]=useState(''),[tests,setTests]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState('');
  const [prompt,setPrompt]=useState(project.journey?.analysisMode==='prompt'?(project.journey?.analysisPrompt??''):''),[fullInput,setFullInput]=useState<Data>(),[editing,setEditing]=useState(false),[draftReady,setDraftReady]=useState(false),[draftNotice,setDraftNotice]=useState('');
  const busy=useRef(false),draftChanged=useRef(false),scopeRevision=useRef<number|undefined>(undefined),errorNotice=useRef<HTMLDivElement>(null),previewHeading=useRef<HTMLHeadingElement>(null);
  const draftKey='cangjie:analysis-draft:'+project.id;
  const session=project.discovery,active=!!session&&['running','draft'].includes(session.status),configured=!!(state.settings.model&&state.settings.hasKey),result=session?.result;
  const mode=prompt.trim()?'prompt':'automatic';
  const modelContext=state.settings.serviceUrl+'|'+state.settings.model,previousModel=useRef(modelContext);
  useEffect(()=>{if(previousModel.current!==modelContext){previousModel.current=modelContext;setFullInput(undefined);}},[modelContext]);
  useEffect(()=>{if(error){errorNotice.current?.focus({preventScroll:true});errorNotice.current?.scrollIntoView({block:'nearest'});}},[error]);
  useEffect(()=>{if(fullInput){previewHeading.current?.focus({preventScroll:true});previewHeading.current?.scrollIntoView({block:'start'});}},[fullInput]);
  useEffect(()=>{let current=true;void discoveryApi.scope(project.id).then(value=>{
    if(!current)return;setPreview(value);scopeRevision.current=value.revision;
    let saved:Data|undefined;try{const raw=localStorage.getItem(draftKey);if(raw)saved=JSON.parse(raw);}catch{setDraftNotice('无法读取本机草稿，请保留本页输入。');}
    setPaths(saved?.scopeDirty&&typeof saved.paths==='string'?saved.paths:value.scope.allowedPaths.join('\n'));setExcluded(saved?.scopeDirty&&typeof saved.excluded==='string'?saved.excluded:value.scope.excludedPaths.join('\n'));setTests(saved?.scopeDirty&&typeof saved.tests==='boolean'?saved.tests:value.scope.includeProjectTests);
    if(typeof saved?.prompt==='string')setPrompt(saved.prompt);
    // A draft edited against an older revision must not overwrite another tab's range.
    if(saved?.scopeDirty&&typeof saved.scopeRevision==='number')scopeRevision.current=saved.scopeRevision;
    setDraftReady(true);
  }).catch(e=>{if(current)setError(friendlyError(e.message))});return()=>{current=false};},[project.id]);
  const scopeDirty=!!preview&&(paths!==preview.scope.allowedPaths.join('\n')||excluded!==preview.scope.excludedPaths.join('\n')||tests!==preview.scope.includeProjectTests);
  useEffect(()=>{if(!draftReady)return;try{localStorage.setItem(draftKey,JSON.stringify({paths,excluded,tests,prompt,scopeDirty,scopeRevision:scopeRevision.current}));setDraftNotice('草稿已保存到本机浏览器');draftChanged.current=false;}catch{draftChanged.current=true;setDraftNotice('草稿保存失败，请保留本页；刷新可能丢失输入。');}},[draftReady,paths,excluded,tests,prompt,scopeDirty,draftKey]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(draftChanged.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
  function invalidate(){setFullInput(undefined);draftChanged.current=true;}
  async function work(task:()=>Promise<void>){if(busy.current)return;busy.current=true;setWorking(true);setError('');try{await task()}catch(e){setError(friendlyError((e as Error).message))}finally{busy.current=false;setWorking(false)}}
  async function checkMaterials(){
    if(!preview)return;setFullInput(undefined);
    // One explicit local action refreshes the source and scope, never sends it.
    const value=await api('/source-projects',{id:project.id,directory:project.directory,expectedRevision:scopeRevision.current,allowedPaths:paths.split('\n').map(v=>v.trim()).filter(Boolean),excludedPaths:excluded.split('\n').map(v=>v.trim()).filter(Boolean),includeProjectTests:tests});
    scopeRevision.current=value.revision;setPreview(value);setPaths(value.scope.allowedPaths.join('\n'));setExcluded(value.scope.excludedPaths.join('\n'));setTests(value.scope.includeProjectTests);
    const material=await api('/projects/'+project.id+'/discovery-input',{expectedRevision:value.revision,mode,prompt:mode==='prompt'?prompt:''});
    setFullInput(material);await refresh();
  }
  async function manual(){await api('/projects/'+project.id+'/journey',{...project.journey,skipAnalysis:true});await refresh();select(project.id,undefined,'step:3');}
  const reads=session?.reads??[],readPaths=new Set(reads.map((r:Data)=>r.ref.path)),indexed=preview?.snapshot.files??project.sourceSnapshot?.files??[],unread=indexed.filter((f:Data)=>!readPaths.has(f.path));
  const labels:Record<string,string>={draft:'正在准备分析',running:'正在梳理业务',partial:'分析尚未完成',paused:'分析已暂停',completed:'业务草稿已生成',stale:'源码已变化，请重新检查材料',failed:'分析未完成'};
  const recovery=session?.recovery;
  const canResume=!!recovery?.allowed&&['paused','partial','failed'].includes(session?.status);
  const showSetup=!session||editing;
  return <section className="business-discovery stack" aria-label="源码业务分析">
    {error&&<div ref={errorNotice} tabIndex={-1} className="notice error" role="alert"><p>{error}</p>{error.includes('另一页面')&&<button className="text-button" disabled={working} onClick={()=>void work(async()=>{const value=await discoveryApi.scope(project.id);setPreview(value);scopeRevision.current=value.revision;setFullInput(undefined);setError('');setDraftNotice('已加载最新范围版本，本页输入保留，请核对后重新检查材料。');})}>加载最新范围版本（保留输入）</button>}</div>}
    {session&&<section className="card" aria-label="分析状态"><h2>{labels[session.status]??session.status}</h2>
      <p role="status">{active?'正在分析已确认的材料，可暂停后继续。':recovery?.message??(session.status==='completed'?'请到03核对业务预期，AI建议尚未成为已确认规则。':friendlyError(session.unresolved?.at(-1)??''))}</p>
      {!active&&session.status!=='completed'&&<p>{result?'已保留业务草稿，尚未完整；可先到03核对。':'尚未形成业务草稿；读取与调用记录已保留。'}</p>}
      <div className="actions">{active?<button className="btn" disabled={working} onClick={()=>void work(async()=>{await discoveryApi.pause(session.id);await refresh()})}>暂停分析</button>:<>
        {canResume&&<button className="btn primary" disabled={working||!configured} onClick={()=>void work(async()=>{try{await discoveryApi.resume(session.id,session.revision)}finally{await refresh()}})}>继续原分析（调用模型）</button>}
        {result&&<button className="btn primary" onClick={()=>select(project.id,undefined,'step:3')}>前往03 确认业务与目标</button>}
        {!editing&&<button className={result||canResume?'text-button':'btn primary'} disabled={working||!preview} onClick={()=>{setEditing(true);setFullInput(undefined);}}>{session.status==='completed'?'重新分析':'检查材料后重新分析'}</button>}
        {!result&&<button className="text-button" disabled={working} onClick={()=>void work(manual)}>自行填写业务</button>}
      </>}</div>
      {canResume&&session.unresolved?.length>0&&<p>{friendlyError(session.unresolved.at(-1))}</p>}
      {canResume&&!configured&&<button className="text-button" onClick={()=>select(project.id,undefined,'settings')}>配置模型后继续</button>}
    </section>}
    {showSetup&&<section className="card stack" aria-label="分析材料设置">
      <div className="card-header"><h2>{session?'重新梳理业务':'梳理项目业务'}</h2>{session&&<button className="text-button" disabled={working} onClick={()=>{setEditing(false);setFullInput(undefined)}}>取消重新分析</button>}</div>
      <p>{project.name} · {indexed.length} 个允许文件。检查材料只在本机进行。</p>
      <div className="stack" hidden={!!fullInput}><label className="field">重点关注什么（可选）<textarea aria-label="重点关注什么（可选）" maxLength={8000} disabled={working||active} value={prompt} placeholder="例如：取消订单后，库存应如何恢复？" onChange={e=>{setPrompt(e.target.value);invalidate();}}/></label>
      <p className="fine" role="status">{draftNotice}</p>
      <details open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}><summary>修改分析范围</summary>
        <div className="form-grid"><label className="field">允许读取的目录或文件<textarea aria-label="允许读取的目录或文件" disabled={working||active} value={paths} onChange={e=>{setPaths(e.target.value);invalidate()}}/></label><label className="field">额外排除的目录或文件<textarea aria-label="额外排除的目录或文件" disabled={working||active} value={excluded} onChange={e=>{setExcluded(e.target.value);invalidate()}}/></label></div>
        <p className="fine">每行一个相对路径，“.”表示项目范围。密钥、数据库、依赖及构建产物仍排除；请核对发送清单。</p>
        <label className="check"><input type="checkbox" disabled={working||active} checked={tests} onChange={e=>{setTests(e.target.checked);invalidate()}}/>纳入项目自身测试（不再作为未见独立评估材料）</label>
      </details>
      {!fullInput&&<button className="btn primary" disabled={working||active||!preview} onClick={()=>void work(checkMaterials)}>{working?'正在检查材料…':'检查材料'}</button>}</div>
      {fullInput&&<section className="material-preview stack" aria-label="待发送材料"><h3 ref={previewHeading} tabIndex={-1}>确认发送材料</h3><p>接收方：{preview?.scope.serviceUrl} · {state.settings.model||'尚未配置模型'}</p><p>{fullInput.reads.length} 个完整文件 · {(fullInput.totalBytes/1024).toFixed(1)} KB；包括目录信息{prompt.trim()?'和你的关注重点':''}。</p>
        <p>关注重点：{prompt.trim()||'自动梳理项目业务'}</p><DetailPanel label="查看完整文件清单与正文">{fullInput.reads.map((read:Data)=><details key={read.ref.path}><summary>{read.ref.path} · {read.bytes}字节</summary><pre>{read.text}</pre></details>)}</DetailPanel>
        <p className="fine">点击下方按钮，即同意发送这些材料并调用模型。分析结果仍需你核对。</p>
        {!configured&&<p className="notice">请先配置模型和密钥，才能发送材料。<button className="text-button" onClick={()=>select(project.id,undefined,'settings')}>配置分析模型</button></p>}
        <button className="btn primary" disabled={!configured||working||active} onClick={()=>void work(async()=>{if(project.journey?.skipAnalysis)await api('/projects/'+project.id+'/journey',{...project.journey,skipAnalysis:false});await discoveryApi.start(project.id,{confirmed:true,scopeHash:preview!.scope.scopeHash,expectedRevision:preview!.revision,requestId:crypto.randomUUID(),input:{mode,prompt:mode==='prompt'?prompt:'',manifestHash:fullInput.manifestHash}});setFullInput(undefined);setEditing(false);await refresh();const latest=await discoveryApi.scope(project.id);setPreview(latest);scopeRevision.current=latest.revision;})}>{working?'正在启动…':'同意发送并开始分析'}</button>
        <button className="text-button" disabled={working} onClick={()=>setFullInput(undefined)}>返回修改材料</button>
      </section>}
      {!session&&<button className="text-button" disabled={working} onClick={()=>void work(manual)}>我已了解业务，直接填写</button>}
      {session&&<p className="fine">重新分析会创建新任务，旧记录和预算保留。</p>}
    </section>}
    {result&&<>
      <section className="card"><h2>业务草稿</h2><p>{result.summary}</p><dl><dt>业务对象</dt><dd>{result.objects.join('、')}</dd><dt>角色</dt><dd>{result.roles.join('、')}</dd></dl>{result.flows.map((flow:Data,i:number)=><article key={i} className="discovery-flow"><h3>{flow.name}</h3><p>操作流程：{flow.steps.join(' → ')}</p><p>相关数据：{flow.data.join('、')}</p>{flow.sourceRefs.map((ref:Data,j:number)=><Citation key={j} session={session} refValue={ref}/>)}</article>)}</section>
      <section className="card"><h2>建议核对的业务</h2><p className="notice">仅建议，尚未确认业务预期，也未执行检查。</p>{result.suggestions.length===0&&<p>当前材料不足以提出有依据的检查，请先补充未决事项。</p>}{result.suggestions.map((s:Data)=><article key={s.id} className="discovery-suggestion"><span className="pill">建议 · 待确认</span><h3>{s.flow}</h3><p>{s.priorityReason}</p><details><summary>查看源码事实与依据</summary><h4>源码事实</h4>{s.facts.map((f:Data,i:number)=><div key={i}><p>{f.text}</p>{f.sourceRefs.map((ref:Data,j:number)=><Citation key={j} session={session} refValue={ref}/>)}</div>)}</details><h4>候选预期 · 待你确认</h4>{s.expectations.map((e:Data,i:number)=><div key={i}><p className="fine">{e.source==='documentation'?'文档中的预期 · 待核对':e.source==='project_test'?'项目测试预期 · 待核对':'AI 候选预期 · 待确认'}</p><p>{e.text}</p>{e.sourceRefs.map((ref:Data,j:number)=><Citation key={j} session={session} refValue={ref}/>)}</div>)}<details><summary>风险与业务边界</summary><h4>AI 风险假设 · 未验证</h4>{s.risks.map((r:Data,i:number)=><div key={i}><p>{r.text}</p>{r.sourceRefs.map((ref:Data,j:number)=><Citation key={j} session={session} refValue={ref}/>)}</div>)}<h4>业务边界梳理 待核对</h4><p>前置条件：{s.preconditions?.join('；')||'历史记录未单列，请核对'}</p><p>异常分支：{s.exceptions?.join('；')||'尚未识别，不代表不存在'}</p><p>状态变化：{s.stateChanges?.join('；')||'尚未识别，不代表无变化'}</p></details><h4>需要你确认的问题</h4><ul>{s.openQuestions.map((q:string,i:number)=><li key={i}>{q}</li>)}</ul><p className="fine">操作前提：{s.operationNeeds.join('；')||'尚待补充'}</p><p className="fine">需要观察：{s.observationNeeds.join('；')||'尚待补充'}</p>{s.sourceRefs.map((ref:Data,i:number)=><Citation key={i} session={session} refValue={ref}/>)}<button className="btn" disabled={working||active||session.status==='stale'} onClick={()=>void work(async()=>{await discoveryApi.select(session.id,s.id,session.revision);await refresh();select(project.id,undefined,'step:3');})}>去03核对这项业务</button></article>)}</section>
    </>}
    <DetailPanel label="查看分析详情与记录"><h2>分析范围与记录</h2><p>模型：{state.settings.model||'未配置'} · {state.settings.serviceUrl}</p><button className="text-button" onClick={()=>select(project.id,undefined,'settings')}>修改分析模型</button><p>正文总量及单文件上限64 KB；请求最多96 KB。累计上限8次、10分钟、120000 token。超限不会静默截断。</p>
      {session&&<><p>已用 {session.budget.calls}/8 次 · {session.budget.tokens}/120000 token。读取与调用记录不代表模型已完成理解。</p><h3>历史停止记录</h3><ul>{session.unresolved.map((v:string,i:number)=><li key={i}>{friendlyError(v)}</li>)}</ul><p>已索引 {indexed.length} 个文件，提供正文 {readPaths.size} 个，尚未提供 {unread.length} 个。</p><ul>{reads.map((r:Data,i:number)=><li key={i}>{r.ref.path}:{r.ref.startLine}-{r.ref.endLine}</li>)}</ul></>}
      <h3>排除与索引问题</h3><ul>{(preview?.snapshot.indexIssues??project.sourceSnapshot?.indexIssues??[]).map((v:Data,i:number)=><li key={i}>{v.path} · {v.code} · {v.detail}</li>)}</ul><p>静态读取不保证发现全部业务；非JS/TS文件不做语法关系解析。</p>
    </DetailPanel>
    {result&&<section className="notice"><h3>仍需核对的范围</h3><ul>{[...(result.limitations??[]),...(result.unresolved??[])].map((v:string,i:number)=><li key={i}>{v}</li>)}</ul>{unread.length>0&&<p>还有 {unread.length} 个文件未提供正文，相关业务可能未覆盖。</p>}</section>}
  </section>;
}
