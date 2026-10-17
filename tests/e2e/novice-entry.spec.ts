import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
// @ts-ignore compiled host
import {startWorkbench} from '../../apps/host/dist/api.js';
const output='output/novice-entry-20261017';

test('editing a directory while an example request is pending preserves the newer user input',async({page})=>{
 const directory=join(process.cwd(),output,'browser',randomUUID()),host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 let release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
 try{
  await page.route('**/api/examples/ticket',async route=>{await gate;await route.fulfill({status:201,json:{kind:'practice',name:'迟到练习副本',directory:'C:\\synthetic-late-example'}}).catch(()=>{});});
  await page.goto(host.url);await page.getByText('没有合适的项目？用示例练习',{exact:true}).click();
  await page.getByRole('button',{name:'用工单示例体验',exact:true}).click();
  await expect(page.getByRole('button',{name:'正在准备独立副本…',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'项目目录',exact:true}).fill('C:\\my-new-directory');release();
  await expect(page.getByRole('button',{name:'用工单示例体验',exact:true})).toBeEnabled();
  await expect(page.getByRole('textbox',{name:'项目目录',exact:true})).toHaveValue('C:\\my-new-directory');
  await expect(page.getByRole('status').filter({hasText:'独立工单示例已准备'})).toHaveCount(0);
 }finally{release();await page.unrouteAll({behavior:'wait'});await host.close();}
});

test('a novice can prepare a clearly labelled example and inspect support without granting execution consent',async({page})=>{
 const directory=join(process.cwd(),output,'browser',randomUUID()),host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 const req=async()=>{const r=await fetch(host.url+'/api/state',{headers:{authorization:`Bearer ${host.token}`}});return r.json()};
 let execution=0;page.on('request',r=>{if(r.method()==='POST'&&/\/(discovery|candidate|prepare|confirm|run|replay|review|publish|load)$/.test(new URL(r.url()).pathname))execution++;});
 try{
  await page.goto(host.url);await page.getByText('没有合适的项目？用示例练习',{exact:true}).click();await expect(page.getByRole('button',{name:'用工单示例体验',exact:true})).toBeVisible();
  await expect(page.getByText('只创建本机练习副本，不自动导入、发送或运行。',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'用工单示例体验',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'独立工单示例已准备'})).toBeVisible();
  const examplePath=await page.getByRole('textbox',{name:'项目目录',exact:true}).inputValue();expect(examplePath).toContain('practice-projects');
  expect((await req()).projects).toHaveLength(0);expect(execution).toBe(0);
  await page.getByRole('button',{name:'导入源码',exact:true}).click();
  const support=page.getByRole('region',{name:'当前项目的静态支持情况',exact:true});
  await expect(support).toContainText('符合当前静态支持条件');await expect(support).toContainText('不代表网站已可运行或业务通过');
  await expect(page.getByRole('button',{name:'继续：确认检查',exact:true})).toBeEnabled();
  const state=await req();expect(state.projects).toHaveLength(1);expect(state.projects[0].sourceOnly).toBe(true);expect(state.runs).toHaveLength(0);expect(execution).toBe(0);
  await mkdir(join(output,'screenshots'),{recursive:true});
  for(const width of [1280,768,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:join(output,`screenshots/example-${width}.png`),fullPage:true});}
  // Selecting another directory must not continue with the formerly imported project.
  await page.getByRole('textbox',{name:'项目目录',exact:true}).fill('C:\\not-imported');
  await expect(page.getByRole('button',{name:'继续：确认检查',exact:true})).toHaveCount(0);
  await page.getByRole('textbox',{name:'项目目录',exact:true}).fill(examplePath);
  await page.getByRole('button',{name:'继续：确认检查',exact:true}).click();
  await expect(page.locator('.step-heading h1')).toHaveText('确认检查');expect(execution).toBe(0);
 }finally{await page.unrouteAll({behavior:'wait'});await host.close();}
});

test('missing support conditions, failed reads and stale responses retain the manual path and current project',async({page})=>{
 const directory=join(process.cwd(),output,'browser',randomUUID()),source=join(directory,'missing');await mkdir(source,{recursive:true});await writeFile(join(source,'package.json'),JSON.stringify({dependencies:{express:'^5.1.0'}}));
 const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 const req=async(path:string,body?:unknown)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return r.json()};
 let release=()=>{};
 try{
  const missing=await req('/source-projects',{directory:source}),ticket=await req('/source-projects',{directory:join(process.cwd(),'samples/ticket')});
  await page.route(`**/api/projects/${missing.id}/support`,route=>route.fulfill({status:503,json:{error:'SYNTHETIC_READ_FAILURE'}}));
  await page.goto(host.url+`/?page=project&step=1&project=${missing.id}`);
  const support=page.getByRole('region',{name:'当前项目的静态支持情况',exact:true});
  await expect(support.getByRole('alert')).toContainText('暂时无法核对支持范围');await expect(page.getByRole('button',{name:'继续：确认检查',exact:true})).toBeEnabled();
  await page.unroute(`**/api/projects/${missing.id}/support`);await support.getByRole('button',{name:'重新检查支持范围',exact:true}).click();
  await expect(support).toContainText('还需补充运行配置');await expect(support.getByRole('button',{name:'下载接入补充说明',exact:true})).toBeVisible();
  const downloading=page.waitForEvent('download');await support.getByRole('button',{name:'下载接入补充说明',exact:true}).click();expect((await downloading).suggestedFilename()).toBe('project-support-gap.md');
  const gate=new Promise<void>(resolve=>release=resolve);
  await page.route(`**/api/projects/${missing.id}/support`,async route=>{await gate;await route.fulfill({json:{projectId:missing.id,status:'unsupported',gaps:[],gapMarkdown:'',sourceHash:'old',checkedAt:new Date().toISOString()}}).catch(()=>{});});
  await support.getByRole('button',{name:'重新检查支持范围',exact:true}).click();
  await page.getByLabel('切换项目',{exact:true}).selectOption(ticket.id);release();
  await expect(page.getByRole('textbox',{name:'项目目录',exact:true})).toHaveValue(join(process.cwd(),'samples/ticket'));
  await expect(support).toContainText('符合当前静态支持条件');await expect(support).not.toContainText('超出当前自动准备范围');
  expect((await req('/state')).runs).toHaveLength(0);
 }finally{release();await page.unrouteAll({behavior:'wait'});await host.close();}
});
