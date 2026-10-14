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
  try{await page.goto(host.url+'/?page=report');await expect(page.getByRole('heading',{name:'尚无验证结果',exact:true})).toBeVisible();await expect(page.locator('.workflow-journey li.done')).toHaveCount(0);}finally{await host.close();}
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
    await page.getByRole('combobox',{name:'选择流程',exact:true}).selectOption('edit');await page.getByLabel('只改标题，优先级和所有者不变',{exact:true}).check();await page.getByLabel('这就是我期望的网站行为',{exact:true}).check();
    await page.getByRole('button',{name:'为这条规则创建检查方案',exact:true}).click();
    const preparation=page.locator('#candidate-preparation');await expect(preparation).toBeFocused();await expect(page.getByRole('heading',{name:'创建方案前准备',exact:true})).toBeInViewport();
    expect(launches).toBe(0);const confirm=page.getByLabel('同意向该服务发送以上范围内经过过滤的内容',{exact:true});await expect(confirm).not.toBeChecked();await confirm.check();
    await mkdir('output/candidate-start-feedback/screenshots',{recursive:true});await page.screenshot({path:`output/candidate-start-feedback/screenshots/preparation-${width}.png`,fullPage:false});
    await page.getByRole('button',{name:'确认范围并创建方案',exact:true}).click();await expect.poll(()=>launches).toBe(1);
    await expect(page.getByRole('heading',{name:'检查方案验证与审核',exact:true})).toBeFocused();await expect(page.getByText('正在生成检查方案并自动验证，完成后将在这里展开审核材料。',{exact:true})).toBeInViewport();
    await page.screenshot({path:`output/candidate-start-feedback/screenshots/progress-${width}.png`,fullPage:false});
  }finally{await host.close();}
});

test('leaving project selection cancels its pending folder chooser',async({page})=>{
  const directory=join(process.cwd(),'.local-data/natural-workflow-tests',randomUUID());let started=false,aborted=false;
  const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0,pickDirectory:async(signal:AbortSignal)=>{started=true;return new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve(null);},{once:true}));}});
  try{await page.goto(host.url);await page.getByRole('button',{name:'选择文件夹',exact:true}).click();await expect.poll(()=>started).toBe(true);await page.getByRole('link',{name:'业务验证',exact:true}).click();await expect(page.getByRole('heading',{name:'先接入一个项目',exact:true})).toBeVisible();await expect.poll(()=>aborted).toBe(true);await expect(page.getByRole('alert')).toHaveCount(0);}finally{await host.close();}
});

test('folder selection can be cancelled on the same page and other actions resume',async({page})=>{
  const directory=join(process.cwd(),'.local-data/natural-workflow-tests',randomUUID());let started=false,aborted=false;
  const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0,pickDirectory:async(signal:AbortSignal)=>{started=true;return new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve(null);},{once:true}));}});
  try{
    await page.goto(host.url);await page.getByLabel('项目目录',{exact:true}).fill(join(process.cwd(),'samples/ticket'));
    await page.getByRole('button',{name:'选择文件夹',exact:true}).click();await expect.poll(()=>started).toBe(true);
    await page.getByRole('button',{name:'取消选择文件夹',exact:true}).click();await expect.poll(()=>aborted).toBe(true);
    await expect(page.getByRole('button',{name:'选择文件夹',exact:true})).toBeEnabled();await expect(page.getByLabel('项目目录',{exact:true})).toHaveValue(join(process.cwd(),'samples/ticket'));
    await page.getByRole('button',{name:'检查项目并继续',exact:true}).click();await expect(page.getByRole('heading',{name:'准备测试环境',exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
  }finally{await host.close();}
});

test('empty library, preparation history, settings return and draft restoration',async({page})=>{
  const directory=join(process.cwd(),'.local-data/natural-workflow-tests',randomUUID());
  let host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0,pickDirectory:async()=>join(process.cwd(),'samples/ticket')});
  try{
    await page.goto(host.url);
    await page.getByRole('button',{name:'选择文件夹',exact:true}).click();
    await expect(page.getByLabel('项目目录',{exact:true})).toHaveValue(join(process.cwd(),'samples/ticket'));
    await page.getByRole('button',{name:'检查项目并继续',exact:true}).click();
    await expect(page.getByText('还没有可用检查方案，可先选择要检查的行为，再创建方案。',{exact:true})).toBeVisible();
    await page.getByRole('checkbox',{name:'我同意在独立测试副本中创建用户并重置测试数据'}).check();
    await page.getByRole('button',{name:'确认并准备测试环境',exact:true}).click();
    await expect(page.getByRole('heading',{name:'你想检查什么？'})).toBeVisible();
    const projectId=new URL(page.url()).searchParams.get('project')!;
    await page.getByLabel('提交结果保存',{exact:true}).check();
    await page.getByText('这就是我期望的网站行为',{exact:true}).check();
    await expect(page.getByText('检查选择已保存',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'先设置模型连接',exact:true}).click();
    await expect(page.getByRole('button',{name:'返回检查方案',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'返回检查方案',exact:true}).click();
    await page.reload();await expect(page.getByLabel('提交结果保存',{exact:true})).toBeChecked();
    await expect(page.getByText('这就是我期望的网站行为',{exact:true}).locator('input')).toBeChecked();
    await page.getByRole('combobox',{name:'选择流程',exact:true}).selectOption('edit');
    await page.getByLabel('只改标题，优先级和所有者不变',{exact:true}).check();
    await expect(page.getByText('检查选择已保存',{exact:true})).toBeVisible();
    await page.getByRole('combobox',{name:'选择流程',exact:true}).selectOption('submit');await expect(page.getByLabel('提交结果保存',{exact:true})).toBeChecked();
    await page.getByRole('link',{name:'项目接入',exact:true}).click();
    await expect(page.getByText('最近一次环境检查通过，两个测试用户登录成功。',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'继续选择检查',exact:true})).toBeVisible();
    await page.reload();await expect(page.getByRole('button',{name:'继续选择检查',exact:true})).toBeVisible();
    await host.close();host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
    await page.goto(host.url+`/?page=verify&project=${projectId}`);await expect(page.getByLabel('提交结果保存',{exact:true})).toBeChecked();
    await mkdir('output/natural-workflow/screenshots',{recursive:true});
    for(const width of [1280,768,390]){await page.setViewportSize({width,height:1000});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`output/natural-workflow/screenshots/choices-${width}.png`,fullPage:true});}
    await page.setViewportSize({width:1280,height:1000});await page.evaluate(()=>{document.body.style.zoom='2';});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'output/natural-workflow/screenshots/choices-zoom.png',fullPage:true});await page.evaluate(()=>{document.body.style.zoom='';});
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
    await page.getByLabel('提交结果保存',{exact:true}).check();await page.getByText('这就是我期望的网站行为',{exact:true}).check();
    await page.getByRole('button',{name:'准备本轮检查',exact:true}).click();await page.getByRole('button',{name:'开始检查',exact:true}).dblclick();
    await expect(page.getByRole('button',{name:'查看检查结果',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'准备本轮检查',exact:true})).toHaveCount(0);
    state=await request('/state');expect(state.runs.length).toBe(1);
    await page.getByRole('button',{name:'查看检查结果',exact:true}).click();await expect(page.getByRole('heading',{name:'本轮所选检查通过',exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'业务结果',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'方案与验证依据',exact:true})).toBeFocused();
    await page.keyboard.press('ArrowLeft');await page.getByText('设置并开始负载检查',{exact:true}).click();
    await page.getByLabel('验证目标是否达标',{exact:true}).check();
    await page.getByLabel('每秒完整业务检查次数',{exact:true}).fill('1');await page.getByLabel('持续秒数（最多300）',{exact:true}).fill('2');
    await page.getByLabel('完成等待上限（毫秒）',{exact:true}).fill('1000');await page.getByLabel('允许错误百分比（0—100）',{exact:true}).fill('5');
    let target:any;await page.route('**/api/projects/*/load',async route=>{target=route.request().postDataJSON().target;await route.fulfill({json:{loadId:'synthetic-no-load'}});});
    await page.getByLabel('我已确认上述目标、比例、等待、错误口径和资源上限',{exact:true}).check();await page.getByRole('button',{name:'开始目标负载验证',exact:true}).click();
    await expect.poll(()=>target?.errorRate).toBe(.05);expect(target.latencyMs).toBe(1000);
    await mkdir('output/natural-workflow/screenshots',{recursive:true});await page.screenshot({path:'output/natural-workflow/screenshots/report-load.png',fullPage:true});
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
    await page.getByLabel('提交结果保存',{exact:true}).check();await expect.poll(()=>intercepted).toBe(true);
    await other.getByLabel('重复提交不重复创建',{exact:true}).check();await expect(other.getByText('检查选择已保存',{exact:true})).toBeVisible();release();
    await expect(page.getByRole('alert')).toContainText('另一页面已更新检查选择');await expect(page.getByLabel('提交结果保存',{exact:true})).toBeChecked();await expect(page.getByLabel('重复提交不重复创建',{exact:true})).not.toBeChecked();
    await page.unroute('**/api/projects/*/workflow');await page.getByRole('button',{name:'加载已保存的选择',exact:true}).click();
    await expect(page.getByLabel('重复提交不重复创建',{exact:true})).toBeChecked();await expect(page.getByLabel('提交结果保存',{exact:true})).not.toBeChecked();
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
    await page.goto(host.url+`/?page=verify&project=${projectId}`);await page.getByRole('textbox',{name:'适用条件',exact:true}).fill('Unsaved input retained');
    current={...original,id:'review-remote',ruleId:'title-update-rule',reference:{...original.reference,applicable:['Remote original']}};
    await expect(page.getByText('其他页面已更新当前方案；本页未保存的说明已保留。',{exact:true})).toBeVisible();
    await expect(page.getByRole('textbox',{name:'适用条件',exact:true})).toHaveValue('Unsaved input retained');
    await page.getByRole('button',{name:'保存本版审核材料',exact:true}).click();await expect.poll(()=>savedTask).toBe('review-original');
  }finally{await host.close();}
});
