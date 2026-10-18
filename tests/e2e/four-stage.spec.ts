import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {goStep,clickStep} from './workflow-steps';
// @ts-ignore compiled host
import {startWorkbench} from '../../apps/host/dist/api.js';

for(const width of [1280,768,390])test(`four stages preserve gates, settings, old links and inputs at ${width}px`,async({page})=>{
 const directory=join(process.cwd(),'output/four-stage-20261017/state',randomUUID());
 const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 const req=async(path:string,body?:unknown)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});expect(r.ok).toBe(true);return r.json()};
 try{
  await mkdir('output/four-stage-20261017/screenshots',{recursive:true});
  await page.setViewportSize({width,height:900});
  await page.goto(host.url);
  await expect(page.locator('.step-heading h1')).toHaveText(/^01\s*选择项目$/);
  await expect(page.locator('.current-task')).toHaveCount(0);
  await page.screenshot({path:`output/four-stage-20261017/screenshots/01-project-${width}.png`,fullPage:true});
  const {projectId}=await req('/projects',{directory:join(process.cwd(),'samples/registration'),accountMode:'automatic'});
  let actions=0;page.on('request',r=>{if(r.method()==='POST'&&/\/(discovery|resume|candidate|run|prepare|replay|load|publish|review|compile|confirm)$/.test(new URL(r.url()).pathname))actions++});
  await page.goto(host.url+`/?page=verify&step=3&project=${projectId}`);
  await expect(page.locator('.step-heading h1')).toHaveText(/^02\s*确认检查$/);
  await expect(page.getByRole('button',{name:'保存并继续：运行检查',exact:true})).toBeDisabled();
  await clickStep(page,5);
  await expect.poll(()=>new URL(page.url()).searchParams.get('step')).toBe('3');
  await expect(page.getByRole('alert')).toContainText('请先确认至少一项检查');
  await page.getByLabel('提交结果保存',{exact:true}).selectOption('observe');
  await expect(page.getByRole('status').filter({hasText:'检查选择已保存'})).toBeVisible();
  await page.screenshot({path:`output/four-stage-20261017/screenshots/02-confirm-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'保存并继续：运行检查',exact:true}).click();
  await expect(page.locator('.step-heading h1')).toHaveText(/^03\s*运行检查$/);
  await expect(page.locator('.step-heading h1')).toBeFocused();
  await goStep(page,5);
  await page.getByRole('button',{name:'模型设置',exact:true}).click();
  await page.getByLabel('模型名称',{exact:true}).fill('unsent-navigation-draft');
  await page.getByRole('button',{name:'返回：选择或生成检查方案',exact:true}).click();
  await expect(page.locator('.current-task h2')).toHaveText('选择或生成检查方案');
  await page.getByRole('button',{name:'模型设置',exact:true}).click();
  await expect(page.getByLabel('模型名称',{exact:true})).toHaveValue('unsent-navigation-draft');
  await page.getByRole('button',{name:'返回：选择或生成检查方案',exact:true}).click();
  for(const step of [6,7,8]){
   await page.goto(host.url+`/?page=verify&step=${step}&project=${projectId}`);
   await expect(page.locator('.step-heading h1')).toHaveText(/^03\s*运行检查$/);
   await expect.poll(()=>new URL(page.url()).searchParams.get('step')).toBe(String(step)); // legacy URL preserved until next navigation
   await expect(page.locator('.current-task h2')).toHaveText('选择或生成检查方案');
  }
  await page.getByRole('button',{name:'查看说明与验证依据',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('05 选择或生成检查方案');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'查看说明与验证依据',exact:true})).toBeFocused();
  await page.screenshot({path:`output/four-stage-20261017/screenshots/03-run-${width}.png`,fullPage:true});
  await goStep(page,11);
  await expect(page.locator('.step-heading h1')).toHaveText(/^04\s*处理结果$/);
  await expect(page.locator('.current-task')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'尚无验证结果',exact:true})).toBeVisible();
  await page.screenshot({path:`output/four-stage-20261017/screenshots/04-results-${width}.png`,fullPage:true});
  const toggle=page.getByRole('button',{name:/查看流程/});if(await toggle.isVisible())await toggle.click();
  const nav=page.getByRole('navigation',{name:'项目检查流程'});
  await expect(nav.getByRole('button')).toHaveCount(4);
  await expect(nav.locator('button[aria-current=step]')).toContainText('处理结果');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.goBack();await expect(page.locator('.step-heading h1')).toHaveText(/^03\s*运行检查$/);
  await page.goForward();await expect(page.locator('.step-heading h1')).toHaveText(/^04\s*处理结果$/);
  const current=(await req('/state')).projects.find((p:any)=>p.id===projectId);
  expect(current.workflow.flows.submit['save-rule'].confirmed).toBe(false);
  expect((await req('/state')).runs).toHaveLength(0);expect(actions).toBe(0);
 }finally{await page.unrouteAll({behavior:'wait'});await host.close();}
});
