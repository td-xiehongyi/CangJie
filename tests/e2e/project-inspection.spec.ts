import {test,expect,type Page} from '@playwright/test';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
// @ts-ignore compiled host
import {startWorkbench} from '../../apps/host/dist/api.js';

async function inspectionPage(page:Page){
  const directory=join(process.cwd(),'.local-data/project-inspection-tests',randomUUID());
  const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  const request=async(path:string,body?:unknown)=>{
    const response=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    expect(response.ok).toBe(true);return response.json();
  };
  const project=await request('/source-projects',{directory:join(process.cwd(),'samples/registration')});
  await page.goto(host.url+`/?page=project&step=4&project=${project.id}`);
  await expect(page.getByRole('button',{name:'检查并准备环境',exact:true})).toBeVisible();
  return {host,request,project};
}

test('project inspection times out a pending save and lets the user retry without losing inputs',async({page})=>{
  const {host,request}=await inspectionPage(page);
  let release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
  try{
    await page.clock.install();
    await page.getByText('高级配置：接口映射与候选生成材料',{exact:true}).click();
    const scope=page.getByRole('textbox',{name:'方案生成材料（与业务分析分别授权）',exact:true});
    await scope.fill('verification.json\nREADME.md');
    await page.route('**/api/projects',async route=>{await gate;await route.continue().catch(()=>{});});
    await page.getByRole('button',{name:'检查并准备环境',exact:true}).click();
    await expect(page.getByRole('button',{name:'正在检查项目…',exact:true})).toBeVisible();
    await page.clock.fastForward(31000);
    await expect(page.getByRole('alert').filter({hasText:'检查等待超时'})).toBeVisible({timeout:2000});
    await expect(page.getByRole('button',{name:'检查并准备环境',exact:true})).toBeEnabled();
    await expect(scope).toHaveValue('verification.json\nREADME.md');
    await page.screenshot({path:'output/inspection-fix-20261018/desktop-timeout.png',fullPage:true});
    const state=await request('/state');expect(state.runs).toHaveLength(0);
  }finally{release();await page.unrouteAll({behavior:'wait'});await host.close();}
});

test('project inspection bounds the refresh after a successful save and preserves the saved project',async({page})=>{
  const {host,request,project}=await inspectionPage(page);
  let saved=false,release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
  try{
    await page.clock.install();
    await page.route('**/api/projects',async route=>{const response=await route.fetch();saved=true;await route.fulfill({response});});
    await page.route('**/api/state',async route=>{if(saved)await gate;await route.continue().catch(()=>{});});
    await page.getByRole('button',{name:'检查并准备环境',exact:true}).click();
    await expect.poll(()=>saved).toBe(true);
    await page.clock.fastForward(31000);
    await expect(page.getByRole('alert').filter({hasText:'检查等待超时'})).toBeVisible({timeout:2000});
    await expect(page.getByRole('button',{name:'检查并准备环境',exact:true})).toBeEnabled();
    expect(new URL(page.url()).searchParams.get('step')).toBe('4');
    const state=await request('/state');expect(state.projects).toHaveLength(1);
    expect(state.projects[0].id).toBe(project.id);expect(state.projects[0].sourceOnly).toBe(false);
    expect(state.projects[0].environmentConfirmed).toBe(false);expect(state.projects[0].preparation).toBeFalsy();expect(state.runs).toHaveLength(0);
  }finally{release();await page.unrouteAll({behavior:'wait'});await host.close();}
});

test('cancelled inspection ignores its late response and an explicit retry succeeds without executing checks',async({page})=>{
  const {host,request,project}=await inspectionPage(page);
  let calls=0,release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
  try{
    await page.setViewportSize({width:390,height:844});
    await page.route('**/api/projects',async route=>{
      calls++;const response=await route.fetch();if(calls===1)await gate;
      await route.fulfill({response}).catch(()=>{});
    });
    await page.getByRole('button',{name:'检查并准备环境',exact:true}).click();
    await expect.poll(()=>calls).toBe(1);
    await page.screenshot({path:'output/inspection-fix-20261018/mobile-wait.png',fullPage:true});
    await page.getByRole('button',{name:'取消等待',exact:true}).click({timeout:2000});
    await expect(page.getByRole('button',{name:'检查并准备环境',exact:true})).toBeEnabled();
    await expect(page.getByRole('status').filter({hasText:'已取消等待'})).toBeVisible();
    await page.screenshot({path:'output/inspection-fix-20261018/mobile-cancelled.png',fullPage:true});
    release();
    await expect(page.getByRole('button',{name:'检查并准备环境',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'准备测试环境',exact:true})).toBeHidden();
    await page.getByRole('button',{name:'检查并准备环境',exact:true}).click();
    await expect(page.getByRole('heading',{name:'准备测试环境',exact:true})).toBeVisible();
    expect(calls).toBe(2);
    const state=await request('/state');expect(state.projects).toHaveLength(1);expect(state.projects[0].id).toBe(project.id);
    expect(state.projects[0].environmentConfirmed).toBe(false);expect(state.projects[0].preparation).toBeFalsy();expect(state.runs).toHaveLength(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{release();await page.unrouteAll({behavior:'wait'});await host.close();}
});

test('background state polling never overlaps an unfinished state request',async({page})=>{
  const {host}=await inspectionPage(page);
  let calls=0,release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
  try{
    await page.route('**/api/state',async route=>{calls++;await gate;await route.continue().catch(()=>{});});
    await expect.poll(()=>calls).toBe(1);
    await page.waitForTimeout(4800);
    expect(calls).toBe(1);
  }finally{release();await page.unrouteAll({behavior:'wait'});await host.close();}
});

test('a late background snapshot cannot replace the state read after project inspection',async({page})=>{
  const {host,request}=await inspectionPage(page);
  let held=false,calls=0,release=()=>{},releaseLater=()=>{};
  const gate=new Promise<void>(resolve=>release=resolve),later=new Promise<void>(resolve=>releaseLater=resolve);
  try{
    await page.clock.install();
    await page.route('**/api/state',async route=>{
      calls++;
      if(held){if(calls>2)await later;await route.continue().catch(()=>{});return;}
      const response=await route.fetch();expect((await response.json()).projects[0].sourceOnly).toBe(true);
      held=true;await gate;
      await route.fulfill({response,headers:{...response.headers(),'x-test-old-state':'true'}});
    });
    await expect.poll(()=>held).toBe(true);
    await page.clock.pauseAt(new Date(Date.now()+1000));
    await page.getByRole('button',{name:'检查并准备环境',exact:true}).click();
    await expect(page.getByRole('heading',{name:'准备测试环境',exact:true})).toBeVisible();
    const late=page.waitForResponse(response=>response.headers()['x-test-old-state']==='true');
    release();await (await late).finished();await page.clock.runFor(100);
    // The server's older source-only snapshot must never replace this runtime project.
    expect(await page.getByRole('heading',{name:'准备测试环境',exact:true}).isVisible()).toBe(true);
    const state=await request('/state');expect(state.projects[0].sourceOnly).toBe(false);expect(state.runs).toHaveLength(0);
  }finally{release();releaseLater();await page.unrouteAll({behavior:'wait'});await host.close();}
});

test('returning from the inspection form releases the wait without a late redirect',async({page})=>{
  const {host}=await inspectionPage(page);
  let saved=false,release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
  try{
    await page.route('**/api/projects',async route=>{const response=await route.fetch();saved=true;await gate;await route.fulfill({response}).catch(()=>{});});
    await page.getByRole('button',{name:'检查并准备环境',exact:true}).click();
    await expect.poll(()=>saved).toBe(true);
    await page.getByRole('button',{name:'返回准备步骤',exact:true}).click();
    await expect(page.getByRole('button',{name:'取消等待',exact:true})).toHaveCount(0,{timeout:2000});
    await expect(page.locator('.status-line')).toHaveText('');
    release();await page.waitForTimeout(200);
    await expect(page.getByRole('heading',{name:'准备测试环境',exact:true})).toBeHidden();
  }finally{release();await page.unrouteAll({behavior:'wait'});await host.close();}
});

test('leaving the preparation step cancels inspection without a late redirect',async({page})=>{
  const {host}=await inspectionPage(page);
  let saved=false,release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
  try{
    await page.route('**/api/projects',async route=>{const response=await route.fetch();saved=true;await gate;await route.fulfill({response}).catch(()=>{});});
    await page.getByRole('button',{name:'检查并准备环境',exact:true}).click();
    await expect.poll(()=>saved).toBe(true);
    await page.getByRole('button',{name:'返回：确认要检查的业务',exact:true}).click();
    await expect.poll(()=>new URL(page.url()).searchParams.get('step')).toBe('3');
    await expect(page.locator('.status-line')).toHaveText('');
    release();await page.waitForTimeout(200);
    expect(new URL(page.url()).searchParams.get('step')).toBe('3');
  }finally{release();await page.unrouteAll({behavior:'wait'});await host.close();}
});
