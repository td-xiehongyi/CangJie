import {expect,type Page} from '@playwright/test';
/** User navigation only: never starts model or execution operations. */
export async function clickStep(page:Page,step:number){
 step=[6,7,8].includes(step)?5:step;
 const stage=(n:number)=>n===1?1:n<=3?2:n<=10?3:4;
 const current=Number(new URL(page.url()).searchParams.get('step')??1);
 if(stage(current)!==stage(step)){
  const toggle=page.getByRole('button',{name:/查看流程/});if(await toggle.isVisible())await toggle.click();
  await page.getByRole('navigation',{name:'项目检查流程'}).getByRole('button',{name:new RegExp('^'+stage(step)+' ')}).click();
 }
 if([2,3,4,5,9,10].includes(step))await page.getByRole('navigation',{name:'当前阶段任务'}).locator(`button[data-step="${step}"]`).click();
}
export async function goStep(page:Page,step:number){
 step=[6,7,8].includes(step)?5:step;
 await clickStep(page,step);
 await expect.poll(()=>new URL(page.url()).searchParams.get('step')).toBe(String(step));
}
export const visibleLabel=(page:Page,name:string)=>page.getByLabel(name,{exact:true}).filter({visible:true});
