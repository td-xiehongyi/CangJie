import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
// @ts-ignore compiled host
import {startWorkbench} from '../../apps/host/dist/api.js';
// @ts-ignore compiled registry
import {TemplateRegistry} from '../../apps/host/dist/templates/store.js';
// @ts-ignore deterministic local fixture
import {publishedFixture} from '../support/published.mjs';

const output='output/result-loop-20261017';
test('real failed business -> material preview -> source repair -> authorized original-rule retest and honest comparison',async({page})=>{
 test.setTimeout(120000);
 const directory=join(process.cwd(),output,'state',randomUUID()),source=join(directory,'source'),registryDirectory=join(directory,'registry');
 await cp('samples/ticket',source,{recursive:true});
 const file=join(source,'src/server.ts'),healthy=await readFile(file,'utf8');
 expect(healthy).toContain("String(req.body.title??'无标题')");
 await writeFile(file,healthy.replace("String(req.body.title??'无标题')","'wrong-saved-title'"));
 await publishedFixture(directory,new TemplateRegistry(registryDirectory),'packages/contracts/fixtures/save-result.json','save-rule');
 const host=await startWorkbench({directory,registryDirectory,port:0});
 const req=async(path:string,body?:unknown)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});expect(r.ok).toBe(true);return r.headers.get('content-type')?.includes('application/json')?r.json():r.text()};
 try{
  const {projectId}=await req('/projects',{directory:source,accountMode:'automatic'});
  let state=await req('/state'),project=state.projects.find((p:any)=>p.id===projectId);
  await req(`/projects/${projectId}/confirm`,{environment:true,environmentHash:project.environmentHash});
  const templateRef=state.catalog.matches.find((m:any)=>m.ref.id==='save-result').ref;
  const {runId:oldId}=await req(`/projects/${projectId}/run`,{flow:{id:'submit',title:'保存内容'},checks:[{ruleId:'save-rule',confirmed:true,templateRef}]});
  await expect.poll(async()=>(await req('/state')).runs.find((r:any)=>r.id===oldId)?.status,{timeout:40000}).toBe('completed');
  const original=await req('/runs/'+oldId);expect(original.checks[0].verdicts[0].status).toBe('fail');
  let replayCalls=0,executionCalls=0;page.on('request',r=>{if(r.method()==='POST'&&/\/(discovery|candidate|run|prepare|replay|load|publish|review)$/.test(new URL(r.url()).pathname)){executionCalls++;if(r.url().endsWith('/replay'))replayCalls++;}});
  await page.goto(host.url+`/?page=report&step=11&project=${projectId}&run=${oldId}`);
  await expect(page.getByRole('region',{name:'发现问题的检查',exact:true})).toBeVisible();
  await expect(page.getByText('"wrong-saved-title"',{exact:true})).toBeVisible();
  await page.route(`**/api/runs/${oldId}/repair-report`,route=>route.fulfill({status:503,json:{error:'SYNTHETIC_PREVIEW_UNAVAILABLE'}}));
  await page.getByRole('button',{name:'预览修复材料',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'修复材料预览',exact:true});
  await expect(dialog.getByRole('alert')).toContainText('无法读取修复材料');
  await expect(dialog.getByRole('button',{name:'下载当前修复材料',exact:true})).toHaveCount(0);
  await page.unroute(`**/api/runs/${oldId}/repair-report`);
  await dialog.getByRole('button',{name:'重新读取材料',exact:true}).click();
  const expected=await req(`/runs/${oldId}/repair-report`);
  await expect(dialog.getByLabel('完整修复材料',{exact:true})).toHaveText(expected);
  const downloadPromise=page.waitForEvent('download');await dialog.getByRole('button',{name:'下载当前修复材料',exact:true}).click();
  const download=await downloadPromise;expect(await readFile((await download.path())!,'utf8')).toBe(expected);
  expect(executionCalls).toBe(0);expect((await req('/state')).runs).toHaveLength(1);
  await mkdir(join(output,'screenshots'),{recursive:true});
  for(const width of [1280,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:join(output,`screenshots/material-${width}.png`),fullPage:true});}
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'预览修复材料',exact:true})).toBeFocused();
  await page.screenshot({path:join(output,'screenshots/failed-result-390.png'),fullPage:true});
  await writeFile(file,healthy);await req('/projects',{id:projectId,directory:source});await page.reload();
  await page.getByRole('button',{name:'我已修改项目或补齐条件，准备复测',exact:true}).click();
  await expect(page.getByText('原检查范围：提交结果保存',{exact:true})).toBeVisible();
  const changed=page.getByLabel('我已核对重新接入后的源码与映射，按新条件复跑原规则',{exact:true});
  await expect(changed).not.toBeChecked();expect(replayCalls).toBe(0);
  await changed.check();await page.getByRole('checkbox',{name:'我同意在独立测试副本中创建用户并重置测试数据',exact:true}).check();
  await page.getByRole('button',{name:'执行复测',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('run')).not.toBe(oldId);
  const newId=new URL(page.url()).searchParams.get('run')!;
  await expect.poll(async()=>(await req('/state')).runs.find((r:any)=>r.id===newId)?.status,{timeout:40000}).toBe('completed');
  await expect(page.getByRole('heading',{name:'本轮所选检查通过',exact:true})).toBeVisible();
  const comparison=page.getByRole('region',{name:'原运行与本次复测对比',exact:true});
  await expect(comparison).toContainText('原问题在本次条件下未复现');
  const next=await req('/runs/'+newId);expect(next.parentRunId).toBe(oldId);expect(next.plan.checks).toEqual(original.plan.checks);expect(next.plan.sourceHash).not.toBe(original.plan.sourceHash);expect(await req('/runs/'+oldId)).toEqual(original);
  for(const width of [1280,768,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:join(output,`screenshots/retest-${width}.png`),fullPage:true});}
  await page.getByRole('button',{name:'预览修复材料',exact:true}).click();await expect(dialog.getByLabel('完整修复材料',{exact:true})).toContainText('运行：'+newId);await expect(dialog.getByLabel('完整修复材料',{exact:true})).not.toContainText('wrong-saved-title');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'查看原运行与证据',exact:true}).click();await expect.poll(()=>new URL(page.url()).searchParams.get('run')).toBe(oldId);await expect(page.getByRole('heading',{name:'发现 1 项业务问题',exact:true})).toBeVisible();
  // A real incomplete query must remain unknown even after a source fix.
  state=await req('/state');project=state.projects.find((p:any)=>p.id===projectId);const mapping=structuredClone(project.mapping);mapping.resultBindings.query.title=['items','0','missing-title'];
  await req('/projects',{id:projectId,directory:source,mapping});project=(await req('/state')).projects.find((p:any)=>p.id===projectId);await req(`/projects/${projectId}/confirm`,{environment:true,environmentHash:project.environmentHash});
  const {runId:unknownId}=await req(`/projects/${projectId}/replay`,{runId:oldId,reconfirmedChanges:true});await expect.poll(async()=>(await req('/state')).runs.find((r:any)=>r.id===unknownId)?.status,{timeout:40000}).toBe('completed');
  await page.goto(host.url+`/?page=report&step=11&project=${projectId}&run=${unknownId}`);
  await expect(page.getByRole('region',{name:'尚不能判断的检查',exact:true})).toBeVisible();await expect(comparison).not.toContainText('原问题在本次条件下未复现');await expect(comparison).toContainText('接口映射已变化');
  await page.screenshot({path:join(output,'screenshots/unknown-result-390.png'),fullPage:true});
  expect(await req('/runs/'+oldId)).toEqual(original);
 }finally{await page.unrouteAll({behavior:'wait'});await host.close();}
});

test('comparison and material previews stay read-only across missing history, changed standards and stale responses',async({page,context})=>{
 const directory=join(process.cwd(),output,'ui-state',randomUUID()),host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 let release=()=>{};
 try{
  const response=await fetch(host.url+'/api/projects',{method:'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:JSON.stringify({directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'})}),{projectId}=await response.json();
  const oldId=randomUUID(),newId=randomUUID(),hash='a'.repeat(64);
  const check={rule:{id:'save-rule',confirmation:'confirmed',expectedChanges:['正确保存'],invariants:[]},mode:'verify',status:'completed',templateRef:{id:'t',version:'1',hash},actions:[],observations:[],verdicts:[{status:'pass',assertionRef:'a',evidenceRefs:[]}],preparation:{data:{seedVersion:'v',count:2},accounts:[{actorRef:'owner',userId:'u',role:'user'}],baseline:{summary:{hash:'baseline'}}}};
  const old={schemaVersion:1,id:oldId,projectId,flow:{id:'submit',title:'UI状态夹具'},status:'completed',kind:'verification',startedAt:'2026-10-17T00:00:00Z',plan:{sourceHash:hash,mapping:{id:'m'},checks:[check]},checks:[{...check,verdicts:[{status:'fail',assertionRef:'a',evidenceRefs:[]}]}],events:[],evidence:{},uncovered:[]};
  const next={...structuredClone(old),id:newId,parentRunId:oldId,checks:[structuredClone(check)]};
  let mode='missing';
  await page.route('**/api/state',async route=>{const response=await route.fetch(),value=await response.json();const current=structuredClone(next);if(mode==='standards')current.checks[0].rule.expectedChanges=['放宽后的标准'];if(mode==='unknown')current.checks[0].verdicts=[{status:'inconclusive',assertionRef:'a',evidenceRefs:[]}];value.runs=mode==='missing'?[current]:[old,current];await route.fulfill({json:value});});
  await page.route(`**/api/runs/${oldId}`,route=>route.fulfill({status:503,json:{error:'SYNTHETIC_PARENT_UNAVAILABLE'}}));
  let dispatches=0;page.on('request',r=>{if(r.method()==='POST'&&/\/(run|replay|prepare|candidate|publish|review|load)$/.test(new URL(r.url()).pathname))dispatches++});
  await page.setViewportSize({width:390,height:900});
  const comparison=page.getByRole('region',{name:'原运行与本次复测对比',exact:true});
  await page.goto(host.url+`/?page=report&step=11&project=${projectId}&run=${newId}`);
  await expect(comparison).toContainText('暂时无法读取原运行');await expect(comparison).not.toContainText('原问题在本次条件下未复现');
  mode='standards';await page.reload();await expect(comparison).toContainText('检查标准已变化，不能直接比较');
  mode='unknown';await page.reload();await expect(comparison).toContainText('证据不足，仍不能确认是否解决');
  mode='unchanged';
  const delayed=new Promise<void>(resolve=>release=resolve);let pending=false;
  await page.route('**/api/runs/*/repair-report',async route=>{if(route.request().url().includes(oldId)){pending=true;await delayed;await route.fulfill({contentType:'text/markdown',body:'OLD MATERIAL '+oldId}).catch(()=>{});}else await route.fulfill({contentType:'text/markdown',body:'NEW MATERIAL '+newId});});
  await page.goto(host.url+`/?page=report&step=11&project=${projectId}&run=${oldId}`);await page.getByRole('button',{name:'预览修复材料',exact:true}).click();await expect.poll(()=>pending).toBe(true);
  await page.goto(host.url+`/?page=report&step=11&project=${projectId}&run=${newId}`);await page.getByRole('button',{name:'预览修复材料',exact:true}).click();release();
  const dialog=page.getByRole('dialog',{name:'修复材料预览',exact:true});await expect(dialog.getByLabel('完整修复材料',{exact:true})).toHaveText('NEW MATERIAL '+newId);await expect(dialog).not.toContainText('OLD MATERIAL');
  await context.grantPermissions(['clipboard-read','clipboard-write']);await dialog.getByRole('button',{name:'复制修复材料',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('修复材料已复制');expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('NEW MATERIAL '+newId);
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'预览修复材料',exact:true})).toBeFocused();expect(dispatches).toBe(0);
  await page.unroute('**/api/runs/*/repair-report');await page.route('**/api/runs/*/repair-report',route=>route.fulfill({json:{unexpected:'not a material'}}));await page.getByRole('button',{name:'预览修复材料',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('格式不完整');await expect(dialog.getByRole('button',{name:'下载当前修复材料',exact:true})).toHaveCount(0);
 }finally{release();await page.unrouteAll({behavior:'wait'});await host.close();}
});
