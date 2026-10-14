import {useContext,useEffect,useMemo,useRef,useState} from 'react';
import {api,projectRulesApi,operationLabels,ruleNames,ruleDescriptions,statusNames,friendlyError,type CommonProps,type Data} from './api/client';
import {useWorkflow} from './useWorkflow';
import {NavigationContext} from './navigation';
import PreparationCard from './components/PreparationCard';
import ProjectRuleCard from './components/ProjectRuleCard';
import CandidateReviewCard from './components/CandidateReviewCard';

const ruleReference=(rule:Data)=>({projectId:rule.projectId,id:rule.id,version:rule.version,contentHash:rule.contentHash});
const sameReference=(a:Data|undefined,b:Data)=>!!a&&['projectId','id','version','contentHash'].every(key=>a[key]===b[key]);
/** Compilation exposes only the confirmed current version in this project. */
export function verificationRules(state:Data,project?:Data):Data[]{
  const versions:Data[]=state.projectRules?.[project?.id??'']?.versions??[];
  return [...(state.rules??[]),...(project?.executableRules??[]).filter((rule:Data)=>rule.ruleRef?.projectId===project?.id&&rule.id===rule.ruleRef.id&&versions.some(version=>version.confirmation.status==='confirmed'&&sameReference(rule.ruleRef,ruleReference(version))))];
}
export function verificationCatalog(state:Data,project?:Data):Data{
  if(project?.catalog)return project.catalog;
  // Older hosts expose a global legacy catalog. Dynamic rules require project-local matches.
  return {...state.catalog,matches:(state.catalog?.matches??[]).filter((match:Data)=>(state.rules??[]).some((rule:Data)=>!rule.ruleRef&&rule.hash===match.ruleHash))};
}
export function candidateRequest(rule:Data,resume:boolean):Data{return {...(rule.ruleRef?{ruleRef:rule.ruleRef}:{ruleId:rule.id}),confirmRule:true,resume};}
export function verificationCheck(rule:Data,confirmed:boolean,templateRef:Data):Data{return {...(rule.ruleRef?{ruleRef:rule.ruleRef}:{ruleId:rule.id}),confirmed,templateRef};}
export function candidateMatchesRule(candidate:Data|undefined,rule:Data):boolean{
  if(rule.ruleRef)return sameReference(candidate?.ruleRef,rule.ruleRef);
  return !!candidate&&(candidate.ruleId??candidate.spec?.ruleRef?.id)===rule.id;
}

export default function VerifyView({state,project,run,act,refresh,select}:CommonProps){
  const navigation=useContext(NavigationContext);
  const workflow=useWorkflow(project),{flow,selected,setFlow,setSelected}=workflow;
  const [prepare,setPrepare]=useState(false),[candidatePrep,setCandidatePrep]=useState<string>(),[creating,setCreating]=useState(false),[candidateDirty,setCandidateDirty]=useState(false);
  const [compiling,setCompiling]=useState<string>(),[compileNotice,setCompileNotice]=useState(''),[compileGap,setCompileGap]=useState<Data>();
  const compilationBusy=useRef(false);
  const rules=useMemo(()=>verificationRules(state,project),[state.rules,state.projectRules,project?.id,project?.executableRules]);
  const catalog=useMemo(()=>verificationCatalog(state,project),[state.catalog,state.rules,project?.catalog]);
  const reviewAfterCreate=useRef<string|undefined>(undefined),launching=useRef(false);
  useEffect(()=>{
    if(!project?.candidate||reviewAfterCreate.current!==project.candidate.ruleId)return;
    const heading=document.getElementById('candidate-review-heading');
    if(heading&&!heading.closest('[hidden]')){if(project.candidate.status==='ready_for_review')reviewAfterCreate.current=undefined;heading.scrollIntoView({block:'start'});heading.focus({preventScroll:true});}
  },[project?.candidate?.status,project?.candidate?.id]);
  useEffect(()=>{if(candidatePrep){const step=document.getElementById('candidate-preparation');step?.scrollIntoView({block:'start'});step?.focus({preventScroll:true});}},[candidatePrep]);
  useEffect(()=>{
    setSelected(previous=>{let next=previous;for(const [id,choice]of Object.entries(previous)){if(choice.version)continue;const rule=rules.find((r:Data)=>r.id===id),match=catalog.matches.find((m:Data)=>m.ruleHash===rule?.hash);if(match){if(next===previous)next={...previous};next[id]={...choice,version:match.ref.hash,confirmed:false};}}return next;});
  },[catalog.matches,rules]);
  if(!project)return <><h1>业务验证</h1><section className="card empty"><h2>先接入一个项目</h2><p>项目条件就绪后，在这里确认一条流程和本轮规则。</p><button className="btn primary" onClick={()=>select('',undefined,'project')}>前往项目接入</button></section></>;
  const labels=operationLabels(project);
  const versions:Data[]=state.projectRules?.[project.id]?.versions??[];
  const ruleLabel=(rule:Data)=>rule.ruleRef?versions.find(version=>sameReference(rule.ruleRef,ruleReference(version)))?.flow??rule.id:ruleNames[rule.id]??rule.id;
  const proposal=project.analysis?.proposal,title=flow==='proposal'?proposal?.flow.title:flow==='submit'?labels.submit:labels.edit,available=rules.filter((r:Data)=>r.ruleRef||flow==='proposal'||(flow==='edit'?r.id==='title-update-rule':r.id!=='title-update-rule'));
  const chosenRules=available.filter((r:Data)=>selected[r.id]?.enabled);
  const hasTemplate=(r:Data)=>catalog.matches.some((m:Data)=>m.ruleHash===r.hash&&m.ref.hash===selected[r.id]?.version);
  const ready=chosenRules.length>0&&chosenRules.every(hasTemplate),missing=chosenRules.filter((r:Data)=>!hasTemplate(r));
  const currentRun=run?.projectId===project.id?run:undefined,candidate=project.candidate,candidateInFlow=available.some((r:Data)=>candidateMatchesRule(candidate,r));
  const missingOthers=missing.filter((r:Data)=>!candidateMatchesRule(candidate,r)),continueBlocked=missingOthers.length?`请先完成其它已选检查的方案：${missingOthers.map(ruleLabel).join('、')}`:undefined;
  const change=(id:string,patch:Data)=>{const rule=rules.find((r:Data)=>r.id===id);if(!rule)return;setSelected(previous=>({...previous,[id]:{...(previous[id]??{enabled:false,confirmed:false}),...patch,ruleHash:rule.hash,environmentHash:project.environmentHash}}));};
  const showReview=()=>{const heading=document.getElementById('candidate-review-heading');heading?.scrollIntoView({block:'start'});heading?.focus({preventScroll:true});};
  async function createCandidate(ruleId:string,prepared=false){
    if(creating)return;
    if(!prepared&&(!project!.consent||!project!.environmentConfirmed)){setCandidatePrep(ruleId);return;}
    if(!await navigation.beforeChange())return;
    setCreating(true);try{await workflow.flush();const rule=rules.find(r=>r.id===ruleId);if(!rule||!workflow.snapshot().flows[flow]?.[ruleId]?.confirmed)throw new Error('规则或条件已经变化，请重新确认预期行为。');reviewAfterCreate.current=ruleId;await api(`/projects/${project!.id}/candidate`,candidateRequest(rule,candidateMatchesRule(project!.candidate,rule)));setCandidatePrep(undefined);await refresh();}finally{setCreating(false);}
  }
  async function compileRule(version:Data){
    if(compilationBusy.current||version.confirmation.status!=='confirmed')return;
    if(!await navigation.beforeChange())return;
    compilationBusy.current=true;setCompiling(version.id);setCompileNotice('');setCompileGap(undefined);
    try{const result=await projectRulesApi.compile(project!.id,version.id,{ruleRef:ruleReference(version)});if(result.status==='blocked')setCompileGap(result);else setCompileNotice('此精确版本已编译。请在下方选择规则，生成方案并完成自动验证、项目试运行与双重审核。');await refresh();}finally{compilationBusy.current=false;setCompiling(undefined);}
  }
  async function launch(){
    if(launching.current)return;launching.current=true;
    try{await workflow.flush();const checks=chosenRules.map((r:Data)=>{const choice=catalog.matches.find((m:Data)=>m.ruleHash===r.hash&&m.ref.hash===selected[r.id]?.version);if(!choice)throw new Error(`${ruleLabel(r)}：没有有效方案，请先创建并审核`);return verificationCheck(r,workflow.snapshot().flows[flow]?.[r.id]?.confirmed===true,choice.ref);});if(!checks.length)throw new Error('请选择本轮检查');const result=await api(`/projects/${project!.id}/run`,{flow:{id:flow==='proposal'?proposal.flow.id:flow,title},checks});setPrepare(false);await refresh();select(project!.id,result.runId,'verify');}finally{launching.current=false;}
  }
  const activeCandidate=['validating','running'].includes(candidate?.status);
  return <><div className="page-heading"><div><h1>业务验证</h1><p>{project.name} · 选择网站中的业务操作，再勾选需要检查的行为</p></div></div><div className="stack verify-layout">
    <ProjectRuleCard key={project.id} projectId={project.id} collection={state.projectRules?.[project.id]} readOnly/>
    {versions.length>0&&<section className="card stack" aria-label="项目规则显式编译"><h2>编译已确认的项目规则</h2><p>编译只绑定此精确版本的执行能力与独立验证资源。编译不会生成合格方案，也不代表业务已通过；仍需生成方案、自动验证、项目试运行和双重审核。</p>
      {versions.map(version=>{const ref=ruleReference(version),compiled=rules.some(rule=>sameReference(rule.ruleRef,ref)),gap=compileGap&&sameReference(compileGap.ruleRef,ref)?compileGap:(project.ruleCompilationGaps??[]).find((item:Data)=>sameReference(item.ruleRef,ref));return <article key={`${version.id}:${version.version}:${version.contentHash}`} className="rule-row"><h3>{version.flow} · v{version.version}</h3><p className="fine">{compiled?'已编译，尚需生成与审核检查方案':version.confirmation.status==='confirmed'?'已确认，等待显式编译':'请先在项目规则库确认当前版本'}</p><button className="btn" disabled={!!compiling||creating||activeCandidate||currentRun?.status==='running'||version.confirmation.status!=='confirmed'||compiled} onClick={()=>act(()=>compileRule(version))}>{compiling===version.id?'正在编译…':'编译此精确规则版本'}</button>{gap?.missing?.length>0&&<div role="status"><h4>无法编译：缺少可信执行能力或验证资源</h4><ul>{gap.missing.map((item:Data,index:number)=><li key={index}>{friendlyError(item.detail)} <span className="fine">（{item.code}）</span></li>)}</ul></div>}</article>})}
      {compileNotice&&<p role="status" className="info-strip">{compileNotice}</p>}
    </section>}
    {currentRun?<section className="card run-progress" aria-live="polite"><div className="card-header"><h2>本轮进度</h2><span className="pill">{statusNames[currentRun.status]}</span></div><p>{currentRun.flow.title}</p><p>{currentRun.status==='completed'?'本轮执行已完成，请查看实际检查结果。':currentRun.status==='running'?'正在执行检查并收集证据，请勿重复启动。':friendlyError(currentRun.uncovered?.[0]??'本轮未完成，请核对条件后重新运行。')}</p><details><summary>运行详情</summary><p>运行 {currentRun.id}</p><p>{statusNames[currentRun.events.at(-1)?.phase]??currentRun.events.at(-1)?.detail??'等待实际执行'}</p></details><div className="actions">{currentRun.status==='running'&&<button className="btn danger" onClick={()=>act(async()=>{await api(`/runs/${currentRun.id}/stop`,{});await refresh();})}>停止本轮运行</button>}{currentRun.status!=='running'&&<button className="text-button" onClick={()=>select(project.id,undefined,'verify')}>选择其他检查或重新运行</button>}<button className="btn primary" onClick={()=>select(project.id,currentRun.id,'report')}>{currentRun.status==='running'?'查看运行进度':'查看检查结果'}</button></div></section>:<>
    <section className="card"><div className="card-header"><h2>你想检查什么？</h2><span className="pill">已选择 {chosenRules.length} 条规则</span></div><label className="field">要检查网站的哪种操作？<select aria-describedby="operation-help" value={flow} onChange={e=>{const next=e.target.value;act(async()=>{if(!await navigation.beforeChange())return;await setFlow(next);setPrepare(false);setCandidatePrep(undefined);});}}><option value="submit">{labels.submit}</option><option value="edit">{labels.edit}（其他字段不变）</option>{proposal&&<option value="proposal">{labels.proposal}</option>}</select></label><p id="operation-help" className="fine">这里选择网站中的业务操作，不是提交或修改检查方案。</p>{flow==='proposal'&&proposal&&<div className="notice"><p>AI 推荐的操作需要你核对业务含义；当前只可使用下方已具备验证能力的规则。</p><details><summary>查看 AI 原始操作名称</summary><p>{proposal.flow.title}</p></details>{proposal.pendingRules.map((r:Data)=><p key={r.id}>待确认建议：{[...r.expectedChanges,...r.invariants].join('；')}</p>)}<p>选择与实际业务语义一致的规则；不同语义需要补齐可信验证能力。</p></div>}<p className="muted">勾选规则表示“加入本轮检查”；再勾选“这就是我期望的网站行为”，才按该规则判断对错。未确认的规则仅记录观察。</p>
    <p className="fine" role="status">{workflow.status}</p>{workflow.error&&<div className="notice error" role="alert"><p>{workflow.error}</p><div className="actions" hidden={workflow.sessionExpired}><button className="btn" onClick={()=>void workflow.retry()}>保留本页并重新保存</button><button className="btn" onClick={()=>act(workflow.loadSaved)}>加载已保存的选择</button></div></div>}
    {available.map((r:Data)=>{const matches=catalog.matches.filter((m:Data)=>m.ruleHash===r.hash),choice=selected[r.id],chosen=choice?.version?matches.find((m:Data)=>m.ref.hash===choice.version):matches[0];return <div className="rule-row" key={r.id}><label className="check"><input type="checkbox" checked={choice?.enabled??false} onChange={e=>change(r.id,{enabled:e.target.checked,version:choice?.version??chosen?.ref.hash})}/><strong>{ruleLabel(r)}</strong></label><p>{ruleDescriptions[r.id]??[...r.expectedChanges,...r.invariants].join('；')}</p>{choice?.enabled&&<label className="check"><input type="checkbox" checked={choice.confirmed} onChange={e=>change(r.id,{confirmed:e.target.checked,version:choice.version??chosen?.ref.hash})}/>这就是我期望的网站行为</label>}{choice?.enabled&&!choice.confirmed&&<p className="notice">规则尚未确认：本条仅观察，不判对错。条件或版本变化后需重新确认。</p>}<details><summary>查看完整规则定义</summary><p>{[...r.expectedChanges,...r.invariants].join('；')}</p></details>
      {matches.length>0?<><p className="fine">{chosen?'已有可用方案；请核对适用条件。':'原版本已不可用，请重新选择版本并确认。'}</p><details><summary>检查方案与版本</summary><label className="field">检查方案版本<select value={choice?.version??chosen?.ref.hash??''} onChange={e=>change(r.id,{version:e.target.value,confirmed:false})}>{!chosen&&<option value={choice?.version}>原版本已不可用，请重新选择并确认</option>}{matches.map((m:Data)=><option key={m.ref.hash} value={m.ref.hash}>{m.ref.id} @ {m.ref.version}</option>)}</select></label><button className="text-button" disabled={!choice?.confirmed||!state.settings.model||!state.settings.hasKey||creating||activeCandidate} onClick={()=>act(()=>createCandidate(r.id))}>重新生成检查方案</button></details></>:!choice?.enabled&&!candidateMatchesRule(candidate,r)?<p className="fine">尚无可用方案，选中此项后可创建。</p>:<div className="notice"><p>{candidateMatchesRule(candidate,r)&&candidate?.status==='ready_for_review'?'方案已完成自动验证，请在下方审核后使用。':'还没有可用检查方案；确认预期行为后创建，再完成审核。'}</p>{candidateMatchesRule(candidate,r)&&candidate?.status==='ready_for_review'?<button className="btn" onClick={showReview}>审核这条检查方案</button>:<button className="btn" disabled={!choice?.enabled||!choice.confirmed||!state.settings.model||!state.settings.hasKey||activeCandidate||creating} onClick={()=>act(()=>createCandidate(r.id))}>{candidate?.phase==='awaiting_trial'&&candidateMatchesRule(candidate,r)?'继续原方案的试运行':'为这条规则创建检查方案'}</button>}{(!state.settings.model||!state.settings.hasKey)&&<button className="text-button" onClick={()=>select(project.id,undefined,'settings')}>先设置模型连接</button>}{!choice?.confirmed&&<p className="fine">创建方案前，需要确认本条规则的预期行为。</p>}</div>}
      {candidatePrep===r.id&&<div id="candidate-preparation" role="region" aria-label="创建方案前准备" tabIndex={-1}><PreparationCard project={project} includeSending title="创建方案前准备" actionLabel="确认范围并创建方案" onReady={()=>createCandidate(r.id,true)}/></div>}
      {chosen&&<details><summary>检查方案的适用条件与匹配依据</summary><p>{chosen.applicable.join('；')}</p><p>不适用于：{chosen.excluded.join('；')}</p><p>{chosen.instructions}</p></details>}</div>;})}
      {chosenRules.length>0&&<div className="info-strip selection-summary"><strong>本轮：{chosenRules.filter((r:Data)=>selected[r.id].confirmed).length} 项判定，{chosenRules.filter((r:Data)=>!selected[r.id].confirmed).length} 项仅观察</strong>{missing.length>0&&<p>待准备方案：{missing.map(ruleLabel).join('、')}。所选检查会全部保留。</p>}</div>}
      <div className="actions task-actions"><button className="btn primary" disabled={!ready||!!workflow.error||creating||activeCandidate} onClick={()=>setPrepare(true)}>准备本轮检查</button></div>{!ready&&<p className="fine">{chosenRules.length?'请先补齐所选检查的方案并完成审核。':'请选择要加入本轮的检查项。'}</p>}
    </section>
    {candidate&&<div hidden={!candidateInFlow&&!candidateDirty}><CandidateReviewCard key={project.id} state={{...state,catalog}} {...{project,refresh,select,continueBlocked}} onDirtyChange={setCandidateDirty} hideContinue/></div>}
    {prepare&&<div id="run-preparation"><PreparationCard project={project} title="本轮运行准备" onReady={launch}/></div>}
    </>}
  </div></>;
}
