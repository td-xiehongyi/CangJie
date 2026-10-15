import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
// @ts-ignore compiled host
import {startWorkbench} from '../../apps/host/dist/api.js';

for(const mode of ['save','load'])test(`session restart preserves local choices and explicitly resolves ${mode}`,async({page})=>{
  const directory=join(process.cwd(),'.local-data/session-recovery-tests',randomUUID()),registryDirectory=join(directory,'registry');
  let host=await startWorkbench({directory,registryDirectory,port:0});
  const request=async(path:string,body?:unknown)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});expect(r.ok).toBe(true);return r.json();};
  try{
    const {projectId}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'});
    await page.setViewportSize({width:mode==='save'?1280:390,height:900});await page.goto(host.url+`/?page=verify&project=${projectId}`);
    await expect(page.getByRole('heading',{name:'03 确认业务与测试目标'})).toBeVisible();
    const port=Number(new URL(host.url).port);await host.close();host=await startWorkbench({directory,registryDirectory,port});
    await page.getByLabel('提交结果保存',{exact:true}).check();
    await expect(page.getByRole('button',{name:'重新连接工作台',exact:true})).toBeVisible();
    await expect(page.getByText('检查选择尚未保存',{exact:true})).toBeVisible();
    const state=await request('/state'),project=state.projects[0],rule=state.rules.find((r:any)=>r.id==='duplicate-rule');
    await request(`/projects/${projectId}/workflow`,{revision:project.workflow.revision,flow:'submit',choices:{'duplicate-rule':{enabled:true,confirmed:false,ruleHash:rule.hash,environmentHash:project.environmentHash}}});
    let writes=0;page.on('request',r=>{if(r.method()==='POST')writes++;});
    await page.route('**/api/session',route=>route.fulfill({status:503,json:{error:'offline'}}));
    await page.getByRole('button',{name:'重新连接工作台',exact:true}).click();
    await expect(page.getByText('暂时无法重新连接，请确认工作台正在运行后重试。',{exact:true})).toBeVisible();
    await expect(page.getByLabel('提交结果保存',{exact:true})).toBeChecked();
    await page.unroute('**/api/session');await page.getByRole('button',{name:'重新连接工作台',exact:true}).click();
    await expect(page.getByText('连接已恢复，本页选择尚未保存。请选择保留本页，或加载已保存的选择。',{exact:true})).toBeVisible();
    expect(writes).toBe(0);await expect(page.getByLabel('提交结果保存',{exact:true})).toBeChecked();
    await page.getByLabel('账号之间权限隔离',{exact:true}).check();await expect(page.getByText('检查选择尚未保存',{exact:true})).toBeVisible();
    // Editing after reconnect still waits for an explicit resolution.
    await page.getByRole('combobox',{name:'要检查网站的哪种操作？',exact:true}).focus();expect(writes).toBe(0);
    await page.getByRole('button',{name:mode==='save'?'保留本页并重新保存':'加载已保存的选择',exact:true}).click();
    await expect(page.getByText('检查选择已保存',{exact:true})).toBeVisible();
    await expect(page.getByLabel(mode==='save'?'提交结果保存':'重复提交不重复创建',{exact:true})).toBeChecked();
    await expect(page.getByRole('combobox',{name:'要检查网站的哪种操作？',exact:true})).toBeVisible();
    await expect(page.getByText('选入本轮并确认预期后才判对错；未确认项仅观察。',{exact:true})).toBeVisible();
    const current=await request('/state');expect(current.runs).toHaveLength(0);expect(current.projects[0].candidate).toBeFalsy();
    await mkdir('output/ux-workflow-v12-20261015-01a13f78/automated/recovery/screenshots',{recursive:true});await page.screenshot({path:`output/ux-workflow-v12-20261015-01a13f78/automated/recovery/screenshots/${mode}.png`,fullPage:true});
    await page.reload();await expect(page.getByLabel(mode==='save'?'提交结果保存':'重复提交不重复创建',{exact:true})).toBeChecked();
  }finally{await host.close();}
});

test('reconnecting keeps unsaved review materials without replaying review or publication',async({page})=>{
  const directory=join(process.cwd(),'.local-data/session-recovery-tests',randomUUID()),registryDirectory=join(directory,'registry');
  let host=await startWorkbench({directory,registryDirectory,port:0});
  try{
    const r=await fetch(host.url+'/api/projects',{method:'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},body:JSON.stringify({directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'})}),{projectId}=await r.json();
    await page.route('**/api/state',async route=>{const response=await route.fetch();if(!response.ok()){await route.fulfill({response});return;}const value=await response.json();value.projects[0].candidate={id:'review-fixture',ruleId:'save-rule',candidateHash:'a'.repeat(64),status:'ready_for_review',reference:{applicable:['测试副本'],excluded:['线上环境'],instructions:'核对实际保存结果'}};await route.fulfill({json:value});});
    await page.goto(host.url+`/?page=verify&step=9&project=${projectId}`);
    await page.getByRole('textbox',{name:'适用条件',exact:true}).fill('尚未保存的业务范围');await page.getByRole('textbox',{name:'业务确认人',exact:true}).fill('本页业务确认人');
    const port=Number(new URL(host.url).port);await host.close();host=await startWorkbench({directory,registryDirectory,port});
    await page.getByRole('button',{name:'保存本版审核材料',exact:true}).click();
    await expect(page.getByRole('button',{name:'重新连接工作台',exact:true})).toBeVisible();
    let writes=0;page.on('request',r=>{if(r.method()==='POST')writes++;});
    await page.getByRole('button',{name:'重新连接工作台',exact:true}).click();
    await expect(page.getByRole('button',{name:'重新连接工作台',exact:true})).toHaveCount(0);
    await expect(page.getByRole('textbox',{name:'适用条件',exact:true})).toHaveValue('尚未保存的业务范围');await expect(page.getByRole('textbox',{name:'业务确认人',exact:true})).toHaveValue('本页业务确认人');
    await expect(page.getByText('连接已恢复，审核输入已保留。请核对后手动保存，尚未重新提交审核。',{exact:true})).toBeVisible();
    expect(writes).toBe(0);await expect(page.getByRole('button',{name:'审核通过，保存为可复用方案',exact:true})).toBeDisabled();
  }finally{await host.close();}
});
