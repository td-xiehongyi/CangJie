import DetailPanel from './DetailPanel';
import {useEffect,useRef,useState} from 'react';
import {useLeaveGuard} from '../navigation';
import CandidateEvidence from './CandidateEvidence';
import {api,friendlyError,subscribeSession,ruleNames,statusNames,type Data,type CommonProps} from '../api/client';

type Props=Pick<CommonProps,'state'|'refresh'|'select'>&{project:Data;stage?:number;readOnly?:boolean;hideContinue?:boolean;continueBlocked?:string;onDirtyChange?:(dirty:boolean)=>void;onContinue?:(ref:Data,ruleId:string)=>void};
const lines=(value:string)=>value.split('\n').map(s=>s.trim()).filter(Boolean);

export default function CandidateReviewCard({state,project,refresh,select,stage,readOnly:requestedReadOnly=false,hideContinue=false,continueBlocked,onDirtyChange,onContinue}:Props){
  const readOnly=requestedReadOnly||stage===7||stage===8;
  const [heldCandidate,setHeldCandidate]=useState<Data>();
  const candidate=heldCandidate??project.candidate,ruleId=candidate.ruleId??candidate.spec?.ruleRef.id;
  const source=candidate.metadata??candidate.reference;
  const versions=state.catalog.matches.filter((m:Data)=>m.ref.id===candidate.spec?.id).map((m:Data)=>m.ref.version.split('.').map(Number)).sort((a:number[],b:number[])=>b[0]-a[0]||b[1]-a[1]||b[2]-a[2]);
  const suggestedVersion=versions[0]?`${versions[0][0]}.${versions[0][1]}.${versions[0][2]+1}`:'1.0.0';
  const [version,setVersion]=useState(candidate.metadata?.version??suggestedVersion);
  const [applicable,setApplicable]=useState((source?.applicable??[]).join('\n')),[excluded,setExcluded]=useState((source?.excluded??[]).join('\n')),[instructions,setInstructions]=useState(source?.instructions??'');
  const [savedHash,setSavedHash]=useState(candidate.draftHash??''),[business,setBusiness]=useState(''),[reviewer,setReviewer]=useState('');
  const [businessOK,setBusinessOK]=useState(false),[technicalOK,setTechnicalOK]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>subscribeSession(expired=>{if(!expired)setError(current=>current===friendlyError('SESSION_REQUIRED')?'连接已恢复，审核输入已保留。请核对后手动保存，尚未重新提交审核。':current);}),[]);
  const dirty=useRef(false),section=useRef<HTMLElement>(null);
  const publication=!dirty.current&&state.catalog.matches.find((m:Data)=>m.ref.hash===candidate.draftHash);
  const remoteChanged=!!heldCandidate&&(heldCandidate.id!==project.candidate.id||heldCandidate.candidateHash!==project.candidate.candidateHash||heldCandidate.draftHash!==project.candidate.draftHash);
  function discard(){dirty.current=false;setHeldCandidate(undefined);onDirtyChange?.(false);const next=project.candidate.metadata??project.candidate.reference;setVersion(project.candidate.metadata?.version??suggestedVersion);setApplicable((next?.applicable??[]).join('\n'));setExcluded((next?.excluded??[]).join('\n'));setInstructions(next?.instructions??'');setSavedHash(project.candidate.draftHash??'');setBusinessOK(false);setTechnicalOK(false);}
  const navigation=useLeaveGuard(readOnly?'review-readonly':'review',async()=>{
    if(readOnly||!dirty.current||section.current?.closest('[hidden]'))return true;
    const leave=await navigation.confirmLeave(save);
    if(leave&&dirty.current)discard();
    return leave;
  });
  useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(dirty.current&&!readOnly){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[readOnly]);
  useEffect(()=>{
    setBusinessOK(false);setTechnicalOK(false);
    if(dirty.current)return;
    const next=candidate.metadata??candidate.reference;setVersion(candidate.metadata?.version??suggestedVersion);setApplicable((next?.applicable??[]).join('\n'));setExcluded((next?.excluded??[]).join('\n'));setInstructions(next?.instructions??'');setBusiness('');setReviewer('');
    setSavedHash(candidate.draftHash??'');
  },[candidate.id,candidate.candidateHash,candidate.draftHash,candidate.status]);
  function edit(set:(value:string)=>void,value:string){if(!dirty.current)setHeldCandidate(candidate);dirty.current=true;onDirtyChange?.(true);set(value);setSavedHash('');setBusinessOK(false);setTechnicalOK(false);}
  const materialValid=/^\d+\.\d+\.\d+$/.test(version)&&lines(applicable).length>0&&lines(excluded).length>0&&instructions.trim().length>0;
  const saved=!!savedHash&&savedHash===candidate.draftHash;
  async function save(){if(!materialValid)throw new Error('请填写有效版本、适用条件、排除条件和使用说明后保存。');setBusy(true);setError('');try{
    const result=await api(`/projects/${project.id}/review`,{candidateId:candidate.id,candidateHash:candidate.candidateHash,metadata:{version,applicable:lines(applicable),excluded:lines(excluded),instructions:instructions.trim()}});
    setSavedHash(result.draftHash);setBusinessOK(false);setTechnicalOK(false);await refresh();dirty.current=false;setHeldCandidate(undefined);onDirtyChange?.(false);
  }catch(e){setError(friendlyError((e as Error).message));throw e;}finally{setBusy(false);}}
  async function publish(){setBusy(true);setError('');try{
    await api(`/projects/${project.id}/publish`,{scope:savedHash,businessConfirmed:businessOK,technicalReviewed:technicalOK,businessConfirmation:business.trim(),technicalReviewer:reviewer.trim()});
    setBusinessOK(false);setTechnicalOK(false);await refresh();
  }catch(e){setError(friendlyError((e as Error).message));}finally{setBusy(false);}}
  const gates=candidate.validation?.gateResults,trial=candidate.trial;
  return <section ref={section} className="card candidate-review" aria-label="检查方案验证与审核">
    <div className="card-header"><div><span className="eyebrow">检查方案</span><h2 tabIndex={-1} id={readOnly?'report-candidate-heading':'candidate-review-heading'}>{stage===7?'独立验证结论':stage===8?'当前项目适配结论':'审核当前方案'}</h2></div><span className="pill" role="status">{publication?'已发布':statusNames[candidate.status]??candidate.status}</span></div>
    {remoteChanged&&<div className="notice"><p>其他页面已更新当前方案；本页未保存的说明已保留。</p><p>保存会写入原方案的审核材料，不会替换其他页面正在处理的方案。</p><button className="text-button" onClick={discard}>放弃修改并查看最新方案</button></div>}
    <p className="muted review-rule">{ruleNames[ruleId]??ruleId}</p>
    <details className="published-evidence" open={publication?undefined:true}><summary hidden={!publication}>检查方案已就绪 · 查看验证与审核依据</summary><ol hidden={!!stage} className="review-progress" aria-label="方案准备步骤"><li><strong>06 · 生成方案</strong><span>{candidate.spec?.id?'已生成':'准备中'}</span></li><li><strong>07—08 · 验证与试运行</strong><span>{gates?.admitted&&trial?.completed&&!trial.verdicts.some((v:Data)=>v.status==='inconclusive')?'已完成':candidate.phase==='awaiting_trial'?'试运行待处理':candidate.status==='rejected'?'未通过':'等待完成'}</span></li><li><strong>09 · 审核确认并发布</strong><span>{publication?'已发布':candidate.status==='ready_for_review'?'请在下方审核':'等待验证'}</span></li></ol>
    {stage===9?<><p>{gates?.admitted?'独立验证已通过':'独立验证未通过'} · {trial?.completed?'已有试运行证据，请核对结果':'试运行未完成'}</p><DetailPanel label="核对独立验证与试运行证据"><CandidateEvidence candidate={candidate} inPanel/></DetailPanel></>:<CandidateEvidence candidate={candidate} stage={stage}/>}</details>
    {publication?<div className="info-strip"><strong>已发布固定版本 {publication.ref.version}</strong><p>检查方案已可用于本轮业务验证。</p>{continueBlocked&&<p>{continueBlocked}</p>}<div className="actions" hidden={hideContinue}><button className="btn primary" disabled={!!continueBlocked} onClick={()=>onContinue?onContinue(publication.ref,ruleId):select(project.id,undefined,'step:10')}>{onContinue?'准备运行所选检查':'前往业务验证'}</button></div></div>:candidate.status==='ready_for_review'?<>
      <p className="success">自动验证与项目试运行已完成，请核对适用范围并完成双重审核。</p>
      {trial?.verdicts.some((v:Data)=>v.status==='fail')&&<p className="notice">试运行发现了业务问题。请查看证据；检查方案能检出问题，不代表被测业务已经通过。</p>}
      {readOnly?<><p className="muted">前往09完成说明编辑与双重审核。</p>{candidate.metadata&&<dl><dt>适用条件</dt><dd>{candidate.metadata.applicable.join('；')}</dd><dt>排除条件</dt><dd>{candidate.metadata.excluded.join('；')}</dd><dt>使用说明</dt><dd>{candidate.metadata.instructions}</dd></dl>}<button className="btn primary" onClick={()=>select(project.id,undefined,'step:9')}>前往09 审核方案</button></>:<>
        <div className="review-guidance"><h3>核对方案说明</h3><p className="muted">{candidate.metadata?'已恢复保存的审核材料；修改后需要重新保存和确认。':candidate.reference?<><strong>AI参考，待确认</strong> · 已根据本次候选预填，可直接修改。</>:'本方案未提供可用的 AI 参考说明，请补充以下三项；已有验证证据保留。'}</p></div>
        <fieldset className="review-form" disabled={busy}><legend className="sr-only">本版方案说明与人工审核</legend>
          <details><summary>方案版本（通常无需修改）</summary><label className="field review-version">固定版本<input value={version} onChange={e=>edit(setVersion,e.target.value)}/></label></details>
          <div className="review-fields"><label className="field">适用条件<textarea value={applicable} onChange={e=>edit(setApplicable,e.target.value)}/></label><label className="field">排除条件<textarea value={excluded} onChange={e=>edit(setExcluded,e.target.value)}/></label><label className="field review-instructions">使用说明<textarea value={instructions} onChange={e=>edit(setInstructions,e.target.value)}/></label></div>
          <div className="review-save"><p className="fine" role="status">{saved?'本版材料已保存。请核对证据后确认。':'说明尚未保存；保存后才能发布。'}</p><button className="btn" disabled={!materialValid} onClick={()=>void save().catch(()=>{})}>{busy?'正在保存或发布…':'保存本版审核材料'}</button></div>
          <div className="review-confirmation"><h3>确认本版方案</h3><p className="muted">业务确认人核对预期行为和适用范围；技术审核人核对定义、对照验证及限制。缺少技术审核时，请保留待审核状态并交给开发者。</p><div className="review-fields"><label className="field">业务确认人<input value={business} onChange={e=>setBusiness(e.target.value)}/></label><label className="field">开发者技术审核人<input value={reviewer} onChange={e=>setReviewer(e.target.value)}/></label></div><label className="check"><input type="checkbox" disabled={!saved} checked={businessOK} onChange={e=>setBusinessOK(e.target.checked)}/>确认规则及本版适用条件</label><label className="check"><input type="checkbox" disabled={!saved} checked={technicalOK} onChange={e=>setTechnicalOK(e.target.checked)}/>已审查定义、正反例、端到端证据及限制</label><div className="actions"><button className="btn primary" disabled={!saved||!businessOK||!technicalOK||!business.trim()||!reviewer.trim()} onClick={()=>void publish()}>审核通过，保存为可复用方案</button></div><p className="fine">仅保存到本机方案库，不对外公开。修改材料后需重新保存和双重确认。</p></div>
        </fieldset>
        {error&&<p className="error" role="alert">{error}</p>}
      </>}
    </>:<p className="notice">{candidate.code?friendlyError(candidate.code):'正在生成检查方案并自动验证，完成后将在这里展开审核材料。'}</p>}
  </section>;
}
