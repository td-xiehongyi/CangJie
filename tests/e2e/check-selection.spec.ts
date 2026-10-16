import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
// @ts-ignore compiled local host
import {startWorkbench} from '../../apps/host/dist/api.js';

test('empty checks keep the user on03 through continue, sidebar and saved preparation links',async({page})=>{
 const directory=join(process.cwd(),'output/check-selection-20261017/state',randomUUID());
 const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 const req=async(path:string,body?:any)=>{const r=await fetch(host.url+'/api'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});expect(r.ok).toBe(true);return r.json()};
 try{
  const {projectId}=await req('/projects',{directory:join(process.cwd(),'samples/registration'),accountMode:'automatic'});
  let dispatches=0;page.on('request',r=>{if(r.method()==='POST'&&/\/(candidate|run|prepare|replay|load|publish|review|compile)$/.test(new URL(r.url()).pathname))dispatches++});
  await page.goto(host.url+`/?page=verify&step=3&project=${projectId}`);
  const next=page.getByRole('button',{name:'继续：检查运行条件',exact:true});
  await expect(next).toBeDisabled();
  await expect(page.getByText('还没有选择检查项。请在上方检查项中选择“加入检查，并确认上述预期”或“仅观察，不判对错”。',{exact:true})).toBeVisible();
  await page.getByRole('navigation',{name:'完整业务验证流程'}).getByRole('button',{name:/^05 /}).click();
  await expect(page.locator('.step-heading h1')).toHaveText('03 确认要检查的业务');
  await expect(page.getByRole('alert')).toContainText('请先在03选择至少一项检查');
  for(const step of [5,6,7,8]){
   await page.goto(host.url+`/?page=verify&step=${step}&project=${projectId}`);
   await expect(page.locator('.step-heading h1')).toHaveText('03 确认要检查的业务');
   await expect.poll(()=>new URL(page.url()).searchParams.get('step')).toBe('3');
  }
  await expect(page.getByLabel('提交结果保存',{exact:true})).toHaveValue('off');
  expect((await req('/state')).projects.find((p:any)=>p.id===projectId).workflow.revision).toBe(0);
  expect(dispatches).toBe(0);
  await page.screenshot({path:join(process.cwd(),'output/check-selection-20261017/empty.png'),fullPage:true});
 }finally{await host.close()}
});

test('a saved current-operation choice unlocks05 without changing observation into confirmation',async({page})=>{
 const directory=join(process.cwd(),'output/check-selection-20261017/state',randomUUID());
 const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 const req=async(path:string,body?:any)=>{const r=await fetch(host.url+'/api'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});expect(r.ok).toBe(true);return r.json()};
 try{
  const {projectId}=await req('/projects',{directory:join(process.cwd(),'samples/registration'),accountMode:'automatic'});
  await page.goto(host.url+`/?page=verify&step=3&project=${projectId}`);
  await page.getByLabel('提交结果保存',{exact:true}).selectOption('observe');
  await page.getByRole('button',{name:'继续：检查运行条件',exact:true}).click();
  await expect(page.locator('.step-heading h1')).toHaveText('04 检查运行条件');
  await page.getByRole('navigation',{name:'完整业务验证流程'}).getByRole('button',{name:/^05 /}).click();
  await expect(page.locator('.step-heading h1')).toHaveText('05 选择或生成检查方案');
  let project=(await req('/state')).projects.find((p:any)=>p.id===projectId);
  expect(project.workflow.flows.submit['save-rule'].enabled).toBe(true);
  expect(project.workflow.flows.submit['save-rule'].confirmed).toBe(false);
  await page.reload();await expect(page.locator('.step-heading h1')).toHaveText('05 选择或生成检查方案');
  await page.getByRole('button',{name:'前往03 修改业务与目标',exact:true}).click();
  await expect(page.locator('.step-heading h1')).toHaveText('03 确认要检查的业务');
  await page.getByRole('combobox',{name:'要检查网站的哪种操作？',exact:true}).selectOption('edit');
  await expect(page.getByRole('button',{name:'继续：检查运行条件',exact:true})).toBeDisabled();
  await page.getByLabel('只改标题，优先级和所有者不变',{exact:true}).selectOption('confirm');
  await page.getByRole('navigation',{name:'完整业务验证流程'}).getByRole('button',{name:/^05 /}).click();
  await expect(page.locator('.step-heading h1')).toHaveText('05 选择或生成检查方案');
  project=(await req('/state')).projects.find((p:any)=>p.id===projectId);
  expect(project.workflow.flows.edit['title-update-rule'].confirmed).toBe(true);
  expect(project.workflow.flows.submit['save-rule'].confirmed).toBe(false);
 }finally{await host.close()}
});
