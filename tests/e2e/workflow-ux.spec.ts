import {test,expect} from '@playwright/test';
import {goStep} from './workflow-steps';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
// @ts-ignore compiled local host
import {startWorkbench} from '../../apps/host/dist/api.js';
// @ts-ignore synthetic local registry
import {publishedFixture} from '../support/published.mjs';
// @ts-ignore compiled local registry
import {TemplateRegistry} from '../../apps/host/dist/templates/store.js';
const output='output/ux-workflow-v12-20261015-01a13f78';
test('cancel keeps preparation input; dialogs return focus; local model settings save without dispatch',async({page})=>{
 const directory=join(process.cwd(),output,'state',randomUUID()),host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 const req=async(path:string,body?:any)=>{const r=await fetch(host.url+'/api'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});expect(r.ok).toBe(true);return r.json()};
 try{
 const {projectId}=await req('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'});
 let dispatches=0;page.on('request',r=>{if(r.method()==='POST'&&/\/(prepare|candidate|run|replay|load|check)$/.test(new URL(r.url()).pathname))dispatches++});
 await page.goto(host.url+`/?page=project&step=4&project=${projectId}`);
 const consent=page.getByLabel('我同意在独立测试副本中创建用户并重置测试数据');await consent.check();
 await page.getByRole('button',{name:'取消准备',exact:true}).click();
 await expect(page.getByRole('button',{name:'打开环境准备',exact:true})).toBeFocused();await page.getByRole('button',{name:'打开环境准备',exact:true}).click();await expect(consent).toBeChecked();expect(dispatches).toBe(0);
 const detail=page.getByRole('button',{name:'查看本步骤说明与证据',exact:true});
 for(const width of [1280,800,390]){
 await page.setViewportSize({width,height:900});await detail.click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');await expect(detail).toBeFocused();
 await detail.click();await page.getByRole('button',{name:'关闭详情',exact:true}).click();await expect(detail).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await page.getByRole('button',{name:'模型设置',exact:true}).click();await page.getByLabel('模型名称',{exact:true}).fill('synthetic-unsent-model');
 await page.getByRole('button',{name:'保存到本机',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'未发送连接检查'})).toBeVisible();
 await page.getByRole('button',{name:'返回04 检查运行条件',exact:true}).click();await expect(consent).toBeChecked();expect(dispatches).toBe(0);
 await page.reload();await page.getByRole('button',{name:'模型设置',exact:true}).click();await expect(page.getByLabel('模型名称',{exact:true})).toHaveValue('synthetic-unsent-model');expect(dispatches).toBe(0);
 }finally{await host.close()}
});
test('result exports, optional repair cancel and explicit replay preserve original report',async({page})=>{
 const directory=join(process.cwd(),output,'state',randomUUID()),registryDirectory=join(directory,'registry');
 await publishedFixture(directory,new TemplateRegistry(registryDirectory),'packages/contracts/fixtures/save-result.json','save-rule');
 const host=await startWorkbench({directory,registryDirectory,port:0});
 const req=async(path:string,body?:any)=>{const r=await fetch(host.url+'/api'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});expect(r.ok).toBe(true);return r.json()};
 try{
 const {projectId}=await req('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'});const state=await req('/state');await req(`/projects/${projectId}/confirm`,{environment:true,environmentHash:state.projects[0].environmentHash});
 await page.goto(host.url+`/?page=verify&step=3&project=${projectId}`);await page.getByLabel('提交结果保存',{exact:true}).selectOption('observe');await page.getByRole('combobox',{name:'提交结果保存',exact:true}).selectOption('confirm');await goStep(page,10);
 await page.getByRole('button',{name:'准备本轮检查',exact:true}).click();await page.getByRole('button',{name:'执行检查',exact:true}).click();await page.getByRole('button',{name:'查看检查结果',exact:true}).click();await expect(page.getByRole('heading',{name:'本轮所选检查通过',exact:true})).toBeVisible();
 const original=new URL(page.url()).searchParams.get('run');
 await page.getByText('更多导出格式与备份',{exact:true}).click();
 for(const label of ['导出报告 Markdown','导出外部修复报告','导出验证包']){const download=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();const file=await download;expect(file.suggestedFilename()).toContain(original!);await file.saveAs(join(output,'automated',file.suggestedFilename()));}
 await page.getByRole('button',{name:'结束本次任务',exact:true}).click();await expect(page.getByText('本次任务已结束，历史记录保留。可以关闭窗口，不需要完成12。',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'进入12 修复与复测（可选）',exact:true}).click();await expect(page.getByRole('heading',{name:'复跑准备',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'取消准备',exact:true}).click();expect((await req('/state')).runs).toHaveLength(1);await expect(page.getByRole('button',{name:'启用12并准备复测',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'启用12并准备复测',exact:true}).click();await page.getByRole('button',{name:'执行复测',exact:true}).click();await expect.poll(()=>new URL(page.url()).searchParams.get('run')).not.toBe(original);
 await expect.poll(async()=> (await req('/state')).runs.filter((r:any)=>r.status==='completed').length).toBe(2);
 const runs=(await req('/state')).runs;expect(runs.some((r:any)=>r.id===original)).toBe(true);expect(runs.find((r:any)=>r.id!==original).parentRunId).toBe(original);expect((await req('/state')).settings.hasKey).toBe(false);
 await page.screenshot({path:join(output,'automated','replay-report.png'),fullPage:true});
 }finally{await host.close()}
});
