import {expect,type Page} from '@playwright/test';
/** User navigation only: never starts model or execution operations. */
export async function goStep(page:Page,step:number){
 step=[6,7,8].includes(step)?5:step;
 const toggle=page.getByRole('button',{name:/全部步骤/}); if(await toggle.isVisible())await toggle.click();
 await page.getByRole('navigation',{name:'完整业务验证流程'}).getByRole('button',{name:new RegExp('^'+String(step).padStart(2,'0')+' ')}).click();
 await expect(page.locator('.step-heading h1')).toContainText(String(step).padStart(2,'0')+' ');
 await expect.poll(()=>new URL(page.url()).searchParams.get('step')).toBe(String(step));
}
export const visibleLabel=(page:Page,name:string)=>page.getByLabel(name,{exact:true}).filter({visible:true});
