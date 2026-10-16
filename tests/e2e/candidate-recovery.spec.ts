import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
// @ts-ignore compiled host
import {startWorkbench} from '../../apps/host/dist/api.js';

for(const width of [1280,390])test(`rejected preparation starts only an explicitly confirmed new task and reaches review at ${width}px`,async({page})=>{
 test.setTimeout(120000);await mkdir('output/candidate-recovery-20261016',{recursive:true});const directory=await mkdtemp(join(process.cwd(),'output/candidate-recovery-20261016/browser-'));
 const spec=JSON.parse(await readFile('templates/saved-result.json','utf8')),requests:any[]=[],ids:string[]=[];
 const provider=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);requests.push(body);
  const required=JSON.parse(body.messages[1].content).input.executionRequirements;const selectedRule=JSON.parse(body.messages[1].content).input.rule.id;if(selectedRule==='save-rule')expect(required.assertionIds).toEqual(['saved-title']);
  const value=structuredClone(spec);if(requests.filter(r=>JSON.parse(r.messages[1].content).input.rule.id==='save-rule').length<=3||selectedRule!=='save-rule')value.assertions[0].id='wrong-obligation';
  res.writeHead(200,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({spec:value,reference:{applicable:['合成工单且完整查询'],excluded:['生产环境'],instructions:'提交后查询并核对实际保存标题。'}})}}],usage:{total_tokens:20}}));
 });await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
 const request=async(path:string,body?:any)=>{const response=await fetch(host.url+'/api'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+host.token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const value=await response.json();expect(response.ok,JSON.stringify(value)).toBe(true);return value};
 try{
  await request('/settings',{serviceUrl:`http://127.0.0.1:${(provider.address() as any).port}`,model:'synthetic-recovery-only',key:'synthetic-recovery-key'});
  const {projectId}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic'}),state=await request('/state'),project=state.projects[0],rule=state.rules.find((r:any)=>r.id==='save-rule');
  const disclosure=await request(`/projects/${projectId}/disclosure`);await request(`/projects/${projectId}/confirm`,{environment:true,environmentHash:project.environmentHash,send:true,scopeHash:disclosure.scopeHash});
  await request(`/projects/${projectId}/workflow`,{revision:0,flow:'submit',choices:{'save-rule':{enabled:true,confirmed:true,ruleHash:rule.hash,environmentHash:project.environmentHash}}});
  const old=await request(`/projects/${projectId}/candidate`,{ruleId:'save-rule',confirmRule:true});ids.push(old.candidateId);
  await expect.poll(async()=> (await request('/state')).projects[0].candidate?.status,{timeout:30000}).toBe('rejected');expect(requests).toHaveLength(3);
  if(width===1280){const other=await request(`/projects/${projectId}/candidate`,{ruleId:'duplicate-rule',confirmRule:true});ids.push(other.candidateId);await expect.poll(async()=> (await request('/state')).projects[0].candidate?.status,{timeout:30000}).toBe('rejected');expect((await request('/state')).projects[0].candidate.ruleId).toBe('duplicate-rule');}
  const beforeRestartCalls=requests.length;
  const oldPath=join('.local-data/candidates',old.candidateId,'state.json'),oldBytes=await readFile(oldPath,'utf8');
  await page.setViewportSize({width,height:900});await page.goto(host.url+`/?page=verify&step=5&project=${projectId}`);
  const restart=page.getByRole('button',{name:'重新准备方案（新任务）',exact:true});await expect(restart).toBeEnabled();await restart.click();await expect(page.getByText(/将创建新候选任务并使用新的有限预算/)).toBeVisible();expect(requests).toHaveLength(beforeRestartCalls);
  await page.getByRole('button',{name:'取消准备',exact:true}).click();expect(requests).toHaveLength(beforeRestartCalls);await restart.click();
  await page.screenshot({path:`output/candidate-recovery-20261016/confirm-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'确认新任务并调用模型',exact:true}).click();
  await expect(page.getByRole('button',{name:'审核这条检查方案',exact:true})).toBeVisible({timeout:90000});
  const final=await request('/state'),candidate=final.projects[0].candidate;ids.push(candidate.id);expect(candidate.id).not.toBe(old.candidateId);expect(candidate.status).toBe('ready_for_review');expect(candidate.validation.gateResults.admitted).toBe(true);expect(candidate.trial.completed).toBe(true);expect(candidate.trial.verdicts.every((v:any)=>v.status==='pass')).toBe(true);expect(candidate.budget.calls).toBe(1);expect(requests).toHaveLength(beforeRestartCalls+1);expect(final.runs).toHaveLength(0);expect(await readFile(oldPath,'utf8')).toBe(oldBytes);
  const saved=JSON.parse(await readFile(join(directory,'state.json'),'utf8')).projects[0];expect(saved.candidateHistory).toContain(old.candidateId);await page.screenshot({path:`output/candidate-recovery-20261016/recovered-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await host.close();await new Promise<void>(r=>{provider.closeAllConnections();provider.close(()=>r())});await rm(directory,{recursive:true,force:true});for(const id of ids)await rm(join(process.cwd(),'.local-data/candidates',id),{recursive:true,force:true})}
});
