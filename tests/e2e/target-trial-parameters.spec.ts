import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
// @ts-ignore compiled host
import {startWorkbench} from '../../apps/host/dist/api.js';

for(const width of [1280,390])test(`inconclusive trial explains request rejection and keeps review blocked at ${width}px`,async({page})=>{
  const directory=join(process.cwd(),'.local-data/trial-parameter-ui-tests',randomUUID()),host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  const request=async(path:string,body?:unknown)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});expect(r.ok).toBe(true);return r.json();};
  try{
    const {projectId}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'}),raw=await request('/state');
    const spec=JSON.parse(await readFile('tests/fixtures/title-update.json','utf8'));
    const candidate={id:'paused-parameter-fixture',ruleId:'title-update-rule',status:'paused',phase:'awaiting_trial',code:'TARGET_TRIAL_EVIDENCE_INCOMPLETE',spec,revisionIndex:0,budget:{calls:1,tokens:20},validation:{gateResults:{admitted:true}},trial:{completed:true,verdicts:spec.assertions.map((a:any)=>({assertionRef:a.id,status:'inconclusive',reasonCode:'UNEXPECTED_ACCEPTANCE',evidenceRefs:['one','two','three']}))}};
    await page.route('**/api/state',route=>route.fulfill({json:{...raw,projects:[{...raw.projects[0],candidate}]}}));
    await page.setViewportSize({width,height:900});await page.goto(host.url+`/?page=verify&project=${projectId}`);
    await page.getByRole('combobox',{name:'要检查网站的哪种操作？',exact:true}).selectOption('edit');
    const review=page.getByRole('region',{name:'检查方案验证与审核',exact:true});
    await expect(review.getByText('试运行待处理',{exact:true})).toBeVisible();
    await expect(review.getByText('接口的接受或拒绝结果与步骤预期不符，请核对请求参数、权限和接口限制。',{exact:false})).toHaveCount(3);
    await expect(review.getByRole('textbox',{name:'业务确认人',exact:true})).toHaveCount(0);
    await expect(review.getByText('试运行暂时无法得出结论，请查看下方具体原因与技术证据，处理后继续原方案。',{exact:true})).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await mkdir('output/target-trial-parameters/screenshots',{recursive:true});await review.screenshot({path:`output/target-trial-parameters/screenshots/paused-${width}.png`});
  }finally{await host.close();}
});
