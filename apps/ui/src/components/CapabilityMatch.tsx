import type {ReactNode} from 'react';
import {download,type CommonProps,type Data} from '../api/client';
export function capabilityDisposition(rule:Data,readiness?:Data){
 if(rule.sourceCurrent===false||rule.confirmation?.status!=='confirmed'||rule.openQuestions?.some((q:string)=>!rule.answers?.[q]))return {label:'待澄清',step:3};
 if(!readiness)return {label:'待澄清',step:3};
 if(readiness.status==='reusable')return {label:'可复用',step:5};
 if(readiness.status==='generatable')return {label:'可创建',step:5};
 if(readiness.status==='needs_capability'||readiness.missing?.some((m:Data)=>m.code==='VALIDATION_RESOURCE_GAP'))return {label:'待扩展',step:5};
 return {label:'待适配',step:4};
}
export default function CapabilityMatch({state,project,select,prepareAction}:CommonProps&{prepareAction?:(rule:Data)=>ReactNode}){
 if(!project)return null;
 const collection=state.projectRules?.[project.id],versions:Data[]=collection?.versions??[];
 if(!versions.length)return null;
 return <section className="card"><h2>项目特有规则的准备情况</h2><p>业务建议不会自动获得执行资格。下面保留所有项目规则及未覆盖原因；缺少能力时可导出本地开发缺口，不自动交给外部服务。</p>{!versions.length&&<p>尚无已保存的项目特有规则，可在03确认分析建议。已有基础检查方案仍可在下方核对。</p>}{versions.map(rule=>{
 const readiness=collection.readiness?.find((r:Data)=>r.ruleRef.id===rule.id&&r.ruleRef.contentHash===rule.contentHash),d=capabilityDisposition(rule,readiness);
 return <article className="rule-row" key={rule.id}><h3>{rule.flow} · {d.label==='可复用'?'能直接使用':d.label==='可创建'?'需要准备':d.label==='待扩展'?'暂不支持':d.label}</h3><p>规则版本{rule.version} · 此状态不代表业务通过</p><ul>{readiness?.missing?.map((m:Data,i:number)=><li key={i}>{m.detail}</li>)}</ul>{d.label==='待扩展'?<button className="btn" onClick={()=>download('business-capability-gap.json',{projectId:project.id,ruleRef:{id:rule.id,version:rule.version,contentHash:rule.contentHash},business:rule.flow,expectedBehavior:rule.expectedBehavior,missing:readiness?.missing,coverage:'未覆盖；需要开发并独立验证后重新评估'})}>导出能力缺口</button>:d.step!==5?<button className="btn" onClick={()=>select(project.id,undefined,'step:'+d.step)}>{d.step===3?'核对业务预期':'补充运行条件'}</button>:<>{prepareAction?.(rule)??<p>继续在下方核对方案与适用条件。</p>}</>}</article>;
 })}</section>;
}
