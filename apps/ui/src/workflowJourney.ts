/** Navigation is a projection of evidence; selecting a step never starts work. */
export type StepStatus='pending'|'running'|'completed'|'evidence'|'blocked'|'stale'|'available'|'optional'|'skipped';
export const journeySteps=[
 {id:1,title:'导入项目',group:'A 明确要测什么',purpose:'选择项目源码或已有项目。'},
 {id:2,title:'了解与分析业务',group:'A 明确要测什么',purpose:'AI读取项目分析，或自行填写业务。'},
 {id:3,title:'确认要检查的业务',group:'A 明确要测什么',purpose:'选择本轮要检查的业务，确认正确行为与测试目标。'},
 {id:4,title:'检查运行条件',group:'B 准备怎么测',purpose:'补齐隔离环境、测试账号和接口映射。'},
 {id:5,title:'选择或生成检查方案',group:'B 准备怎么测',purpose:'为已确认业务选择已有方案或生成新方案，在这里查看验证与试运行进度。'},
 {id:6,title:'创建或适配检查方案',group:'B 准备怎么测',purpose:'创建候选方案或复用精确版本；此时不代表业务通过。'},
 {id:7,title:'独立验证方案',group:'B 准备怎么测',purpose:'查看独立正常、错误及证据不足案例的验证。'},
 {id:8,title:'在当前项目试运行',group:'B 准备怎么测',purpose:'核对方案与当前项目的接口、身份和证据适配。'},
 {id:9,title:'审核并确定方案',group:'B 准备怎么测',purpose:'审核证据并固定方案版本。'},
 {id:10,title:'执行正式检查',group:'C 执行与结果',purpose:'明确启动正确性检查；满足准入条件后才执行负载。'},
 {id:11,title:'结果、导出与保存复用',group:'C 执行与结果',purpose:'查看结果和未覆盖范围，导出或保存后即可结束。'},
 {id:12,title:'修复与复测',group:'可选分支',optional:true,purpose:'主动选择修复，核对变化后复测，再返回11对比。'}
] as const;
// Retain old step IDs for saved positions and URLs; only one preparation destination is shown.
export const navigationSteps=journeySteps.filter(s=>![6,7,8].includes(s.id));
// Stages only group existing views; legacy IDs remain the persisted navigation contract.
export const workflowStages=[
 {id:1,title:'选择项目',purpose:'选择要检查的网站源码。',steps:[1]},
 {id:2,title:'确认检查',purpose:'整理业务，确认本轮检查范围与正确行为。',steps:[2,3]},
 {id:3,title:'运行检查',purpose:'准备环境与检查方法，完成必要审核后明确开始检查。',steps:[4,5,6,7,8,9,10]},
 {id:4,title:'处理结果',purpose:'查看问题与证据，交给开发者修复，再按原规则复测。',steps:[11,12]}
] as const;
export function stageForStep(step:number){return workflowStages.find(stage=>(stage.steps as readonly number[]).includes(step))??workflowStages[0];}
export function stageEntry(stageId:number,currentStep:number):number{
 const stage=workflowStages.find(stage=>stage.id===stageId)??workflowStages[0];
 return (stage.steps as readonly number[]).includes(currentStep)?parseStep(String(currentStep)):stage.steps[0];
}
export function parseStep(value:string|null|undefined):number{
 if(!value||!/^0?[1-9]$|^1[0-2]$/.test(value))return 1;
 return [6,7,8].includes(Number(value))?5:Number(value);
}
export function stepPage(step:number):string{return step===11?'report':step===12?'repair':[1,2,4].includes(step)?'project':'verify';}
export const stepStatusLabels:Record<StepStatus,string>={skipped:'已跳过',pending:'未开始',running:'进行中',completed:'已完成',evidence:'已有证据满足',blocked:'已阻断',stale:'已失效',available:'可查看',optional:'可选 · 未启用'};
type Value=Record<string,any>;
export function hasBusinessSelection(project:Value|undefined,state:Value):boolean{
 if(!project)return false;
 return Object.values(project.workflow?.flows?.[project.workflow?.flow]??{}).some((choice:any)=>choice.enabled===true)
  ||(state.projectRules?.[project.id]?.versions??[]).some((rule:Value)=>rule.sourceCurrent!==false&&rule.confirmation?.status==='confirmed');
}
export function journeyState(project:Value|undefined,state:Value,run:Value|undefined,repairEnabled:boolean):Record<number,{status:StepStatus;reason:string}>{
 const result:Record<number,{status:StepStatus;reason:string}>=Object.fromEntries(journeySteps.map(s=>[s.id,{status:s.id===12&&!repairEnabled?'optional':'pending',reason:s.purpose}]));
 if(!project)return result;
 result[1]={status:'completed',reason:'项目已导入；导入不代表运行条件就绪。'};
 const analysis=project.discovery;
 if(project.journey?.skipAnalysis)result[2]={status:'skipped',reason:'用户选择自行确认业务，本轮不使用AI分析；不代表已覆盖全部业务。'};
 else if(analysis)result[2]={status:analysis.status==='stale'?'stale':analysis.status==='running'?'running':analysis.status==='completed'?'completed':analysis.result?'available':'blocked',reason:analysis.status==='stale'?'来源已变化，请重新核对范围。':'查看业务建议与未决问题，建议不等于已确认规则。'};
 const choices=Object.values(project.workflow?.flows?.[project.workflow?.flow]??{}).filter((x:any)=>x.enabled) as Value[];
 if(choices.length)result[3]={status:choices.every(x=>x.confirmed&&x.environmentHash===project.environmentHash)?'completed':'available',reason:'已选检查保留；未确认项只能观察，版本变化需重新确认。'};
 if(project.preparation)result[4]={status:project.environmentCurrent===false||project.preparation.environmentHash!==project.environmentHash?'stale':project.preparation.status==='ready'?'evidence':['running','preparing'].includes(project.preparation.status)?'running':'blocked',reason:'环境准备证据仅适用于对应环境版本。'};
 const businessRules=state.projectRules?.[project.id]?.versions??[];
 if(!choices.length&&businessRules.length)result[3]={
  status:businessRules.some((r:Value)=>r.sourceCurrent===false)?'stale':businessRules.every((r:Value)=>r.confirmation?.status==='confirmed')?'completed':'available',
  reason:'项目业务预期的确认状态；不代表已选入运行或具备执行资格。'
 };
 const matches=project.catalog?.matches??state.catalog?.matches??[];
 if(choices.length)result[5]={status:'available',reason:'请逐项核对模板、能力与适用条件。'};
 const exact=choices.length>0&&choices.every(x=>x.version&&x.ruleHash&&matches.some((m:Value)=>m.ref.hash===x.version&&m.ruleHash===x.ruleHash)&&x.environmentHash===project.environmentHash);
 if(exact)for(const id of [6,7,9])result[id]={status:'evidence',reason:'已选精确方案版本存在有效目录记录；请查看其依据，本次未重新验证。'};
 const candidate=project.candidate;
 if(exact)result[5]={status:'evidence',reason:'已选方案具有对应版本证据；执行前仍须核对适用条件。'};
 if(candidate){
  const awaitingReview=candidate.status==='ready_for_review',blocked=!!candidate.code&&!awaitingReview;
  const published=!!candidate.draftHash&&matches.some((m:Value)=>m.ref.hash===candidate.draftHash);
  if(['running','validating'].includes(candidate.status)||choices.some(x=>candidate.ruleHash&&x.ruleHash===candidate.ruleHash)||Object.entries(project.workflow?.flows?.[project.workflow?.flow]??{}).some(([id,value]:[string,any])=>value.enabled&&id===(candidate.ruleRef?.id??candidate.ruleId??candidate.spec?.ruleRef?.id)))result[5]={status:['running','validating'].includes(candidate.status)?'running':blocked?'blocked':exact?'evidence':'available',reason:['running','validating'].includes(candidate.status)?'方案正在准备，验证与试运行的进度在当前页更新。':blocked?'方案准备受阻，请查看原因；已有合格版本的资格仍由后端核对。':published?'方案已发布，执行前请核对本轮精确版本与适用条件。':awaitingReview?'方案准备已完成，等待业务和技术审核。':'方案记录可查看，请核对验证与审核结果。'};
  result[6]={status:['running','validating'].includes(candidate.status)?'running':'available',reason:'候选方案尚需独立验证、项目试运行与审核。'};
  result[7]={status:candidate.status==='validating'?'running':'available',reason:'查看独立验证记录，不以候选存在推断已通过。'};
  result[8]={status:'available',reason:'查看当前项目试运行及适配证据。'};
  result[9]={status:published?'evidence':'available',reason:published?'固定方案版本具有有效审核记录；执行前仍需本轮确认。':'查看双重审核与版本；未完成审核不能执行。'};
 }
 const current=run?.projectId===project.id?run:undefined;
 if(current){
  result[10]={status:current.status==='running'?'running':current.status==='completed'?'completed':'blocked',reason:'执行完成和业务通过是两个独立状态，以结果页中的证据为准。'};
  result[11]={status:'available',reason:'当前结果可以查看；失败或部分结果也可导出。'};
 }
 if(project.environmentCurrent===false){
  result[4]={status:'stale',reason:'项目文件已变化，请重新检查项目并确认测试环境。'};
  for(const id of [5,6,7,8,9])if(result[id].status==='evidence')result[id]={status:'stale',reason:'项目文件已变化，已有方案证据需重新核对适用条件。'};
 }
 return result;
}

/** UI navigation is immediate; best-effort position writes preserve click order. */
export function createViewPositionWriter(write:(projectId:string,step:number)=>Promise<void>,onError:(error:Error)=>void){
 let tail:Promise<void>=Promise.resolve();
 return {
  save(projectId:string,step:number):void{
   tail=tail.then(()=>write(projectId,step)).catch(error=>{onError(error instanceof Error?error:new Error(String(error)));});
  },
  settled:()=>tail
 };
}
