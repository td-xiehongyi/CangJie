import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
// @ts-ignore compiled local host
import {startWorkbench} from '../../apps/host/dist/api.js';

test('preparation is one destination, old links and review back preserve state without starting work',async({page})=>{
 const directory=join(process.cwd(),'output/four-stage-20261017/regression/plan-preparation-20261016/state',randomUUID());
 const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 const req=async(path:string,body?:any)=>{const r=await fetch(host.url+'/api'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});expect(r.ok).toBe(true);return r.json()};
 try{
  const {projectId}=await req('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'});
  const state=await req('/state'),project=state.projects.find((p:any)=>p.id===projectId),rule=state.rules.find((r:any)=>r.id==='save-rule');
  await req(`/projects/${projectId}/workflow`,{revision:0,flow:'submit',choices:{'save-rule':{enabled:true,confirmed:false,ruleHash:rule.hash,environmentHash:project.environmentHash}}});
  let dispatches=0;page.on('request',r=>{if(r.method()==='POST'&&/\/(candidate|run|prepare|replay|publish|review|compile)$/.test(new URL(r.url()).pathname))dispatches++});
  for(const step of [5,6,7,8]){
   await page.goto(host.url+`/?page=verify&step=${step}&project=${projectId}`);
   await expect(page.locator('.current-task h2')).toHaveText('选择或生成检查方案');
   await expect(page.getByRole('navigation',{name:'项目检查流程'}).getByRole('button',{name:/^0[6-8] /})).toHaveCount(0);
   await expect(page.getByRole('heading',{name:'当前方案进度',exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:'继续：执行检查',exact:true})).toHaveCount(0);
  }
  await page.goto(host.url+`/?page=verify&step=9&project=${projectId}`);
  await page.getByRole('button',{name:'返回：选择或生成检查方案',exact:true}).click();await expect(page.locator('.current-task h2')).toHaveText('选择或生成检查方案');
  await page.getByRole('button',{name:'查看说明与验证依据',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('当前候选');await page.keyboard.press('Escape');
  expect(dispatches).toBe(0);expect((await req('/state')).runs).toHaveLength(0);
 }finally{await host.close()}
});
