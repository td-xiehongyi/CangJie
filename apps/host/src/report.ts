import type {RunRecord} from './replay.js';
const text=(v:unknown)=>String(v).replace(/[\r\n]+/g,' ').replace(/[|<>]/g,' ');
export function renderReport(run:RunRecord):string{
  const lines=[`# ${text(run.flow.title)} 验证报告`,``,`运行：${run.id} · 项目：${run.projectId}`,`状态：${run.status} · 范围：${run.kind}`,`来源运行：${run.parentRunId??'首次运行'}`,``,...run.checks.flatMap(c=>[`## ${text(c.rule.id)}`,`预期：${text([...c.rule.expectedChanges,...c.rule.invariants].join('；'))}`,`模板：${text(c.templateRef.id)} @ ${c.templateRef.version}`,c.mode==='observe'?'规则待确认：仅保存观察，不作对错判定。':c.verdicts.map(v=>`- ${text(v.assertionRef)}：${v.status}（${text(v.reasonCode)}）`).join('\n'),`实际观察：${c.observations.length} 条；证据：${Object.keys(run.evidence).length} 份。`,...c.observations.map(o=>`- 观察：${text(JSON.stringify(o))}`),``]),`## 未覆盖与下一步`,...run.uncovered.map(s=>`- ${text(s)}`),`- 失败请结合证据修复后复测；无法验证请补齐接入或证据条件。`];return lines.join('\n');
}
