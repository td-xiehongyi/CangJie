import type {TemplateSpec} from '@website-verification/contracts';

export function executableParameters(spec:TemplateSpec):boolean{
  if(spec.ruleRef.id!=='title-update-rule')return true;
  const {title,newTitle}=spec.parameters;
  return typeof title==='string'&&!!title.trim()&&typeof newTitle==='string'&&!!newTitle.trim()&&title!==newTitle;
}

export function repairLegacyTitleParameters(spec:TemplateSpec):TemplateSpec|undefined{
  if(spec.ruleRef.id!=='title-update-rule')return;
  const declarations=[spec.parameters.title,spec.parameters.newTitle];
  if(!declarations.every(v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===1&&v.type==='string'))return;
  return {...structuredClone(spec),parameters:{...spec.parameters,title:'测试标题（修改前）',newTitle:'测试标题（修改后）'}};
}
