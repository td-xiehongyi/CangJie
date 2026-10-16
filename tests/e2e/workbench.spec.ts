import {goStep,visibleLabel} from './workflow-steps';
import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {mkdir,writeFile,readFile,cp} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
// Compiled production host and real browser; only model generation uses a fixture.
// @ts-ignore JS fixture helper
import {publishedFixture} from '../support/published.mjs';
// @ts-ignore compiled host
import {startWorkbench} from '../../apps/host/dist/api.js';
// @ts-ignore compiled host
import {TemplateRegistry} from '../../apps/host/dist/templates/store.js';
test.describe.configure({mode:'serial'});
async function captureStates(page:any,name:string){for(const width of [1280,768,390]){await page.setViewportSize({width,height:900});await page.evaluate(()=>scrollTo(0,0));await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`output/plan-preparation-20261016/regression/automated/workbench/screenshots/${name}-${width}.png`,fullPage:true});}await page.setViewportSize({width:1280,height:900});}

let host:any,projectId='',runId='';
const directory=join(process.cwd(),'.local-data/workbench-e2e',randomUUID());
test.beforeAll(async()=>{const registryDirectory=join(directory,'registry');await publishedFixture(directory,new TemplateRegistry(registryDirectory),'packages/contracts/fixtures/save-result.json','save-rule');host=await startWorkbench({directory,registryDirectory,port:0});await mkdir('output/plan-preparation-20261016/regression/automated/workbench/screenshots',{recursive:true});});
test.afterAll(async()=>{await host?.close();});
test('empty report does not invent runs; four pages respond at 1280, 768, 390',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1280,768,390]){await page.setViewportSize({width,height:900});for(const section of ['project','verify','report','settings']){await page.goto(host.url+`/?page=${section}&state=published`);await expect(page.getByRole('heading',{name:section==='project'?'01 导入项目':section==='verify'?'业务验证':section==='report'?'验证报告':'模型设置',exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`output/plan-preparation-20261016/regression/automated/workbench/screenshots/${section}-${width}.png`,fullPage:true});}}
  await page.goto(host.url+'/?page=report');await expect(page.getByRole('heading',{name:'尚无验证结果'})).toBeVisible();await expect(page.getByText('还没有运行记录。')).toBeVisible();
  await page.goto(host.url+'/?page=settings');await expect(page.getByLabel('模型名称',{exact:true})).toHaveValue('');await expect(page.getByLabel('API Key',{exact:true})).toHaveAttribute('type','password');
  await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'跳转到主要内容'})).toBeFocused();expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});expect(errors).toEqual([]);
});
test('project form and session passwords survive scope edits; actual run and package replay',async({page})=>{
  page.on('pageerror',e=>console.error('BROWSER_ERROR',e.message));await page.goto(host.url+'/?page=project&step=4');await visibleLabel(page,'项目目录').fill(join(process.cwd(),'samples/ticket'));
  await page.getByRole('radio',{name:'手动指定测试账号',exact:true}).check();
  for(const [name,username,id,password]of [['用户甲','alpha','user-a','synthetic-e2e-owner'],['用户乙','beta','user-b','synthetic-e2e-other']]){await page.getByLabel(name+'账号',{exact:true}).fill(username);await page.getByLabel(name+'身份 ID',{exact:true}).fill(id);await page.getByLabel(name+'测试密码',{exact:true}).fill(password);}
  await page.getByRole('button',{name:'检查并准备环境',exact:true}).click();await expect(page.getByText('我同意在独立测试副本中创建用户并重置测试数据')).toBeVisible();projectId=new URL(page.url()).searchParams.get('project')!;
  await page.getByRole('button',{name:'修改项目信息'}).click();await page.getByText('高级配置：接口映射与候选生成材料',{exact:true}).click();
  const mappingDraft=(await page.getByRole('textbox',{name:'映射定义',exact:true}).inputValue())+'\n';await page.getByRole('textbox',{name:'映射定义',exact:true}).fill(mappingDraft);await page.getByLabel('用户甲测试密码',{exact:true}).fill('still-in-browser-memory');await page.getByRole('textbox',{name:'候选生成材料（非02业务分析范围）',exact:true}).fill('verification.json\npackage.json');await page.getByRole('button',{name:'更新发送范围',exact:true}).click();await expect(page.getByRole('textbox',{name:'映射定义',exact:true})).toHaveValue(mappingDraft);await expect(page.getByLabel('用户甲测试密码',{exact:true})).toHaveValue('still-in-browser-memory');
  await page.getByRole('button',{name:'返回准备步骤'}).click();await page.getByText('我同意在独立测试副本中创建用户并重置测试数据').check();await page.getByRole('button',{name:'执行环境检查',exact:true}).click();await expect(page.getByText('最近检查通过；本次执行前仍会重新核对凭据与环境。',{exact:true})).toBeVisible();await goStep(page,3);await expect(page.getByRole('heading',{name:'03 确认要检查的业务'})).toBeVisible();
  await page.getByLabel('提交结果保存',{exact:true}).selectOption('observe');await page.getByRole('combobox',{name:'提交结果保存',exact:true}).selectOption('confirm');await goStep(page,10);await page.getByRole('button',{name:'准备本轮检查',exact:true}).click();await page.getByRole('button',{name:'执行检查',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('run')).toBeTruthy();runId=new URL(page.url()).searchParams.get('run')!;
  await page.getByRole('button',{name:'查看检查结果',exact:true}).click();await expect(page.getByText('已验证符合本条规则的预期。')).toBeVisible();
  await page.getByRole('tab',{name:'方案与验证依据'}).click();await page.getByRole('tab',{name:'业务结果',exact:true}).click();expect(new URL(page.url()).searchParams.get('run')).toBe(runId);await page.reload();await expect(page.getByText('已验证符合本条规则的预期。')).toBeVisible();
  const downloadPromise=page.waitForEvent('download');await expect(page.getByRole('heading',{name:'导出与保存',exact:true})).toBeVisible();await page.getByText('更多导出格式与备份',{exact:true}).click();await page.getByRole('button',{name:'导出验证包',exact:true}).click();const download=await downloadPromise;const path=join(directory,'exported.json');await download.saveAs(path);const raw=await readFile(path,'utf8'),pkg=JSON.parse(raw);expect(pkg.sourceRunId).toBe(runId);expect(raw).not.toContain('synthetic-e2e-owner');expect(raw).not.toContain('synthetic-e2e-other');
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'output/plan-preparation-20261016/regression/automated/workbench/screenshots/report-actual-pass.png',fullPage:true});
  await page.getByRole('button',{name:'进入12 修复与复测（可选）',exact:true}).click();await page.getByRole('button',{name:'执行复测',exact:true}).click();await expect.poll(()=>new URL(page.url()).searchParams.get('run')).not.toBe(runId);await expect(page.getByText('已验证符合本条规则的预期。')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(path);await expect(page.getByText('复跑准备',{exact:true})).toBeVisible();await captureStates(page,'package-preparation');await page.getByRole('button',{name:'执行复测',exact:true}).click();await expect(page.getByText('已验证符合本条规则的预期。')).toBeVisible();
});
test('scope and backend errors cannot become success by waiting',async({page})=>{
  await page.goto(host.url+`/?page=project&project=${projectId}`);await page.getByRole('button',{name:'核对条件并继续分析',exact:true}).count();
  await page.getByRole('button',{name:'模型设置',exact:true}).click();await page.getByLabel('模型名称',{exact:true}).fill('');await page.getByRole('button',{name:'保存并调用模型检查连接',exact:true}).click();await expect(page.getByRole('alert')).toContainText('请先在模型设置中填写模型名称和密钥。');await expect(page.getByRole('alert')).toBeVisible();
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'output/plan-preparation-20261016/regression/automated/workbench/screenshots/settings-failure.png',fullPage:true});
  await goStep(page,11);await page.getByRole('tab',{name:'方案与验证依据'}).click();await expect(page.getByRole('button',{name:'审核通过，保存为可复用方案',exact:true})).toHaveCount(0);
});

test('candidate review is explicit and a disabled version cannot silently fall back',async({page})=>{
  const spec=JSON.parse(await readFile('packages/contracts/fixtures/save-result.json','utf8'));
  const provider=createServer(async(req,res)=>{for await(const chunk of req){}res.writeHead(200,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(spec)}}],usage:{total_tokens:20}}));});await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
  try{
    await page.goto(host.url+`/?page=settings&project=${projectId}&run=${runId}`);await page.getByLabel('接口地址',{exact:true}).fill(`http://127.0.0.1:${(provider.address() as any).port}`);await page.getByLabel('模型名称',{exact:true}).fill('synthetic-review-model');await page.getByLabel('API Key',{exact:true}).fill('synthetic-review-key');await page.getByRole('button',{name:'保存并调用模型检查连接',exact:true}).click();
    await goStep(page,2);await page.getByRole('button',{name:'检查材料',exact:true}).click();await page.getByRole('button',{name:'同意发送并开始分析',exact:true}).click();await expect(page.getByText('分析未完成',{exact:true})).toBeVisible();
    await goStep(page,10);await page.getByRole('button',{name:'选择其他检查或重新运行',exact:true}).click();await goStep(page,3);await page.getByLabel('提交结果保存',{exact:true}).selectOption('observe');await page.getByRole('combobox',{name:'提交结果保存',exact:true}).selectOption('confirm');await goStep(page,6);await page.getByText('检查方案与版本',{exact:true}).first().click();await page.getByRole('button',{name:'调用模型重新生成方案',exact:true}).click();await expect(page.getByRole('heading',{name:'创建方案前准备',exact:true})).toBeVisible();await page.getByLabel('同意向该服务发送以上范围内经过过滤的内容',{exact:true}).check();await page.getByRole('button',{name:'确认范围并调用模型创建方案',exact:true}).click();expect(new URL(page.url()).searchParams.get('step')).toBe('5');await expect(page.getByRole('button',{name:'审核新生成的方案',exact:true})).toBeVisible({timeout:40000});await page.getByRole('button',{name:'审核新生成的方案',exact:true}).click();await expect(page.getByText('等待双重审核',{exact:true})).toBeVisible({timeout:40000});
    await expect(page.getByRole('region',{name:'检查方案验证与审核',exact:true})).toBeVisible();await page.getByText('方案版本（通常无需修改）',{exact:true}).click();await page.getByLabel('固定版本',{exact:true}).fill('1.1.0');await page.getByRole('textbox',{name:'适用条件',exact:true}).fill('隔离测试副本的提交保存');await page.getByRole('textbox',{name:'排除条件',exact:true}).fill('其他业务语义');await page.getByRole('textbox',{name:'使用说明',exact:true}).fill('重新确认映射和合成数据');await page.getByRole('button',{name:'保存本版审核材料',exact:true}).click();await expect(page.getByRole('button',{name:'审核通过，保存为可复用方案',exact:true})).toBeDisabled();
    await page.getByLabel('业务确认人',{exact:true}).fill('fixture-business');await page.getByLabel('开发者技术审核人',{exact:true}).fill('fixture-developer');await page.getByText('确认规则及本版适用条件',{exact:true}).check();await page.getByText('已审查定义、正反例、端到端证据及限制',{exact:true}).check();await captureStates(page,'candidate-review');await page.getByRole('button',{name:'审核通过，保存为可复用方案',exact:true}).click();
    await page.goto(host.url+`/?page=report&project=${projectId}&run=${runId}`);await page.getByRole('tab',{name:'方案与验证依据',exact:true}).click();await page.getByText('方案维护：停用版本',{exact:true}).click();await page.getByLabel('停用原因',{exact:true}).fill('fixture withdrawn');await page.getByRole('button',{name:'停用 save-result 1.0.0',exact:true}).click();await goStep(page,10);await page.getByRole('button',{name:'选择其他检查或重新运行',exact:true}).click();await goStep(page,3);await goStep(page,10);await expect(page.getByRole('button',{name:'准备本轮检查',exact:true})).toBeDisabled();await goStep(page,6);
    if(!await page.getByRole('combobox',{name:'检查方案版本',exact:true}).isVisible()){await page.getByText('检查方案与版本',{exact:true}).first().click();}
    await page.getByRole('combobox',{name:'检查方案版本',exact:true}).selectOption({label:'save-result @ 1.1.0'});await goStep(page,3);await expect(page.getByRole('combobox',{name:'提交结果保存',exact:true})).toHaveValue('observe');await captureStates(page,'disabled-version');
  }finally{await new Promise<void>(r=>provider.close(()=>r()));}
});

test('failure and unknown reports come from real website observations and block load',async({page})=>{
  const request=async(path:string,body?:unknown)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();expect(r.ok,JSON.stringify(data)).toBe(true);return data;};
  let state=await request('/state'),p=state.projects.find((p:any)=>p.id===projectId);const mapping=structuredClone(p.mapping),source=join(directory,'broken-source');await cp('samples/ticket',source,{recursive:true});const file=join(source,'src/server.ts');await writeFile(file,(await readFile(file,'utf8')).replace("String(req.body.title??'无标题')","'wrong-saved-title'"));
  let sourceRun='';for(const mode of ['fail','inconclusive']){
    if(mode==='inconclusive')mapping.resultBindings.query.title=['items','0','missing-title'];
    await request('/projects',{id:projectId,directory:source,mapping});state=await request('/state');p=state.projects.find((p:any)=>p.id===projectId);await request(`/projects/${projectId}/confirm`,{environment:true,environmentHash:p.environmentHash});
    const ref=state.catalog.matches.find((m:any)=>m.ref.id==='save-result').ref;
    const launched=mode==='inconclusive'?await request(`/projects/${projectId}/replay`,{runId:sourceRun,reconfirmedChanges:true}):await request(`/projects/${projectId}/run`,{flow:{id:'submit',title:'提交记录'},checks:[{ruleId:'save-rule',confirmed:true,templateRef:ref}]});if(mode==='fail')sourceRun=launched.runId;await page.goto(host.url+`/?page=report&project=${projectId}&run=${launched.runId}`);
    await expect(page.getByRole('heading',{name:mode==='fail'?'发现 1 项业务问题':'1 项缺少验证条件',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'执行目标负载检查',exact:true})).toHaveCount(0);const goal=await request('/projects/'+projectId+'/journey');await request('/projects/'+projectId+'/journey',{...goal,goal:'both'});await goStep(page,10);await expect(page.getByText('本轮存在失败、未知、待定项或未完成，不能开始目标负载验证。')).toBeVisible();await goStep(page,11);
    if(mode==='inconclusive'){const record=await request(`/runs/${launched.runId}`);expect(record.parentRunId).toBe(sourceRun);const old=await request(`/runs/${sourceRun}`);expect(record.plan.checks).toEqual(old.plan.checks);expect(record.plan.mapping).not.toEqual(old.plan.mapping);}
    for(const width of [1280,768,390]){await page.setViewportSize({width,height:900});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`output/plan-preparation-20261016/regression/automated/workbench/screenshots/report-${mode}-${width}.png`,fullPage:true});}
  }
});


test('automatic accounts complete preparation without typing credentials',async({page})=>{
  await page.goto(host.url+'/?page=project&step=4');
  // Keep this scenario independent of the earlier synthetic model service.
  await page.getByRole('button',{name:'模型设置',exact:true}).click();
  // Create a separate empty-config host so no model call can occur.
  const automatic=await startWorkbench({directory:join(directory,'automatic'),registryDirectory:join(directory,'registry'),port:0});
  try{
    await page.goto(automatic.url+'/?page=project&step=4');
    await expect(page.getByRole('radio',{name:'自动生成两个测试用户（推荐）'})).toBeChecked();
    await expect(page.getByLabel('用户甲测试密码',{exact:true})).toHaveCount(0);
    await visibleLabel(page,'项目目录').fill(join(process.cwd(),'samples/registration'));

    await page.getByRole('button',{name:'检查并准备环境'}).click();
    await expect(page.getByText('测试账号信息已自动生成；下一步会创建测试数据，并验证两个用户能否登录。')).toBeVisible();
    await captureStates(page,'automatic-preparation');
    await page.getByRole('checkbox',{name:'我同意在独立测试副本中创建用户并重置测试数据'}).check();
    await page.getByRole('button',{name:'执行环境检查'}).click();await expect(page.getByText('最近检查通过；本次执行前仍会重新核对凭据与环境。',{exact:true})).toBeVisible();await goStep(page,3);
    await expect(page.getByRole('heading',{name:'03 确认要检查的业务'})).toBeVisible();
    await page.getByLabel('提交结果保存',{exact:true}).selectOption('observe');
    await goStep(page,3);await page.getByRole('combobox',{name:'提交结果保存',exact:true}).selectOption('confirm');
    await goStep(page,10);await page.getByRole('button',{name:'准备本轮检查'}).click();
    await page.getByRole('button',{name:'执行检查',exact:true}).click();
    await expect.poll(()=>new URL(page.url()).searchParams.get('run')).toBeTruthy();
    await page.getByRole('button',{name:'查看检查结果'}).click();
    await expect(page.getByText('已验证符合本条规则的预期。')).toBeVisible();
    await captureStates(page,'automatic-report');
  }finally{await automatic.close();}
});


test('first published template becomes usable without reselecting the rule',async({page})=>{
  const spec=JSON.parse(await readFile('packages/contracts/fixtures/save-result.json','utf8'));
  const provider=createServer(async(req,res)=>{for await(const chunk of req){}res.writeHead(200,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(spec)}}],usage:{total_tokens:20}}));});
  await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
  const isolated=await startWorkbench({directory:join(directory,'first-template'),registryDirectory:join(directory,'empty-registry'),port:0});
  const request=async(path:string,body?:unknown)=>{const r=await fetch(isolated.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${isolated.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await r.json();expect(r.ok,JSON.stringify(result)).toBe(true);return result;};
  try{
    await request('/settings',{serviceUrl:`http://127.0.0.1:${(provider.address() as any).port}`,model:'fixture-first',key:'fixture-first-key',remember:false});
    const {projectId:id}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'});
    const p=(await request('/state')).projects[0],disclosure=await request(`/projects/${id}/disclosure`);
    await request(`/projects/${id}/confirm`,{environment:true,environmentHash:p.environmentHash,send:true,scopeHash:disclosure.scopeHash});
    await page.goto(isolated.url+`/?page=verify&project=${id}`);
    await page.getByLabel('提交结果保存',{exact:true}).selectOption('observe');await goStep(page,3);await page.getByRole('combobox',{name:'提交结果保存',exact:true}).selectOption('confirm');
    await goStep(page,10);await expect(page.getByRole('button',{name:'准备本轮检查'})).toBeDisabled();
    await goStep(page,6);await page.getByRole('button',{name:'调用模型创建检查方案',exact:true}).first().click();await goStep(page,9);
    await expect(page.getByText('等待双重审核',{exact:true})).toBeVisible({timeout:40000});
    await expect(page.getByRole('region',{name:'检查方案验证与审核',exact:true})).toBeVisible();
    await page.getByLabel('适用条件',{exact:true}).fill('隔离测试副本');await page.getByLabel('排除条件',{exact:true}).fill('其他业务');await page.getByLabel('使用说明',{exact:true}).fill('确认规则后运行');
    await page.getByRole('button',{name:'保存本版审核材料'}).click();
    await page.getByLabel('业务确认人',{exact:true}).fill('fixture-business');await page.getByLabel('开发者技术审核人',{exact:true}).fill('fixture-developer');
    await page.getByText('确认规则及本版适用条件',{exact:true}).check();await page.getByText('已审查定义、正反例、端到端证据及限制',{exact:true}).check();
    await page.getByRole('button',{name:'审核通过，保存为可复用方案',exact:true}).click();
    await expect(page.getByRole('region',{name:'检查方案验证与审核',exact:true}).getByText('已发布固定版本 1.0.0',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'审核通过，保存为可复用方案',exact:true})).toHaveCount(0);
    await goStep(page,3);await page.getByRole('combobox',{name:'提交结果保存',exact:true}).selectOption('confirm');
    await goStep(page,10);await page.getByRole('button',{name:'准备本轮检查',exact:true}).click();
    await expect(page.getByRole('button',{name:'准备本轮检查'})).toBeEnabled();
    await goStep(page,3);
    await expect(page.getByRole('combobox',{name:'提交结果保存',exact:true})).toHaveValue('confirm');
    await goStep(page,10);
    await page.getByRole('button',{name:'执行检查',exact:true}).click();
    await expect.poll(()=>new URL(page.url()).searchParams.get('run')).toBeTruthy();
    await page.getByRole('button',{name:'查看检查结果'}).click();await expect(page.getByText('已验证符合本条规则的预期。')).toBeVisible();
    // A configured model is optional when preparing an existing project.
    await goStep(page,4);await expect(page.getByRole('radio',{name:'让 AI 分析网站并推荐检查内容'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'刷新 AI 读取范围'})).not.toBeVisible();
    await page.getByRole('button',{name:'继续：准备检查方案'}).click();await expect(page.locator('.step-heading h1')).toHaveText('05 选择或生成检查方案');await goStep(page,3);await expect(page.getByRole('heading',{name:'03 确认要检查的业务'})).toBeVisible();
    await goStep(page,11);await page.getByRole('tab',{name:'方案与验证依据'}).click();
    await page.reload();await page.getByRole('tab',{name:'方案与验证依据'}).click();
    await expect(page.getByRole('region',{name:'检查方案验证与审核',exact:true}).getByText('已发布固定版本 1.0.0',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'审核通过，保存为可复用方案',exact:true})).toHaveCount(0);
  }finally{await isolated.close();await new Promise<void>(r=>provider.close(()=>r()));}
});
