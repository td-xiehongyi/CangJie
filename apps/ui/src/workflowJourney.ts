/** Navigation is a projection of evidence; selecting a step never starts work. */
export type StepStatus='pending'|'running'|'completed'|'evidence'|'blocked'|'stale'|'available'|'optional'|'skipped';
export const journeySteps=[
 {id:1,title:'导入项目',group:'A 明确要测什么',purpose:'选择项目源码或已有项目。'},
 {id:2,title:'了解与分析业务',group:'A 明确要测什么',purpose:'选择分析范围并了解业务；调用模型前明确确认。'},
 {id:3,title:'确认业务与测试目标',group:'A 明确要测什么',purpose:'确认正确行为并选择正确性或目标负载。'},
 {id:4,title:'检查运行条件',group:'B 准备怎么测',purpose:'补齐隔离环境、测试账号和接口映射。'},
 {id:5,title:'准备检查方案',group:'B 准备怎么测',purpose:'匹配已有方案，按需创建，并在这里查看验证与试运行进度。'},
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
export function parseStep(value:string|null|undefined):number{
 if(!value||!/^0?[1-9]$|^1[0-2]$/.test(value))return 1;
 return [6,7,8].includes(Number(value))?5:Number(value);
}
export function stepPage(step:number):string{return step===11?'report':step===12?'repair':[1,2,4].includes(step)?'project':'verify';}
export const stepStatusLabels:Record<StepStatus,string>={skipped:'已跳过',pending:'未开始',running:'进行中',completed:'已完成',evidence:'已有证据满足',blocked:'已阻断',stale:'已失效',available:'可查看',optional:'可选 · 未启用'};
type Value=Record<string,any>;
export function journeyState(project:Value|undefined,state:Value,run:Value|undefined,repairEnabled:boolean):Record<number,{status:StepStatus;reason:string}>{
 const result:Record<number,{status:StepStatus;reason:string}>=Object.fromEntries(journeySteps.map(s=>[s.id,{status:s.id===12&&!repairEnabled?'optional':'pending',reason:s.purpose}]));
 if(!project)return result;
 result[1]={status:'completed',reason:'项目已导入；导入不代表运行条件就绪。'};
 const analysis=project.discovery;
 if(project.journey?.skipAnalysis)result[2]={status:'skipped',reason:'用户选择自行确认业务，本轮不使用AI分析；不代表已覆盖全部业务。'};
 else if(analysis)result[2]={status:analysis.status==='stale'?'stale':analysis.status==='running'?'running':analysis.status==='completed'?'completed':analysis.result?'available':'blocked',reason:analysis.status==='stale'?'来源已变化，请重新核对范围。':'查看业务建议与未决问题，建议不等于已确认规则。'};
 const choices=Object.values(project.workflow?.flows?.[project.workflow?.flow]??{}).filter((x:any)=>x.enabled) as Value[];
 if(choices.length)result[3]={status:choices.every(x=>x.confirmed&&x.environmentHash===project.environmentHash)?'completed':'available',reason:'已选检查保留；未确认项只能观察，版本变化需重新确认。'};
 if(project.preparation)result[4]={status:project.preparation.environmentHash!==project.environmentHash?'stale':project.preparation.status==='ready'?'evidence':project.preparation.status==='running'?'running':'blocked',reason:'环境准备证据仅适用于对应环境版本。'};
 const matches=project.catalog?.matches??state.catalog?.matches??[];
 if(choices.length)result[5]={status:'available',reason:'请逐项核对模板、能力与适用条件。'};
 const exact=choices.length>0&&choices.every(x=>x.version&&x.ruleHash&&matches.some((m:Value)=>m.ref.hash===x.version&&m.ruleHash===x.ruleHash)&&x.environmentHash===project.environmentHash);
 if(exact)for(const id of [6,7,9])result[id]={status:'evidence',reason:'已选精确方案版本存在有效目录记录；请查看其依据，本次未重新验证。'};
 const candidate=project.candidate;
 if(candidate){
  result[6]={status:['running','validating'].includes(candidate.status)?'running':'available',reason:'候选方案尚需独立验证、项目试运行与审核。'};
  result[7]={status:candidate.status==='validating'?'running':'available',reason:'查看独立验证记录，不以候选存在推断已通过。'};
  result[8]={status:'available',reason:'查看当前项目试运行及适配证据。'};
  result[9]={status:'available',reason:'查看双重审核与版本；未完成审核不能执行。'};
 }
 const current=run?.projectId===project.id?run:undefined;
 if(current){
  result[10]={status:current.status==='running'?'running':current.status==='completed'?'completed':'blocked',reason:'步骤完成和业务通过是两个独立状态，以11中的证据为准。'};
  result[11]={status:'available',reason:'当前结果可以查看；失败或部分结果也可导出。'};
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
