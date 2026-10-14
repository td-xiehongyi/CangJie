import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
// @ts-ignore compiled host
import {startWorkbench} from '../../apps/host/dist/api.js';
// @ts-ignore development-only archive
import {restoreFixture} from '../../scripts/t7-fixture.mjs';
test('T8 browser config, real k6, evidence and server restart',{tag:'@t8'},async({page})=>{
  const directory=join(process.cwd(),'.local-data/t8-browser',randomUUID()),fixture=await restoreFixture();
  let host=await startWorkbench({directory,registryDirectory:fixture.registry,port:0});
  const request=async(path:string,body?:unknown)=>{const response=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();expect(response.ok,JSON.stringify(data)).toBe(true);return data;};
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    const mapping=JSON.parse(await readFile('tests/reference/mapping.json','utf8'));
    const {projectId}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),mapping,accounts:[{actorRef:'owner',username:'alpha',userId:'user-a',role:'user',password:'synthetic-t8-browser-owner'},{actorRef:'other',username:'beta',userId:'user-b',role:'user',password:'synthetic-t8-browser-other'}]});
    const p=(await request('/state')).projects[0];await request(`/projects/${projectId}/confirm`,{environment:true,environmentHash:p.environmentHash});
    const freeze=JSON.parse(await readFile('docs/evidence/t7-freeze.json','utf8'));
    const {runId}=await request(`/projects/${projectId}/run`,{flow:{id:'submit',title:'提交与编辑工单'},checks:freeze.publications.map((p:any)=>({ruleId:p.rule.id,confirmed:true,templateRef:p.ref}))});
    await expect.poll(async()=>(await request('/state')).runs.find((r:any)=>r.id===runId)?.status,{timeout:30000}).toBe('completed');
    await page.goto(host.url+`/?page=report&project=${projectId}&run=${runId}`);
    await page.getByText('设置并开始负载检查',{exact:true}).click();
    await expect(page.getByRole('button',{name:'开始目标负载验证',exact:true})).toBeDisabled();
    await page.getByLabel('验证目标是否达标',{exact:true}).check();
    const fields=[['每秒完整业务检查次数','4'],['持续秒数（最多300）','2'],['完成等待上限（毫秒）','3000'],['允许错误百分比（0—100）','0']];
    for(const [label,value]of fields)await page.getByLabel(label,{exact:true}).fill(value);
    for(const input of await page.getByLabel(/占比 %/).all())await input.fill('25');
    await page.getByLabel('我已确认上述目标、比例、等待、错误口径和资源上限').check();
    await page.getByLabel('每秒完整业务检查次数',{exact:true}).fill('5');await expect(page.getByLabel('我已确认上述目标、比例、等待、错误口径和资源上限')).not.toBeChecked();await page.getByLabel('每秒完整业务检查次数',{exact:true}).fill('4');await page.getByLabel('我已确认上述目标、比例、等待、错误口径和资源上限').check();
    await page.getByRole('button',{name:'开始目标负载验证',exact:true}).click();
    await expect(page.getByRole('heading',{name:'目标达标',exact:true})).toBeVisible({timeout:30000});
    const result=(await request('/state')).loads[0];expect(result.metrics.started).toBe(8);const detail=await request(`/loads/${result.id}`);expect(new Set(detail.ledger.map((e:any)=>e.ruleId)).size).toBe(4);expect(detail.settlement.unknown).toBe(0);expect(JSON.stringify(detail)).not.toContain('synthetic-t8-browser-owner');
    await mkdir('output/ui-refresh/target-load',{recursive:true});for(const width of [1280,768,390]){await page.setViewportSize({width,height:900});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`output/ui-refresh/target-load/report-${width}.png`,fullPage:true});}
    const dl=page.waitForEvent('download');await page.getByRole('button',{name:'导出账本与证据',exact:true}).click();expect((await dl).suggestedFilename()).toBe(`${result.id}-load-evidence.json`);
    await host.close();host=await startWorkbench({directory,registryDirectory:fixture.registry,port:0});expect((await request(`/loads/${result.id}`)).verdict).toBe('pass');expect(errors).toEqual([]);
  }finally{await host.close();}
});
