import {friendlyError,statusNames,type Data} from '../api/client';
import {preparationProgress} from '../planPreparation';
import CandidateEvidence from './CandidateEvidence';

export default function PlanPreparation({selected,reusable,candidate,unselected=false,published=false,onReview}:{selected:number;reusable:number;candidate?:Data;unselected?:boolean;published?:boolean;onReview:()=>void}){
 const active=['validating','running'].includes(candidate?.status);
 const ready=selected>0&&selected===reusable;
 const needsReview=candidate?.status==='ready_for_review'&&!published;
 return <section className="card" aria-label="方案准备进度">
  <div role="status"><h2>当前方案进度</h2>{candidate&&<span className="pill">{published?'已发布':statusNames[candidate.status]??candidate.status}</span>}<p>{unselected?'另有方案正在准备，不属于本轮选择；完成前暂不能启动新的方案。':active?'正在准备方案，验证与试运行进度会在这里更新。':needsReview?'方案准备已完成，下一步需要人工审核。':ready?'已有合格方案，可核对适用条件后前往检查。':candidate?.code?'方案准备受阻，请查看原因和证据。':selected?'在下方准备尚缺的检查方案。':'业务已确认，请在下方准备检查能力并选择本轮检查项。'}</p></div>
  {needsReview&&reusable>0&&<div className="actions"><button className="btn primary" onClick={onReview}>审核新生成的方案</button><p className="fine">继续执行时仍使用已选的合格版本，新方案通过审核后才可使用。</p></div>}
  <ol className="plan-progress" aria-label="方案准备过程">{preparationProgress(selected,reusable,candidate).map(item=><li key={item.label}><strong>{item.label}</strong><span>{item.value}</span></li>)}</ol>
  {candidate?.code&&<p className="notice">{friendlyError(candidate.code)}</p>}
  {candidate&&<details><summary>查看验证与试运行证据</summary><CandidateEvidence candidate={candidate} inPanel/></details>}
  <p className="fine">方案可靠与网站业务通过是两项不同结论；新方案仍需双重审核。</p>
 </section>;
}
