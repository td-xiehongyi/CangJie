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
async function captureStates(page:any,name:string){for(const width of [1280,768,390]){await page.setViewportSize({width,height:900});await page.evaluate(()=>scrollTo(0,0));await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`output/t6-workbench/screenshots/${name}-${width}.png`,fullPage:true});}await page.setViewportSize({width:1280,height:900});}

let host:any,projectId='',runId='';
const directory=join(process.cwd(),'.local-data/workbench-e2e',randomUUID());
test.beforeAll(async()=>{const registryDirectory=join(directory,'registry');await publishedFixture(directory,new TemplateRegistry(registryDirectory),'packages/contracts/fixtures/save-result.json','save-rule');host=await startWorkbench({directory,registryDirectory,port:0});await mkdir('output/t6-workbench/screenshots',{recursive:true});});
test.afterAll(async()=>{await host?.close();});
test('empty report does not invent runs; four pages respond at 1280, 768, 390',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1280,768,390]){await page.setViewportSize({width,height:900});for(const section of ['project','verify','report','settings']){await page.goto(host.url+`/?page=${section}&state=published`);await expect(page.getByRole('heading',{name:section==='project'?'项目接入':section==='verify'?'业务验证':section==='report'?'验证报告':'模型设置',exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`output/t6-workbench/screenshots/${section}-${width}.png`,fullPage:true});}}
  await page.goto(host.url+'/?page=report');await expect(page.getByRole('heading',{name:'尚无验证结果'})).toBeVisible();await expect(page.getByText('还没有运行记录。')).toBeVisible();
  await page.goto(host.url+'/?page=settings');await expect(page.getByLabel('模型名称',{exact:true})).toHaveValue('');await expect(page.getByLabel('API Key',{exact:true})).toHaveAttribute('type','password');
  await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'跳转到主要内容'})).toBeFocused();expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});expect(errors).toEqual([]);
});
test('project form and session passwords survive scope edits; actual run and package replay',async({page})=>{
  page.on('pageerror',e=>console.error('BROWSER_ERROR',e.message));await page.goto(host.url+'/?page=project');await page.getByLabel('项目目录',{exact:true}).fill(join(process.cwd(),'samples/ticket'));await page.getByRole('textbox',{name:'网站用途',exact:true}).fill('验证提交结果保存');
  for(const [name,username,id,password]of [['用户甲','alpha','user-a','synthetic-e2e-owner'],['用户乙','beta','user-b','synthetic-e2e-other']]){await page.getByLabel(name+'账号',{exact:true}).fill(username);await page.getByLabel(name+'身份 ID',{exact:true}).fill(id);await page.getByLabel(name+'测试密码',{exact:true}).fill(password);}
  await page.getByRole('button',{name:'检查项目并准备分析',exact:true}).click();await expect(page.getByText('确认项目、账号、映射及合成数据复位条件')).toBeVisible();projectId=new URL(page.url()).searchParams.get('project')!;
  await page.getByRole('textbox',{name:'网站用途',exact:true}).fill('仍在编辑的用途');await page.getByLabel('用户甲测试密码',{exact:true}).fill('still-in-browser-memory');await page.getByRole('textbox',{name:'发送文件',exact:true}).fill('verification.json\npackage.json');await page.getByRole('button',{name:'更新发送范围',exact:true}).click();await expect(page.getByRole('textbox',{name:'网站用途',exact:true})).toHaveValue('仍在编辑的用途');await expect(page.getByLabel('用户甲测试密码',{exact:true})).toHaveValue('still-in-browser-memory');
  await page.getByText('确认项目、账号、映射及合成数据复位条件').check();await page.getByRole('button',{name:'确认并继续',exact:true}).click();await page.getByRole('link',{name:'业务验证',exact:true}).click();
  await page.getByLabel('提交结果保存',{exact:true}).check();await page.getByText('我确认这条业务规则及适用条件').first().check();await page.getByRole('button',{name:'准备本轮检查',exact:true}).click();await page.getByRole('button',{name:'确认并继续',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('run')).toBeTruthy();runId=new URL(page.url()).searchParams.get('run')!;
  await page.getByRole('button',{name:'查看本轮报告',exact:true}).click();await expect(page.getByText('通过 · saved-title · ASSERTION_TRUE')).toBeVisible();
  await page.getByRole('tab',{name:'候选资格与审核'}).click();await page.getByRole('tab',{name:'业务结果',exact:true}).click();expect(new URL(page.url()).searchParams.get('run')).toBe(runId);await page.reload();await expect(page.getByText('通过 · saved-title · ASSERTION_TRUE')).toBeVisible();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出验证包',exact:true}).click();const download=await downloadPromise;const path=join(directory,'exported.json');await download.saveAs(path);const raw=await readFile(path,'utf8'),pkg=JSON.parse(raw);expect(pkg.sourceRunId).toBe(runId);expect(raw).not.toContain('synthetic-e2e-owner');expect(raw).not.toContain('synthetic-e2e-other');
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'output/t6-workbench/screenshots/report-actual-pass.png',fullPage:true});
  await page.getByRole('button',{name:'准备复测',exact:true}).click();await page.getByRole('button',{name:'确认并继续',exact:true}).click();await expect.poll(()=>new URL(page.url()).searchParams.get('run')).not.toBe(runId);await expect(page.getByText('通过 · saved-title · ASSERTION_TRUE')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(path);await expect(page.getByText('复跑准备',{exact:true})).toBeVisible();await captureStates(page,'package-preparation');await page.getByRole('button',{name:'确认并继续',exact:true}).click();await expect(page.getByText('通过 · saved-title · ASSERTION_TRUE')).toBeVisible();
});
test('scope and backend errors cannot become success by waiting',async({page})=>{
  await page.goto(host.url+`/?page=project&project=${projectId}`);await page.getByRole('button',{name:'核对条件并继续分析',exact:true}).count();
  await page.getByRole('link',{name:'模型设置',exact:true}).click();await page.getByLabel('模型名称',{exact:true}).fill('');await page.getByRole('button',{name:'检查连接',exact:true}).click();await expect(page.getByRole('alert')).toContainText('MODEL_REQUIRED');await expect(page.getByText('连接失败 MODEL_REQUIRED')).toBeVisible();
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'output/t6-workbench/screenshots/settings-failure.png',fullPage:true});
  await page.getByRole('link',{name:'验证报告',exact:true}).click();await page.getByRole('tab',{name:'候选资格与审核'}).click();await expect(page.getByRole('button',{name:'发布固定版本',exact:true})).toHaveCount(0);
});

test('candidate review is explicit and a disabled version cannot silently fall back',async({page})=>{
  const spec=JSON.parse(await readFile('packages/contracts/fixtures/save-result.json','utf8'));
  const provider=createServer(async(req,res)=>{for await(const chunk of req){}res.writeHead(200,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(spec)}}],usage:{total_tokens:20}}));});await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
  try{
    await page.goto(host.url+`/?page=settings&project=${projectId}&run=${runId}`);await page.getByLabel('接口地址',{exact:true}).fill(`http://127.0.0.1:${(provider.address() as any).port}`);await page.getByLabel('模型名称',{exact:true}).fill('synthetic-review-model');await page.getByLabel('API Key',{exact:true}).fill('synthetic-review-key');await page.getByRole('button',{name:'保存配置',exact:true}).click();
    await page.getByRole('link',{name:'项目接入',exact:true}).click();await page.getByRole('button',{name:'重新接入该流程',exact:true}).click();await page.getByRole('button',{name:'查看本次发送范围',exact:true}).click();await page.getByRole('checkbox',{name:'同意向该服务发送以上范围内经过过滤的内容',exact:true}).check();await page.getByRole('button',{name:'确认并继续',exact:true}).click();
    await page.getByRole('link',{name:'业务验证',exact:true}).click();await page.getByLabel('提交结果保存',{exact:true}).check();await page.getByText('我确认这条业务规则及适用条件').first().check();await page.getByRole('combobox',{name:'待生成规则',exact:true}).selectOption('save-rule');await page.getByRole('button',{name:'生成候选模板',exact:true}).click();await expect(page.getByText('等待双重审核 · 修订 0/2')).toBeVisible({timeout:40000});
    await page.getByRole('link',{name:'验证报告',exact:true}).click();await page.getByRole('tab',{name:'候选资格与审核',exact:true}).click();await page.getByLabel('固定版本',{exact:true}).fill('1.1.0');await page.getByRole('textbox',{name:'适用条件',exact:true}).fill('隔离测试副本的提交保存');await page.getByRole('textbox',{name:'排除条件',exact:true}).fill('其他业务语义');await page.getByRole('textbox',{name:'使用说明',exact:true}).fill('重新确认映射和合成数据');await page.getByRole('button',{name:'保存本版审核材料',exact:true}).click();await expect(page.getByRole('button',{name:'发布固定版本',exact:true})).toBeDisabled();
    await page.getByLabel('业务确认人',{exact:true}).fill('fixture-business');await page.getByLabel('开发者技术审核人',{exact:true}).fill('fixture-developer');await page.getByText('确认规则及本版适用条件',{exact:true}).check();await page.getByText('已审查定义、正反例、端到端证据及限制',{exact:true}).check();await captureStates(page,'candidate-review');await page.getByRole('button',{name:'发布固定版本',exact:true}).click();
    await page.getByLabel('停用原因',{exact:true}).fill('fixture withdrawn');await page.getByRole('button',{name:'停用 save-result 1.0.0',exact:true}).click();await page.getByRole('link',{name:'业务验证',exact:true}).click();await page.getByRole('button',{name:'准备本轮检查',exact:true}).click();await page.getByRole('button',{name:'确认并继续',exact:true}).click();await expect(page.getByRole('alert')).toContainText('没有有效已发布模板');
    await page.getByRole('combobox',{name:'固定模板版本',exact:true}).selectOption({label:'save-result @ 1.1.0'});await expect(page.getByText('我确认这条业务规则及适用条件').first().locator('input')).not.toBeChecked();await captureStates(page,'disabled-version');
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
    await expect(page.getByRole('heading',{name:mode==='fail'?'发现业务问题':'部分检查无法验证',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'开始目标负载验证',exact:true})).toHaveCount(0);await expect(page.getByText('本轮存在失败、未知、待定项或未完成，不能开始目标负载验证。')).toBeVisible();
    if(mode==='inconclusive'){const record=await request(`/runs/${launched.runId}`);expect(record.parentRunId).toBe(sourceRun);const old=await request(`/runs/${sourceRun}`);expect(record.plan.checks).toEqual(old.plan.checks);expect(record.plan.mapping).not.toEqual(old.plan.mapping);}
    for(const width of [1280,768,390]){await page.setViewportSize({width,height:900});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`output/t6-workbench/screenshots/report-${mode}-${width}.png`,fullPage:true});}
  }
});
