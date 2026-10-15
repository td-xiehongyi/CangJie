import {goStep,visibleLabel} from './workflow-steps';
import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
// @ts-ignore compiled host
import {startWorkbench} from '../../apps/host/dist/api.js';
// @ts-ignore fixture
import {publishedFixture} from '../support/published.mjs';
// @ts-ignore compiled registry
import {TemplateRegistry} from '../../apps/host/dist/templates/store.js';

test('an empty report does not mark unperformed workflow steps complete',async({page})=>{
  const directory=join(process.cwd(),'.local-data/natural-workflow-tests',randomUUID()),host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  try{await page.goto(host.url+'/?page=report');await expect(page.getByRole('heading',{name:'尚无验证结果',exact:true})).toBeVisible();await expect(page.getByRole('navigation',{name:'完整业务验证流程'}).getByRole('button')).toHaveCount(9);await expect(page.getByRole('navigation',{name:'完整业务验证流程'})).not.toContainText('已完成');}finally{await host.close();}
});

for(const width of [1280,390])test(`candidate creation reveals sending confirmation and progress at ${width}px`,async({page})=>{
  const directory=join(process.cwd(),'.local-data/natural-workflow-tests',randomUUID()),host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  const request=async(path:string,body?:unknown)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});expect(r.ok).toBe(true);return r.json();};
  try{
    await request('/settings',{serviceUrl:'http://127.0.0.1:1',model:'sending-ui-fixture',key:'synthetic-key',remember:false});
    const {projectId}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'}),state=await request('/state');
    await request(`/projects/${projectId}/confirm`,{environment:true,environmentHash:state.projects[0].environmentHash});
    let launches=0,started=false;
    // UI-only dispatch/progress fixture; real candidate validation is covered separately.
    await page.route('**/api/projects/*/candidate',async route=>{launches++;expect(route.request().postDataJSON().confirmRule).toBe(true);started=true;await route.fulfill({json:{candidateId:'ui-start-fixture'}});});
    await page.route('**/api/state',async route=>{const response=await route.fetch(),value=await response.json();if(started)value.projects[0].candidate={id:'ui-start-fixture',ruleId:'title-update-rule',status:'validating',revisionIndex:0,budget:{calls:0,tokens:0}};await route.fulfill({json:value});});
    await page.setViewportSize({width,height:720});await page.goto(host.url+`/?page=verify&project=${projectId}`);
    await page.getByRole('combobox',{name:'要检查网站的哪种操作？',exact:true}).selectOption('edit');await page.getByLabel('只改标题，优先级和所有者不变',{exact:true}).selectOption('confirm');
    await goStep(page,6);await page.getByRole('button',{name:'调用模型创建检查方案',exact:true}).click();
    const preparation=page.locator('#candidate-preparation');await expect(preparation).toBeVisible();expect(new URL(page.url()).searchParams.get('step')).toBe('5');
    expect(launches).toBe(0);const confirm=page.getByLabel('同意向该服务发送以上范围内经过过滤的内容',{exact:true});await expect(confirm).not.toBeChecked();await confirm.check();
    await mkdir('output/plan-preparation-20261016/regression/automated/candidate/screenshots',{recursive:true});await page.screenshot({path:`output/plan-preparation-20261016/regression/automated/candidate/screenshots/preparation-${width}.png`,fullPage:false});
    await page.getByRole('button',{name:'确认范围并调用模型创建方案',exact:true}).click();await expect.poll(()=>launches).toBe(1);
    expect(new URL(page.url()).searchParams.get('step')).toBe('5');await goStep(page,7);await expect(page.getByText('正在准备方案，验证与试运行进度会在这里更新。',{exact:true})).toBeVisible();
    await page.screenshot({path:`output/plan-preparation-20261016/regression/automated/candidate/screenshots/progress-${width}.png`,fullPage:false});
    await goStep(page,3);await page.getByLabel('只改标题，优先级和所有者不变',{exact:true}).selectOption('off');await goStep(page,5);await expect(page.getByText('另有方案正在准备，不属于本轮选择；完成前暂不能启动新的方案。',{exact:true})).toBeVisible();expect(launches).toBe(1);
  }finally{await host.close();}
});

test('leaving project selection cancels its pending folder chooser',async({page})=>{
  const directory=join(process.cwd(),'.local-data/natural-workflow-tests',randomUUID());let started=false,aborted=false;
  const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0,pickDirectory:async(signal:AbortSignal)=>{started=true;return new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve(null);},{once:true}));}});
  try{await page.goto(host.url);await page.getByRole('button',{name:'选择文件夹',exact:true}).click();await expect.poll(()=>started).toBe(true);await goStep(page,3);await expect(page.getByRole('heading',{name:'先接入一个项目',exact:true})).toBeVisible();await expect.poll(()=>aborted).toBe(true);await expect(page.getByRole('alert')).toHaveCount(0);}finally{await host.close();}
});

test('folder selection can be cancelled on the same page and other actions resume',async({page})=>{
  const directory=join(process.cwd(),'.local-data/natural-workflow-tests',randomUUID());let started=false,aborted=false;
  const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0,pickDirectory:async(signal:AbortSignal)=>{started=true;return new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve(null);},{once:true}));}});
  try{
    await page.goto(host.url);await visibleLabel(page,'项目目录').fill(join(process.cwd(),'samples/ticket'));
    await page.getByRole('button',{name:'选择文件夹',exact:true}).click();await expect.poll(()=>started).toBe(true);
    await page.getByRole('button',{name:'取消选择文件夹',exact:true}).click();await expect.poll(()=>aborted).toBe(true);
    await expect(page.getByRole('button',{name:'选择文件夹',exact:true})).toBeEnabled();await expect(visibleLabel(page,'项目目录')).toHaveValue(join(process.cwd(),'samples/ticket'));
    await page.getByRole('button',{name:'导入源码',exact:true}).click();await expect.poll(()=>new URL(page.url()).searchParams.get('project')).toBeTruthy();await goStep(page,4);await page.getByRole('button',{name:'检查并准备环境',exact:true}).click();await expect(page.getByRole('heading',{name:'准备测试环境',exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
  }finally{await host.close();}
});

test('empty library, preparation history, settings return and draft restoration',async({page})=>{
  const directory=join(process.cwd(),'.local-data/natural-workflow-tests',randomUUID());
  let host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0,pickDirectory:async()=>join(process.cwd(),'samples/ticket')});
  try{
    await page.goto(host.url);
    await page.getByRole('button',{name:'选择文件夹',exact:true}).click();
    await expect(visibleLabel(page,'项目目录')).toHaveValue(join(process.cwd(),'samples/ticket'));
    await page.getByRole('button',{name:'导入源码',exact:true}).click();await expect.poll(()=>new URL(page.url()).searchParams.get('project')).toBeTruthy();await goStep(page,4);await page.getByRole('button',{name:'检查并准备环境',exact:true}).click();
    await expect(page.locator('.step-heading h1')).toHaveText('04 检查运行条件');
    await page.getByRole('checkbox',{name:'我同意在独立测试副本中创建用户并重置测试数据'}).check();
    await page.getByRole('button',{name:'执行环境检查',exact:true}).click();await expect(page.getByText('最近检查通过；本次执行前仍会重新核对凭据与环境。',{exact:true})).toBeVisible();await goStep(page,3);
    await expect(page.getByRole('heading',{name:'03 确认业务与测试目标'})).toBeVisible();
    const projectId=new URL(page.url()).searchParams.get('project')!;
    await page.getByLabel('提交结果保存',{exact:true}).selectOption('observe');
    await page.getByRole('combobox',{name:'提交结果保存',exact:true}).selectOption('confirm');
    await expect(page.getByText('检查选择已保存',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'模型设置',exact:true}).click();
    await expect(page.getByRole('button',{name:'返回03 确认业务与测试目标',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'返回03 确认业务与测试目标',exact:true}).click();
    await page.reload();await expect(page.getByLabel('提交结果保存',{exact:true})).not.toHaveValue('off');
    await expect(page.getByRole('combobox',{name:'提交结果保存',exact:true})).toHaveValue('confirm');
    await page.getByRole('combobox',{name:'要检查网站的哪种操作？',exact:true}).selectOption('edit');
    await page.getByLabel('只改标题，优先级和所有者不变',{exact:true}).selectOption('observe');
    await expect(page.getByText('检查选择已保存',{exact:true})).toBeVisible();
    await page.getByRole('combobox',{name:'要检查网站的哪种操作？',exact:true}).selectOption('submit');await expect(page.getByLabel('提交结果保存',{exact:true})).not.toHaveValue('off');
    await goStep(page,4);
    await expect(page.getByText('最近检查通过；本次执行前仍会重新核对凭据与环境。',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'继续：准备检查方案',exact:true})).toBeVisible();
    await page.reload();await expect(page.getByRole('button',{name:'继续：准备检查方案',exact:true})).toBeVisible();
    await host.close();host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
    await page.goto(host.url+`/?page=verify&project=${projectId}`);await expect(page.getByLabel('提交结果保存',{exact:true})).not.toHaveValue('off');
    await mkdir('output/plan-preparation-20261016/regression/automated/natural/screenshots',{recursive:true});
    for(const width of [1280,768,390]){await page.setViewportSize({width,height:1000});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`output/plan-preparation-20261016/regression/automated/natural/screenshots/choices-${width}.png`,fullPage:true});}
    await page.setViewportSize({width:1280,height:1000});await page.evaluate(()=>{document.body.style.zoom='2';});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'output/plan-preparation-20261016/regression/automated/natural/screenshots/choices-zoom.png',fullPage:true});await page.evaluate(()=>{document.body.style.zoom='';});
  }finally{await host.close();}
});

test('completion points to report, report tabs use keyboard and load percentages preserve API units',async({page})=>{
  const directory=join(process.cwd(),'.local-data/natural-workflow-tests',randomUUID()),registryDirectory=join(directory,'registry');
  await publishedFixture(directory,new TemplateRegistry(registryDirectory),'packages/contracts/fixtures/save-result.json','save-rule');
  const host=await startWorkbench({directory,registryDirectory,port:0});
  try{
    const request=async(path:string,body?:unknown)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});expect(r.ok).toBe(true);return r.json();};
    const {projectId}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'});
    let state=await request('/state');await request(`/projects/${projectId}/confirm`,{environment:true,environmentHash:state.projects[0].environmentHash});
    await page.goto(host.url+`/?page=verify&project=${projectId}`);
    await page.getByLabel('提交结果保存',{exact:true}).selectOption('observe');await page.getByRole('combobox',{name:'提交结果保存',exact:true}).selectOption('confirm');
    await goStep(page,10);await page.getByRole('button',{name:'准备本轮检查',exact:true}).click();await page.getByRole('button',{name:'执行检查',exact:true}).dblclick();
    await expect(page.getByRole('button',{name:'查看检查结果',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'准备本轮检查',exact:true})).toHaveCount(0);
    state=await request('/state');expect(state.runs.length).toBe(1);
    await page.getByRole('button',{name:'查看检查结果',exact:true}).click();await expect(page.getByRole('heading',{name:'本轮所选检查通过',exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'业务结果',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'方案与验证依据',exact:true})).toBeFocused();
    await page.keyboard.press('ArrowLeft');await goStep(page,3);await page.getByLabel('测试目标',{exact:true}).selectOption('both');await page.getByRole('button',{name:'保存测试目标',exact:true}).click();await expect(page.getByText('当前目标已保存；没有启动任何检查。',{exact:true})).toBeVisible();await goStep(page,10);await expect(page.getByRole('heading',{name:'核对目标与限制',exact:true})).toBeVisible();
    await page.getByLabel('验证目标是否达标',{exact:true}).check();
    await page.getByLabel('每秒完整业务检查次数',{exact:true}).fill('1');await page.getByLabel('持续秒数（最多300）',{exact:true}).fill('2');
    await page.getByLabel('完成等待上限（毫秒）',{exact:true}).fill('1000');await page.getByLabel('允许错误百分比（0—100）',{exact:true}).fill('5');
    let target:any;await page.route('**/api/projects/*/load',async route=>{target=route.request().postDataJSON().target;await route.fulfill({json:{loadId:'synthetic-no-load'}});});
    await page.getByLabel('我已确认上述目标、比例、等待、错误口径和资源上限',{exact:true}).check();await page.getByRole('button',{name:'执行目标负载检查',exact:true}).click();
    await expect.poll(()=>target?.errorRate).toBe(.05);expect(target.latencyMs).toBe(1000);
    await mkdir('output/plan-preparation-20261016/regression/automated/natural/screenshots',{recursive:true});await page.screenshot({path:'output/plan-preparation-20261016/regression/automated/natural/screenshots/report-load.png',fullPage:true});
  }finally{await host.close();}
});

test('competing tabs preserve local input and require an explicit conflict resolution',async({page,context})=>{
  const directory=join(process.cwd(),'.local-data/natural-workflow-tests',randomUUID()),host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  const other=await context.newPage();
  try{
    const response=await fetch(host.url+'/api/projects',{method:'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:JSON.stringify({directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'})});const {projectId}=await response.json(),url=host.url+`/?page=verify&project=${projectId}`;
    await page.goto(url);await other.goto(url);
    let release!:()=>void;const blocked=new Promise<void>(r=>release=r);let intercepted=false;
    await page.route('**/api/projects/*/workflow',async route=>{intercepted=true;await blocked;await route.continue();});
    await page.getByLabel('提交结果保存',{exact:true}).selectOption('observe');await expect.poll(()=>intercepted).toBe(true);
    await other.getByLabel('重复提交不重复创建',{exact:true}).selectOption('observe');await expect(other.getByText('检查选择已保存',{exact:true})).toBeVisible();release();
    await expect(page.getByRole('alert')).toContainText('另一页面已更新检查选择');await expect(page.getByLabel('提交结果保存',{exact:true})).not.toHaveValue('off');await expect(page.getByLabel('重复提交不重复创建',{exact:true})).toHaveValue('off');
    await page.unroute('**/api/projects/*/workflow');await page.getByRole('button',{name:'加载已保存的选择',exact:true}).click();
    await expect(page.getByLabel('重复提交不重复创建',{exact:true})).not.toHaveValue('off');await expect(page.getByLabel('提交结果保存',{exact:true})).toHaveValue('off');
    await expect(page.getByRole('alert')).toHaveCount(0);
  }finally{await other.close();await host.close();}
});

test('polling another candidate preserves an unsaved reviewer and saves to its original task',async({page})=>{
  const directory=join(process.cwd(),'.local-data/natural-workflow-tests',randomUUID()),host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  try{
    const r=await fetch(host.url+'/api/projects',{method:'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:JSON.stringify({directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'})}),{projectId}=await r.json();
    const raw=await (await fetch(host.url+'/api/state',{headers:{authorization:`Bearer ${host.token}`}})).json();
    const original={id:'review-original',ruleId:'save-rule',candidateHash:'a'.repeat(64),status:'ready_for_review',revisionIndex:0,reference:{applicable:['Original'],excluded:['Other'],instructions:'Original steps'}};
    let current:any=original,savedTask='';
    await page.route('**/api/state',route=>route.fulfill({json:{...raw,projects:[{...raw.projects[0],candidate:current}]}}));
    await page.route('**/api/projects/*/review',route=>{savedTask=route.request().postDataJSON().candidateId;return route.fulfill({json:{draftHash:'b'.repeat(64)}});});
    await page.goto(host.url+`/?page=verify&step=9&project=${projectId}`);await page.getByRole('textbox',{name:'适用条件',exact:true}).fill('Unsaved input retained');
    current={...original,id:'review-remote',ruleId:'title-update-rule',reference:{...original.reference,applicable:['Remote original']}};
    await expect(page.getByText('其他页面已更新当前方案；本页未保存的说明已保留。',{exact:true})).toBeVisible();
    await expect(page.getByRole('textbox',{name:'适用条件',exact:true})).toHaveValue('Unsaved input retained');
    await page.getByRole('button',{name:'保存本版审核材料',exact:true}).click();await expect.poll(()=>savedTask).toBe('review-original');
  }finally{await host.close();}
});
