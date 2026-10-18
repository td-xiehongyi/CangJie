import {useEffect,useRef,useState,type ReactNode} from 'react';
import {download,friendlyError,projectRulesApi,type Data} from '../api/client';
import {matchesStatusTransitionBusiness,statusTransitionBehavior,statusTransitionRequirements} from '@website-verification/contracts/status-transition';
import {businessName,businessText} from '../businessNames';

type Props={projectId:string;session?:Data;refresh?:()=>Promise<void>;readOnly?:boolean;collection?:Data;stage?:'business'|'plan';prepareAction?:(rule:Data)=>ReactNode;onEditBusiness?:()=>void};
type SuggestionDraft={answers:Record<string,string>;behavior:string;confirmed:boolean;enabled:boolean};
const lines=(value:string)=>value.split('\n').map(v=>v.trim()).filter(Boolean);
const ruleRef=(rule:Data)=>({projectId:rule.projectId,id:rule.id,version:rule.version,contentHash:rule.contentHash});
const sameRef=(a:Data|undefined,b:Data)=>!!a&&a.projectId===b.projectId&&a.id===b.id&&a.version===b.version&&a.contentHash===b.contentHash;
function ControlledContractDetails(){
  return <details><summary>受控工单关闭契约的业务预期与能力绑定</summary><ul>{statusTransitionBehavior.map(value=><li key={value}>{value}</li>)}</ul><h4>操作、角色与参数</h4><ul>{statusTransitionRequirements.operations.map(operation=><li key={operation.operationId}>{operation.operationId} · actorRef={operation.actorRef} · parameters={operation.parameters.join(', ')}</li>)}</ul><h4>查询观察与完整性</h4><ul>{statusTransitionRequirements.observations.map(observation=><li key={`${observation.operationId}:${observation.field}`}>{observation.operationId}.{observation.field} · requiresComplete={String(observation.requiresComplete)}</li>)}</ul><p>断言：{statusTransitionRequirements.assertions.join(', ')}</p><p>测试数据条件：{statusTransitionRequirements.dataConditions.join(', ')}</p><p className="fine">仅为已经确认上述完整预期的关闭业务绑定检查能力。业务名称、源码事实或候选预期不会自动选择此契约。</p></details>;
}
const readinessLabels:Record<string,string>={reusable:'已有合格方案',generatable:'可生成方案',needs_conditions:'缺少测试条件',needs_capability:'缺少执行能力'};

/** Compare the editable semantic draft with the exact persisted version. */
export function hasUnsavedRuleChanges(rule:Data,behavior:string,answers:Record<string,string>,note:string){
  const normalized=(value:Record<string,string>)=>Object.entries(value).map(([q,a])=>[q,a.trim()]).sort(([a],[b])=>a.localeCompare(b));
  return JSON.stringify(lines(behavior))!==JSON.stringify(rule.expectedBehavior)||JSON.stringify(normalized(answers))!==JSON.stringify(normalized(rule.answers))||!!note.trim();
}

export default function ProjectRuleCard({projectId,session,refresh,readOnly=false,collection,stage='business',prepareAction,onEditBusiness}:Props){
  const [storedLibrary,setLibrary]=useState<Data|undefined>(collection),[drafts,setDrafts]=useState<Record<string,SuggestionDraft>>({}),[error,setError]=useState(''),[errorCode,setErrorCode]=useState(''),[working,setWorking]=useState(false),[notice,setNotice]=useState('');
  const busy=useRef(false),generation=useRef(0);
  const library=!storedLibrary||collection&&collection.revision>=storedLibrary.revision?collection:storedLibrary,businessOnly=stage==='business';
  async function load(){const value=await projectRulesApi.list(projectId);setLibrary(value);return value;}
  useEffect(()=>{const current=++generation.current;setLibrary(collection);setDrafts({});setError('');setNotice('');if(readOnly&&collection)return;void projectRulesApi.list(projectId).then(value=>{if(current===generation.current)setLibrary(value)}).catch(e=>{if(current===generation.current){setError(friendlyError(e.message));setErrorCode(e.message)}});return()=>{generation.current++;};},[projectId]);
  async function work(task:()=>Promise<void>){
    if(busy.current)return false;busy.current=true;setWorking(true);setError('');setErrorCode('');setNotice('');
    try{await task();return true}catch(e){const code=(e as Error).message;setErrorCode(code);setError(friendlyError(code));return false}finally{busy.current=false;setWorking(false)}
  }
  async function saved(message:string){await load();await refresh?.();setNotice(message);}
  function update(id:string,patch:Partial<SuggestionDraft>){setDrafts(previous=>({...previous,[id]:{...(previous[id]??{answers:{},behavior:'',confirmed:false,enabled:false}),...patch,confirmed:patch.confirmed??false}}));}
  const suggestions:Data[]=[...(session?.result?.suggestions??[])].sort((a,b)=>Number(b.id===session?.selectedSuggestionId)-Number(a.id===session?.selectedSuggestionId));
  const translations=session?.result?.translations??{},t=(value:string)=>businessText(value,translations);
  const revision=library?.revision,versions:Data[]=library?.versions??[],readiness:Data[]=library?.readiness??[];
  if(library&&versions.length===0&&(!businessOnly||suggestions.length===0))return null;
  return <section className="card stack" aria-label={businessOnly?'项目业务确认':'准备已确认业务的检查'}>
    {businessOnly&&<h2>选择要检查的业务</h2>}
    {businessOnly&&!readOnly&&suggestions.filter(s=>!versions.some(v=>v.suggestionRef.discoveryId===session!.id&&v.suggestionRef.suggestionId===s.id)).map((s,index)=>{const draftId=`${session!.id}:${s.id}`,draft=drafts[draftId]??{answers:{},behavior:'',confirmed:false,enabled:false},complete=s.openQuestions.every((q:string)=>typeof draft.answers[q]==='string'&&!!draft.answers[q].trim())&&lines(draft.behavior).length>0,name=businessName(t(s.flow),index);
      return <section key={`${session!.id}:${s.id}`} role="region" aria-label={`规则预期核对 ${name}`} className="discovery-suggestion"><h3>{name}</h3><p className="fine">AI参考，待确认</p><label className="check"><input type="checkbox" aria-label={'检查'+name} checked={draft.enabled} disabled={working||session?.status==='stale'} onChange={e=>update(draftId,{enabled:e.target.checked,answers:drafts[draftId]?.answers??Object.fromEntries(s.openQuestions.filter((q:string)=>typeof s.suggestedAnswers?.[q]==='string').map((q:string)=>[q,t(s.suggestedAnswers[q])])),behavior:drafts[draftId]?.behavior??s.expectations?.map((v:Data)=>t(v.text)).join('\n')??''})}/>检查这项业务</label>
        {draft.enabled&&<><label className="field">预期行为（请核对，可修改）<textarea aria-label="确认后的预期行为（每行一条）" disabled={working} value={draft.behavior} onChange={e=>update(draftId,{behavior:e.target.value})}/></label>
        {!!s.openQuestions.length&&<details><summary>需要你核对的{ s.openQuestions.length }个问题</summary>{s.openQuestions.map((q:string)=><label key={q} className="field">{t(q)}<textarea aria-label={t(q)} disabled={working} value={typeof draft.answers[q]==='string'?draft.answers[q]:''} onChange={e=>update(draftId,{answers:{...draft.answers,[q]:e.target.value}})}/></label>)}</details>}
        <details><summary>核对建议的源码事实与候选预期</summary>{s.facts?.map((f:Data,i:number)=><div key={'fact'+i}><p>源码事实：{t(f.text)}</p>{f.sourceRefs?.map((r:Data,j:number)=><p className="fine" key={j}>{r.path}:{r.startLine}-{r.endLine}</p>)}</div>)}{s.expectations?.map((e:Data,i:number)=><div key={'expectation'+i}><p>{e.source==='documentation'?'文档预期':e.source==='project_test'?'项目测试预期':'AI推断'} · 待确认：{t(e.text)}</p>{e.sourceRefs?.map((r:Data,j:number)=><p className="fine" key={j}>{r.path}:{r.startLine}-{r.endLine}</p>)}</div>)}</details>
        <label className="check"><input type="checkbox" checked={draft.confirmed} disabled={working||!complete} onChange={e=>update(draftId,{confirmed:e.target.checked})}/>已核对关键问题与业务预期</label>
        <button className="btn primary" disabled={working||revision===undefined||!complete||!draft.confirmed||session?.status==='stale'||!session?.referencesValid} onClick={()=>void work(async()=>{await projectRulesApi.confirm(projectId,{discoveryId:session!.id,suggestionId:s.id,expectedRevision:revision,answers:Object.fromEntries(Object.entries(draft.answers).map(([q,a])=>[q,a.trim()])),expectedBehavior:lines(draft.behavior),confirmed:true});update(draftId,{confirmed:false});await saved('业务预期已保存，检查方法在“运行检查”中选择或生成。');})}>确认并保存项目规则</button>
        {!complete&&<p className="fine">回答所有关键问题并填写业务预期后，才能确认。</p>}
        {session?.status==='stale'&&<p className="notice">源码引用已失效，请重新分析后再确认新规则。</p>}
        </>}
      </section>;
    })}
    {!businessOnly&&<div className="card-header"><h2>准备已确认业务的检查</h2>{onEditBusiness&&<button className="text-button" onClick={onEditBusiness}>修改已确认业务</button>}</div>}
    {error&&<div className="notice error" role="alert"><p>{error}</p><details><summary>错误详情</summary><p>{errorCode}</p></details><button className="btn" disabled={working} onClick={()=>void work(async()=>{await load();setDrafts(previous=>Object.fromEntries(Object.entries(previous).map(([id,d])=>[id,{...d,confirmed:false}])));setNotice('已加载最新规则，本页输入已保留。请重新核对后手动保存。');})}>核对最新版本（保留本页输入）</button></div>}
    {notice&&<p className="info-strip" role="status">{notice}</p>}
    {!library&&!error&&<p role="status">正在读取项目规则…</p>}
    {versions.map((rule,index)=><SavedRule translations={translations} key={`${projectId}:${rule.id}`} {...{businessOnly}} name={businessName(t(rule.flow),index)} prepareAction={businessOnly?undefined:prepareAction?.(rule)} rule={rule} reviewRevision={revision} readiness={readiness.find(r=>sameRef(r.ruleRef,ruleRef(rule)))} readOnly={readOnly} working={working} onWork={work} onRevise={(changes:Data)=>work(async()=>{const {confirmed,...revisionChanges}=changes;const revised=await projectRulesApi.revise(projectId,rule.id,{expectedRevision:revision,...revisionChanges});if(confirmed===true){const latest=await load();await projectRulesApi.confirmVersion(projectId,rule.id,{expectedRevision:latest.revision,version:revised.version,confirmed:true});}await saved(confirmed?'业务预期已更新并确认，历史版本已保留。':'已保存修改，请核对后确认。');})} onCorrect={(note:string)=>work(async()=>{await projectRulesApi.correct(projectId,rule.id,{ruleRef:ruleRef(rule),note,expectedRevision:revision});await saved('已追加纠正记录并清除确认，历史版本未更改。请重新分析或修订后再核对。');})} onConfirm={()=>work(async()=>{await projectRulesApi.confirmVersion(projectId,rule.id,{expectedRevision:revision,version:rule.version,confirmed:true});await saved('当前版本已确认，尚未执行检查。');})}/>) }
  </section>;
}

type SavedProps={translations:Record<string,string>;rule:Data;name:string;businessOnly:boolean;prepareAction?:ReactNode;reviewRevision:number;readiness?:Data;readOnly:boolean;working:boolean;onWork:(task:()=>Promise<void>)=>Promise<boolean>;onRevise:(changes:Data)=>Promise<boolean>;onConfirm:()=>Promise<boolean>;onCorrect:(note:string)=>Promise<boolean>};
function SavedRule({translations,rule,name,businessOnly,prepareAction,reviewRevision,readiness,readOnly,working,onWork,onRevise,onConfirm,onCorrect}:SavedProps){
  const t=(value:string)=>businessText(value,translations),displayBehavior=rule.expectedBehavior.map(t),displayAnswers=Object.fromEntries(Object.entries(rule.answers).map(([q,a])=>[q,t(a as string)]));
  const [editing,setEditing]=useState(false),[behavior,setBehavior]=useState(displayBehavior.join('\n')),[answers,setAnswers]=useState<Record<string,string>>(displayAnswers),[note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[controlled,setControlled]=useState(false),[correctionNote,setCorrectionNote]=useState(''),[historyVersion,setHistoryVersion]=useState(rule.version),[history,setHistory]=useState<Data>();
  const dirtyInputs=useRef(false);
  useEffect(()=>{setConfirmed(false);setHistoryVersion(rule.version);setHistory(undefined);if(!editing&&!dirtyInputs.current){setControlled(false);setBehavior(displayBehavior.join('\n'));setAnswers(displayAnswers);}},[rule.version,rule.contentHash,reviewRevision]);
  const pending=rule.confirmation.status!=='confirmed',current=rule.sourceCurrent!==false;
  const dirty=controlled||hasUnsavedRuleChanges({...rule,expectedBehavior:displayBehavior,answers:displayAnswers},behavior,answers,note);
  const answered=(rule.openQuestions??[]).every((q:string)=>typeof answers[q]==='string'&&!!answers[q].trim());
  const canBind=matchesStatusTransitionBusiness(rule.flow,rule.expectedBehavior);
  useEffect(()=>setConfirmed(false),[dirty]);
  const source=<><p className="fine">规则版本：v{rule.version}</p>{(rule.facts??[]).map((f:Data,i:number)=><p key={i}>源码事实：{t(f.text)}</p>)}{(rule.expectations??[]).map((e:Data,i:number)=><p key={i}>{t(e.text)} · {e.source==='documentation'?'文档':e.source==='project_test'?'项目测试':'AI建议'}</p>)}<dl>{(rule.openQuestions??[]).map((q:string)=><div key={q}><dt>{t(q)}</dt><dd>{t(rule.answers[q]??'未回答')}</dd></div>)}</dl>{(rule.sourceRefs??[]).map((r:Data,i:number)=><p className="fine" key={i}>{r.path}:{r.startLine}-{r.endLine}</p>)}</>;
  if(!businessOnly)return <article className="rule-row" aria-label={`检查准备 ${name}`}><h3>{name}</h3><p className={current&&!pending?'fine':'error'}>{!current?'来源已变化，请返回核对业务':pending?'业务预期待确认':'业务预期已确认'}</p><p className="pill">{readinessLabels[readiness?.status??'']??'准备状态尚未核对'}</p>{prepareAction}{!!readiness?.missing?.length&&<details><summary>待补齐的条件与能力</summary><ul>{readiness.missing.map((missing:Data,i:number)=><li key={i}>{missing.detail}</li>)}</ul><button className="text-button" onClick={()=>download('business-capability-gap.json',{projectId:rule.projectId,ruleRef:ruleRef(rule),business:rule.flow,expectedBehavior:rule.expectedBehavior,missing:readiness.missing,coverage:'未覆盖'})}>导出补充说明</button></details>}<details><summary>查看已确认预期与来源</summary><ul>{displayBehavior.map((value:string,i:number)=><li key={i}>{value}</li>)}</ul>{source}</details></article>;
  async function save(){
    const task=dirty?onRevise({expectedBehavior:controlled?rule.expectedBehavior:lines(behavior),answers:Object.fromEntries(Object.entries(answers).map(([q,a])=>[q,a.trim()])),note:note.trim()||'用户修改业务预期',confirmed:true,...(controlled?{requirements:statusTransitionRequirements}:rule.requirements?{requirements:rule.requirements}:{})}):pending?onConfirm():Promise.resolve(true);
    if(await task){dirtyInputs.current=false;setEditing(false);setNote('');setControlled(false);setConfirmed(false);}
  }
  function discard(){dirtyInputs.current=false;setControlled(false);setBehavior(displayBehavior.join('\n'));setAnswers(displayAnswers);setNote('');setConfirmed(false);setEditing(false);}
  return <article className="rule-row business-item" aria-label={`已保存业务 ${name}`}>
    <div className="card-header"><h3>{name}</h3>{!readOnly&&!editing&&<button className="text-button" disabled={working} onClick={()=>{setEditing(true);setConfirmed(false);}}>编辑</button>}</div>
    <p className="fine">{!current?'来源已变化，请重新分析后核对':pending?'待重新确认':'已确认并保存'}</p>
    {!editing&&<ul className="clause-list">{displayBehavior.map((value:string,i:number)=><li key={i}>{value}</li>)}</ul>}
    {!readOnly&&editing&&<section role="region" aria-label={`编辑业务 ${name}`}>
      <label className="field">预期行为（请核对，可修改）<textarea aria-label="确认后的预期行为（每行一条）" disabled={working||controlled} value={controlled?displayBehavior.join('\n'):behavior} onChange={e=>{dirtyInputs.current=true;setBehavior(e.target.value);setConfirmed(false);}}/></label>
      {!!rule.openQuestions?.length&&<details><summary>需要你核对的{rule.openQuestions.length}个问题</summary>{rule.openQuestions.map((q:string)=><label key={q} className="field">{t(q)}<textarea aria-label={t(q)} disabled={working} value={answers[q]??''} onChange={e=>{dirtyInputs.current=true;setAnswers({...answers,[q]:e.target.value});setConfirmed(false);}}/></label>)}</details>}
      <details><summary>修改原因与高级设置（选填）</summary><label className="field">修改原因（选填）<textarea disabled={working} value={note} onChange={e=>{dirtyInputs.current=true;setNote(e.target.value);setConfirmed(false);}}/></label>{canBind&&<><label className="check"><input type="checkbox" checked={controlled} disabled={working} onChange={e=>{dirtyInputs.current=true;setControlled(e.target.checked);setConfirmed(false);}}/>采用受控工单关闭契约</label><ControlledContractDetails/></>}</details>
      <label className="check"><input type="checkbox" checked={confirmed} disabled={working||!answered||!lines(behavior).length||!current} onChange={e=>setConfirmed(e.target.checked)}/>已核对关键问题与业务预期</label>
      <div className="actions"><button className="btn" disabled={working} onClick={discard}>取消编辑</button><button className="btn primary" disabled={working||!answered||!lines(behavior).length||!current||!confirmed} onClick={()=>void save()}>确认并保存</button></div>
    </section>}
    {!readOnly&&!editing&&pending&&<><label className="check"><input type="checkbox" checked={confirmed} disabled={working||dirty||!current} onChange={e=>setConfirmed(e.target.checked)}/>已核对关键问题与业务预期</label><button className="btn primary" disabled={working||dirty||!current||!confirmed} onClick={()=>void onConfirm()}>确认并保存</button></>}
    <details><summary>来源与历史记录</summary>{source}{(rule.corrections??[]).length>0&&<ul>{rule.corrections.map((c:Data,i:number)=><li key={i}>v{c.previousVersion}：{c.note}</li>)}</ul>}<label className="field">历史版本<select value={historyVersion} disabled={working} onChange={e=>{setHistoryVersion(Number(e.target.value));setHistory(undefined);}}>{Array.from({length:rule.version},(_,i)=><option key={i+1} value={i+1}>v{i+1}</option>)}</select></label><button className="text-button" disabled={working} onClick={()=>void onWork(async()=>setHistory(await projectRulesApi.version(rule.projectId,rule.id,historyVersion)))}>查看历史版本</button>{history&&<section aria-label={`历史规则 v${history.version}`}><h4>历史版本 v{history.version}</h4><ul>{history.expectedBehavior.map((value:string,i:number)=><li key={i}>{t(value)}</li>)}</ul></section>}{!readOnly&&<details><summary>记录来源问题</summary><label className="field">问题说明<textarea disabled={working} value={correctionNote} onChange={e=>setCorrectionNote(e.target.value)}/></label><p className="fine">保存后需重新核对业务预期。</p><button className="btn" disabled={working||!correctionNote.trim()} onClick={()=>void onCorrect(correctionNote.trim()).then(ok=>{if(ok)setCorrectionNote('');})}>保存问题并标记待确认</button></details>}</details>
  </article>;
}
