import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {cp} from 'node:fs/promises';
// @ts-ignore compiled host
import {startWorkbench} from '../../apps/host/dist/api.js';

test('whole-project materials refresh locally after reload without model dispatch',async({page})=>{
 const directory=join(process.cwd(),'output/flow2-implementation-20261015/state',randomUUID());
 await cp('tests/fixtures/discovery-orders',join(directory,'source'),{recursive:true});
 const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 const req=async(path:string,body:any)=>{const r=await fetch(host.url+'/api'+path,{method:'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:JSON.stringify(body)});expect(r.ok).toBe(true);return r.json()};
 try{
 await req('/settings',{serviceUrl:'https://api.deepseek.com',model:'deepseek-flash'});
 const p=await req('/source-projects',{directory:join(directory,'source')});
 let dispatched=0;page.on('request',r=>{if(r.method()==='POST'&&/\/discovery$|\/resume$/.test(new URL(r.url()).pathname))dispatched++});
 await page.goto(host.url+`/?page=project&step=2&project=${p.id}`);
 await expect(page.getByRole('button',{name:'读取项目',exact:true})).toBeVisible();
 await expect(page.getByLabel('重点关注什么（可选）')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'前往04 准备运行条件'})).toHaveCount(0);
 let localChecks=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/discovery-input'))localChecks++});
 await page.getByRole('button',{name:'读取项目',exact:true}).click();
 await expect(page.getByRole('heading',{name:'确认发送项目',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'同意发送并开始分析',exact:true})).toBeDisabled();
 expect(localChecks).toBe(1);expect(dispatched).toBe(0);
 await page.reload();await expect(page.getByRole('region',{name:'待发送材料',exact:true})).toHaveCount(0);
 // Reading again refreshes the current whole-project scope; it never sends a cached manifest.
 const latestResponse=await fetch(host.url+`/api/projects/${p.id}/discovery-scope`,{headers:{authorization:`Bearer ${host.token}`}}),latest=await latestResponse.json();
 await req(`/projects/${p.id}/discovery-scope`,{expectedRevision:latest.revision,allowedPaths:['src'],excludedPaths:[],includeProjectTests:false});
 await page.reload();await page.getByRole('button',{name:'读取项目',exact:true}).click();
 await expect(page.getByRole('heading',{name:'确认发送项目',exact:true})).toBeVisible();
 const currentResponse=await fetch(host.url+`/api/projects/${p.id}/discovery-scope`,{headers:{authorization:`Bearer ${host.token}`}}),current=await currentResponse.json();
 expect(current.revision).toBeGreaterThan(latest.revision);expect(current.scope.allowedPaths).toEqual(['.']);expect(current.scope.includeProjectTests).toBe(true);
 expect(localChecks).toBe(2);expect(dispatched).toBe(0);
 for(const width of [1280,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`output/flow2-implementation-20261015/preview-${width}.png`,fullPage:true});}
 }finally{await page.unrouteAll({behavior:'wait'});await host.close()}
});
test('exhausted task offers a new material check, not an ineffective resume',async({page})=>{
 const directory=join(process.cwd(),'output/flow2-implementation-20261015/state',randomUUID());
 await cp('tests/fixtures/discovery-orders',join(directory,'source'),{recursive:true});
 const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 try{
 const response=await fetch(host.url+'/api/source-projects',{method:'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:JSON.stringify({directory:join(directory,'source')})});const p=await response.json();
 await page.route('**/api/state',async route=>{const r=await route.fetch(),state=await r.json();state.projects[0].discovery={id:'fixture',revision:0,status:'partial',budget:{calls:1,tokens:100},reads:[],unresolved:['TRUNCATED_OUTPUT','ANALYSIS_BUDGET_EXHAUSTED'],referencesValid:true,recovery:{allowed:false,reason:'deadline',message:'本次分析已超过时间上限，无法继续原任务。'}};await route.fulfill({response:r,json:state})});
 await page.goto(host.url+`/?page=project&step=2&project=${p.id}`);
 await expect(page.getByText('本次分析已超过时间上限，无法继续原任务。',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/继续原分析/})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'读取项目',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'读取项目',exact:true}).click();
 await expect(page.getByRole('region',{name:'待发送材料',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'同意发送并开始分析',exact:true})).toBeDisabled();
 await expect(page.getByText('尚未形成业务草稿；读取与调用记录已保留。',{exact:true})).toBeVisible();
 await page.screenshot({path:'output/flow2-implementation-20261015/exhausted.png',fullPage:true});
 }finally{await page.unrouteAll({behavior:'wait'});await host.close()}
});
