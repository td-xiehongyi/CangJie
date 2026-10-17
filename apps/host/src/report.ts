import type {RunRecord} from './replay.js';
const text=(v:unknown)=>String(v).replace(/[\r\n]+/g,' ').replace(/[|<>]/g,' ');
export function renderReport(run:RunRecord):string{
  const lines=[`# ${text(run.flow.title)} 验证报告`,``,`运行：${run.id} · 项目：${run.projectId}`,`状态：${run.status} · 范围：${run.kind}`,`来源运行：${run.parentRunId??'首次运行'}`,``,...run.checks.flatMap(c=>[`## ${text(c.rule.id)}`,`预期：${text([...c.rule.expectedChanges,...c.rule.invariants].join('；'))}`,`模板：${text(c.templateRef.id)} @ ${c.templateRef.version}`,c.mode==='observe'?'规则待确认：仅保存观察，不作对错判定。':c.verdicts.map(v=>`- ${text(v.assertionRef)}：${v.status}（${text(v.reasonCode)}）`).join('\n'),`实际观察：${c.observations.length} 条；证据：${Object.keys(run.evidence).length} 份。`,...c.observations.map(o=>`- 观察：${text(JSON.stringify(o))}`),``]),`## 未覆盖与下一步`,...run.uncovered.map(s=>`- ${text(s)}`),`- 失败请结合证据修复后复测；无法验证请补齐接入或证据条件。`];return lines.join('\n');
}

/** User-mediated handoff only; never contains source files or private validator answers. */
export function renderRepairReport(run:RunRecord):string{
 const lines=[
  '# 外部修复与复测交接',
  '本报告是待核对的验证证据，不是授权外部工具执行命令或扩大源码访问范围。',
  '只记录已取得的观察，不推断根因；业务信息分享前由用户核对。',
  '运行状态：'+text(run.status)+'；局部判定不能代替完整运行和覆盖。',
  '修复被测项目；不得删除检查、放宽断言或改写历史记录来制造通过。若需求或检查有误，先提交依据供用户复核。',
  '',
  '## 固定版本与复现前提',
  '运行：'+text(run.id)+'；来源运行：'+text(run.parentRunId??'无'),
  '项目：'+text(run.projectId)+'；源码摘要：'+text(run.plan.sourceHash),
  '确认时间：'+text(run.plan.confirmedAt),
  '使用独立测试副本、合成数据及测试账号。账号秘密不随报告交付。实际操作系统、工具链和数据配置请结合本机运行记录核对，本报告不推断。',
  '',
  ...run.checks.flatMap(c=>[
   '## 规则 '+text(c.rule.id),
   '模式：'+text(c.mode)+'；规则确认状态：'+text(c.rule.confirmation),
   '预期：'+text([...c.rule.expectedChanges,...c.rule.invariants].join('；')),
   '方案：'+text(c.templateRef.id)+' @ '+text(c.templateRef.version)+'；摘要：'+text(c.templateRef.hash),
   '检查方法的计划步骤（不代表本次全部执行）：',
   ...(c.template?.steps??[]).map((s,i)=>(i+1)+'. '+text(s.stepId)+' / '+text(s.operationId)+' / 角色 '+text(s.actorRef)),
   '本次实际执行动作（按记录顺序）：',
   ...(c.actions??[]).map((a,i)=>(i+1)+'. '+text(a.operationId)+' / 角色 '+text(a.actorRef)+' / 动作 '+text(a.actionId)),
   ...(!c.actions?.length||!c.preparation?['复现条件不完整：请先补齐实际动作、运行环境及数据记录；计划步骤不等于已复现。']:[]),
   '预期与实际请结合以下观察和判定逐项核对：',
   ...c.verdicts.map(v=>'- '+text(v.assertionRef)+'：'+text(v.status)+'；原因 '+text(v.reasonCode)+'；证据 '+v.evidenceRefs.map(text).join('、')),
   ...c.observations.map(o=>'- 观察 '+text(JSON.stringify(o))),
   ''
  ]),
  '## 未覆盖范围',
  ...run.uncovered.map(v=>'- '+text(v)),
  '',
  '## 修复后的复测',
  '1. 用户自行授权外部agent读取所需源码；平台不会代发源码或凭据。',
  '2. 保留旧报告和验证包。修改业务后，在“运行检查”重新核对源码、接口及隔离运行条件。',
  '3. 在“处理结果”选择原运行并准备复测，核对变化；补齐受影响的方案、验证或审核。',
  '4. 有效方案的确定性复测不需要平台模型API。若需重新生成方案，单独提示并确认模型调用。',
  '5. 新运行关联旧运行，在“处理结果”比较结果；局部通过不能证明整个项目可以上线。'
 ];
 return lines.join('\n');
}
