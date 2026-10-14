import {useEffect,useRef,useState} from 'react';
import {friendlyError,projectRulesApi,type Data} from '../api/client';

type Props={projectId:string;session?:Data;refresh?:()=>Promise<void>;readOnly?:boolean;collection?:Data};
type SuggestionDraft={answers:Record<string,string>;behavior:string;confirmed:boolean};
const lines=(value:string)=>value.split('\n').map(v=>v.trim()).filter(Boolean);
const ruleRef=(rule:Data)=>({projectId:rule.projectId,id:rule.id,version:rule.version,contentHash:rule.contentHash});
const sameRef=(a:Data|undefined,b:Data)=>!!a&&a.projectId===b.projectId&&a.id===b.id&&a.version===b.version&&a.contentHash===b.contentHash;
const readinessLabels:Record<string,string>={reusable:'已有合格方案',generatable:'可生成方案',needs_conditions:'缺少测试条件',needs_capability:'缺少执行能力'};

/** Compare the editable semantic draft with the exact persisted version. */
export function hasUnsavedRuleChanges(rule:Data,behavior:string,answers:Record<string,string>,note:string){
  const normalized=(value:Record<string,string>)=>Object.entries(value).map(([q,a])=>[q,a.trim()]).sort(([a],[b])=>a.localeCompare(b));
  return JSON.stringify(lines(behavior))!==JSON.stringify(rule.expectedBehavior)||JSON.stringify(normalized(answers))!==JSON.stringify(normalized(rule.answers))||!!note.trim();
}

export default function ProjectRuleCard({projectId,session,refresh,readOnly=false,collection}:Props){
  const [storedLibrary,setLibrary]=useState<Data|undefined>(collection),[drafts,setDrafts]=useState<Record<string,SuggestionDraft>>({}),[error,setError]=useState(''),[errorCode,setErrorCode]=useState(''),[working,setWorking]=useState(false),[notice,setNotice]=useState('');
  const busy=useRef(false),generation=useRef(0);
  const library=readOnly&&collection?collection:storedLibrary;
  async function load(){const value=await projectRulesApi.list(projectId);setLibrary(value);return value;}
  useEffect(()=>{const current=++generation.current;setLibrary(collection);setDrafts({});setError('');setNotice('');if(readOnly&&collection)return;void projectRulesApi.list(projectId).then(value=>{if(current===generation.current)setLibrary(value)}).catch(e=>{if(current===generation.current){setError(friendlyError(e.message));setErrorCode(e.message)}});return()=>{generation.current++;};},[projectId]);
  async function work(task:()=>Promise<void>){
    if(busy.current)return false;busy.current=true;setWorking(true);setError('');setErrorCode('');setNotice('');
    try{await task();return true}catch(e){const code=(e as Error).message;setErrorCode(code);setError(friendlyError(code));return false}finally{busy.current=false;setWorking(false)}
  }
  async function saved(message:string){await load();await refresh?.();setNotice(message);}
  function update(id:string,patch:Partial<SuggestionDraft>){setDrafts(previous=>({...previous,[id]:{...(previous[id]??{answers:{},behavior:'',confirmed:false}),...patch,confirmed:patch.confirmed??false}}));}
  const suggestions:Data[]=session?.result?.suggestions??[];
  const revision=library?.revision,versions:Data[]=library?.versions??[],readiness:Data[]=library?.readiness??[];
  return <section className="card stack" aria-label={readOnly?'项目特有规则选择与缺口':'项目规则确认与版本库'}>
    {!readOnly&&suggestions.map(s=>{const draftId=`${session!.id}:${s.id}`,draft=drafts[draftId]??{answers:{},behavior:'',confirmed:false},complete=s.openQuestions.every((q:string)=>typeof draft.answers[q]==='string'&&!!draft.answers[q].trim())&&lines(draft.behavior).length>0,alreadySaved=versions.some(v=>v.suggestionRef.discoveryId===session!.id&&v.suggestionRef.suggestionId===s.id);
      return <section key={`${session!.id}:${s.id}`} role="region" aria-label={`规则预期核对 ${s.flow}`} className="discovery-suggestion"><h3>核对业务预期：{s.flow}</h3><p>请独立填写正确业务要求。源码事实与候选预期已在建议中分列，不能把当前实现自动视为正确答案。</p>
        {alreadySaved&&<p className="info-strip">此建议已有项目规则，请在版本库修订已有规则。</p>}
        {s.openQuestions.map((q:string)=><label key={q} className="field">{q}<textarea aria-label={q} disabled={working||alreadySaved} value={typeof draft.answers[q]==='string'?draft.answers[q]:''} onChange={e=>update(draftId,{answers:{...draft.answers,[q]:e.target.value}})}/></label>)}
        <label className="field">确认后的预期行为（每行一条）<textarea aria-label="确认后的预期行为（每行一条）" disabled={working||alreadySaved} value={draft.behavior} onChange={e=>update(draftId,{behavior:e.target.value})}/></label>
        <label className="check"><input type="checkbox" checked={draft.confirmed} disabled={working||alreadySaved||!complete} onChange={e=>update(draftId,{confirmed:e.target.checked})}/>已核对关键问题与业务预期</label>
        <button className="btn primary" disabled={working||revision===undefined||!complete||!draft.confirmed||alreadySaved||session?.status==='stale'||!session?.referencesValid} onClick={()=>void work(async()=>{await projectRulesApi.confirm(projectId,{discoveryId:session!.id,suggestionId:s.id,expectedRevision:revision,answers:Object.fromEntries(Object.entries(draft.answers).map(([q,a])=>[q,a.trim()])),expectedBehavior:lines(draft.behavior),confirmed:true});update(draftId,{confirmed:false});await saved('项目规则已保存，尚未执行检查。');})}>确认并保存项目规则</button>
        {!complete&&<p className="fine">回答所有关键问题并填写业务预期后，才能确认。</p>}
        {session?.status==='stale'&&<p className="notice">源码引用已失效，请重新分析后再确认新规则。</p>}
      </section>;
    })}
    <div><h2>{readOnly?'项目特有规则草稿':'项目规则版本库'}</h2><p>选择项目规则只保存精确版本的草稿。准备状态不代表业务已通过；本阶段不会生成方案或执行项目规则。</p></div>
    {error&&<div className="notice error" role="alert"><p>{error}</p><details><summary>错误详情</summary><p>{errorCode}</p></details><button className="btn" disabled={working} onClick={()=>void work(async()=>{await load();setDrafts(previous=>Object.fromEntries(Object.entries(previous).map(([id,d])=>[id,{...d,confirmed:false}])));setNotice('已加载最新规则，本页输入已保留。请重新核对后手动保存。');})}>核对最新版本（保留本页输入）</button></div>}
    {notice&&<p className="info-strip" role="status">{notice}</p>}
    {!library&&!error&&<p role="status">正在读取项目规则…</p>}
    {library&&versions.length===0&&<p>尚未保存项目特有规则。检查建议需要你明确核对后才能进入版本库。</p>}
    {versions.map(rule=><SavedRule key={`${projectId}:${rule.id}`} rule={rule} reviewRevision={revision} selected={sameRef(library?.selectedRule,ruleRef(rule))} readiness={readiness.find(r=>sameRef(r.ruleRef,ruleRef(rule)))} readOnly={readOnly} working={working} onWork={work} onSelect={()=>work(async()=>{await projectRulesApi.select(projectId,{expectedRevision:revision,ruleRef:ruleRef(rule)});await saved('已保存项目规则草稿，未生成方案或执行检查。');})} onRevise={(changes:Data)=>work(async()=>{await projectRulesApi.revise(projectId,rule.id,{expectedRevision:revision,...changes});await saved('已追加修订版本，确认已清除。请核对新预期后重新确认。');})} onConfirm={()=>work(async()=>{await projectRulesApi.confirmVersion(projectId,rule.id,{expectedRevision:revision,version:rule.version,confirmed:true});await saved('当前版本已确认，尚未执行检查。');})}/>) }
  </section>;
}

type SavedProps={rule:Data;reviewRevision:number;selected:boolean;readiness?:Data;readOnly:boolean;working:boolean;onWork:(task:()=>Promise<void>)=>Promise<boolean>;onSelect:()=>Promise<boolean>;onRevise:(changes:Data)=>Promise<boolean>;onConfirm:()=>Promise<boolean>};
function SavedRule({rule,reviewRevision,selected,readiness,readOnly,working,onWork,onSelect,onRevise,onConfirm}:SavedProps){
  const [editing,setEditing]=useState(false),[behavior,setBehavior]=useState(rule.expectedBehavior.join('\n')),[answers,setAnswers]=useState<Record<string,string>>({...rule.answers}),[note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[historyVersion,setHistoryVersion]=useState(String(rule.version)),[history,setHistory]=useState<Data>(),dirtyInputs=useRef(false);
  useEffect(()=>{setConfirmed(false);setHistoryVersion(String(rule.version));setHistory(undefined);if(!editing&&!dirtyInputs.current){setBehavior(rule.expectedBehavior.join('\n'));setAnswers({...rule.answers});}},[rule.version,rule.contentHash,reviewRevision]);
  const pending=rule.confirmation.status!=='confirmed',dirty=hasUnsavedRuleChanges(rule,behavior,answers,note),answered=(rule.openQuestions??[]).every((q:string)=>typeof answers[q]==='string'&&!!answers[q].trim());
  useEffect(()=>setConfirmed(false),[dirty]);
  return <article className="rule-row" aria-label={`项目规则 ${rule.flow} v${rule.version}`}>
    <h3>{rule.flow} · v{rule.version}</h3><p className="fine">{pending?'待重新确认':'已由你确认'} · {selected?'已选为项目规则草稿':'未选入项目规则草稿'}</p>
    <ul>{rule.expectedBehavior.map((value:string,i:number)=><li key={i}>{value}</li>)}</ul>
    <p className="pill">{readinessLabels[readiness?.status??'']??'准备状态尚未核对'}</p>
    {readiness?.matchedTemplateRef&&<p className="fine">匹配方案：{readiness.matchedTemplateRef.id} @ {readiness.matchedTemplateRef.version}</p>}
    {!!readiness&&readiness.missing?.length>0&&<div><h4>待补齐的条件与能力</h4><ul>{readiness.missing.map((missing:Data,i:number)=><li key={i}>{friendlyError(missing.detail)}</li>)}</ul><details><summary>缺口代码</summary><ul>{readiness.missing.map((missing:Data,i:number)=><li key={i}>{missing.code}</li>)}</ul></details></div>}
    <details><summary>规则来源与关键问题</summary><p>来源分析：{rule.suggestionRef.discoveryId} · 建议 {rule.suggestionRef.suggestionId}</p><h4>源码事实</h4>{(rule.facts??[]).map((f:Data,i:number)=><p key={i}>{f.text}</p>)}<h4>候选预期（保留来源，不替代确认）</h4>{(rule.expectations??[]).map((e:Data,i:number)=><p key={i}>{e.text} · {e.source==='documentation'?'文档':e.source==='project_test'?'项目测试':'AI 假设'}</p>)}<dl>{(rule.openQuestions??[]).map((q:string)=><div key={q}><dt>{q}</dt><dd>{rule.answers[q]??'未回答'}</dd></div>)}</dl><ul>{(rule.sourceRefs??[]).map((r:Data,i:number)=><li key={i}>{r.path}:{r.startLine}-{r.endLine}</li>)}</ul><p className="fine">规则 ID：{rule.id} · 内容摘要：{rule.contentHash}</p></details>
    {!readOnly&&<div className="actions"><button className="btn" disabled={working||pending||selected} onClick={()=>void onSelect()}>{selected?'已选择此版本（草稿）':'选择此版本（仅保存草稿）'}</button><button className="btn" disabled={working} onClick={()=>{setEditing(!editing);setConfirmed(false)}}>{editing?'收起修订（保留输入）':'修订业务预期'}</button></div>}
    {!readOnly&&pending&&<div>{dirty&&<p className="notice">有尚未保存的修订。请先保存修订或明确放弃，再确认当前版本。</p>}<label className="check"><input type="checkbox" disabled={working||editing||dirty} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>已核对修订后的业务预期</label><button className="btn primary" disabled={working||editing||dirty||!confirmed} onClick={()=>void onConfirm()}>确认当前版本</button></div>}
    {!readOnly&&editing&&<section role="region" aria-label="修订项目规则"><label className="field">修订后的预期行为（每行一条）<textarea disabled={working} value={behavior} onChange={e=>{dirtyInputs.current=true;setBehavior(e.target.value);setConfirmed(false)}}/></label>{(rule.openQuestions??[]).map((q:string)=><label className="field" key={q}>修订回答：{q}<textarea disabled={working} value={answers[q]??''} onChange={e=>{dirtyInputs.current=true;setAnswers({...answers,[q]:e.target.value});setConfirmed(false)}}/></label>)}<label className="field">纠正说明<textarea disabled={working} value={note} onChange={e=>{dirtyInputs.current=true;setNote(e.target.value);setConfirmed(false)}}/></label><p className="fine">保存会追加新版本并清除确认，旧版本仍可查阅；不会自动选择或执行新版本。</p><button className="btn" disabled={working||!lines(behavior).length||!answered||!note.trim()} onClick={()=>{void onRevise({expectedBehavior:lines(behavior),answers:Object.fromEntries(Object.entries(answers).map(([q,a])=>[q,a.trim()])),note:note.trim(),...(rule.requirements?{requirements:rule.requirements}:{})}).then(ok=>{if(ok){dirtyInputs.current=false;setEditing(false);setNote('');setConfirmed(false)}});}}>保存修订（清除确认）</button></section>}
    {!readOnly&&dirty&&<button className="text-button" disabled={working} onClick={()=>{dirtyInputs.current=false;setBehavior(rule.expectedBehavior.join('\n'));setAnswers({...rule.answers});setNote('');setConfirmed(false);setEditing(false)}}>放弃未保存修订</button>}
    {(rule.corrections??[]).length>0&&<details><summary>纠正记录</summary><ul>{rule.corrections.map((c:Data,i:number)=><li key={i}>v{c.previousVersion} → v{c.previousVersion+1}：{c.note} · {c.time}</li>)}</ul></details>}
    <details><summary>历史版本</summary><label className="field">历史版本<select value={historyVersion} disabled={working} onChange={e=>{setHistoryVersion(e.target.value);setHistory(undefined)}}>{Array.from({length:rule.version},(_,i)=><option key={i+1} value={i+1}>v{i+1}</option>)}</select></label><button className="btn" disabled={working} onClick={()=>void onWork(async()=>setHistory(await projectRulesApi.version(rule.projectId,rule.id,Number(historyVersion))))}>查看历史版本</button>{history&&<section role="region" aria-label={`历史规则 v${history.version}`}><h4>历史规则 v{history.version} · {history.confirmation.status==='confirmed'?'当时已确认':'当时待确认'}</h4><ul>{history.expectedBehavior.map((v:string,i:number)=><li key={i}>{v}</li>)}</ul><p className="fine">历史版本仅供查阅，不改变当前选择与确认。</p></section>}</details>
  </article>;
}
