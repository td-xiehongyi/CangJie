import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {goStep} from './workflow-steps';
// @ts-ignore compiled production host
import {startWorkbench} from '../../apps/host/dist/api.js';

test('business choices explicitly confirm, observe or exclude; navigation preserves evidence without dispatch',async({page})=>{
 const directory=join(process.cwd(),'output/four-stage-20261017/regression/simplified-confirmation/state',randomUUID());
 const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 const req=async(path:string,body?:any)=>{const r=await fetch(host.url+'/api'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});expect(r.ok).toBe(true);return r.json()};
 try{
  const {projectId}=await req('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'});
  let dispatches=0;page.on('request',r=>{if(r.method()==='POST'&&/\/(candidate|run|prepare|replay|load|check)$/.test(new URL(r.url()).pathname))dispatches++});
  await page.goto(host.url+`/?page=verify&step=3&project=${projectId}`);
  const choice=page.getByRole('combobox',{name:'提交结果保存',exact:true});
  await expect(choice).toHaveValue('off');
  await expect(page.getByRole('heading',{name:'项目规则版本库',exact:true})).not.toBeVisible();
  await choice.selectOption('confirm');
  await expect.poll(async()=> (await req('/state')).projects[0].workflow.flows.submit?.['save-rule']?.confirmed).toBe(true);
  await page.reload();await expect(choice).toHaveValue('confirm');
  await choice.selectOption('observe');await expect(page.getByText('规则尚未确认：本条仅观察，不判对错。条件或版本变化后需重新确认。',{exact:true})).toBeVisible();
  await expect.poll(async()=> (await req('/state')).projects[0].workflow.flows.submit?.['save-rule']?.confirmed).toBe(false);
  await choice.selectOption('off');await expect.poll(async()=> (await req('/state')).projects[0].workflow.flows.submit?.['save-rule']?.enabled).toBe(false);
  await choice.selectOption('confirm');
  await page.getByText('查看完整规则定义',{exact:true}).first().click();await expect(page.locator('.rule-row details[open]')).toBeVisible();
  await page.getByRole('button',{name:'查看说明与验证依据',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.locator('.step-heading')).not.toContainText('查看04');
  await expect(page.getByText('检查选择已保存',{exact:true})).toBeVisible();
  for(const width of [1280,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`output/four-stage-20261017/regression/simplified-confirmation/03-${width}.png`,fullPage:true});}
  await page.getByLabel('测试目标',{exact:true}).selectOption('both');
  await page.getByLabel('计划每秒完整检查次数',{exact:true}).fill('2');await page.getByLabel('计划持续秒数',{exact:true}).fill('301');
  await page.getByRole('button',{name:'保存并继续：运行检查',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'测试目标无效'})).toBeVisible();expect(new URL(page.url()).searchParams.get('step')).toBe('3');
  await page.getByLabel('计划持续秒数',{exact:true}).fill('10');
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);let pending=false;
  await page.route('**/api/projects/*/journey',async route=>{if(route.request().method()==='POST'&&!route.request().postDataJSON().viewOnly){pending=true;await gate;}await route.continue();});
  await page.getByRole('button',{name:'保存并继续：运行检查',exact:true}).click();await expect.poll(()=>pending).toBe(true);await expect(page.getByLabel('测试目标',{exact:true})).toBeDisabled();release();
  await expect(page.locator('.current-task h2')).toHaveText('检查运行条件');expect((await req('/state')).projects[0].journey.goal).toBe('both');
  await goStep(page,1);await expect(page.getByRole('button',{name:'查看02 了解与分析业务',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'继续：确认检查',exact:true})).toBeVisible();
  await goStep(page,11);await expect(page.getByRole('button',{name:'查看12 修复与复测（可选）',exact:true})).toHaveCount(0);
  expect(dispatches).toBe(0);
 }finally{await host.close()}
});
