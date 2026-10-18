import {goStep} from './workflow-steps';
import {mkdir} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer,type Server} from 'node:http';
import {join,resolve,extname} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {randomUUID} from 'node:crypto';
// @ts-ignore compiled local host
import {startWorkbench} from '../../apps/host/dist/api.js';
import ts from 'typescript';
// @ts-ignore compiled local port allocator
import {listenLoopback} from '../../apps/host/dist/execution/ports.js';

async function importClient(){
  const source=await readFile('apps/ui/src/api/client.ts','utf8');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
test('project rule API preserves exact version references and explicit confirmations',async()=>{
  const client=await importClient();
  expect(client.projectRulesApi,'S3 project-rule API is available').toBeDefined();
  const calls:any[]=[],oldFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{calls.push({path:input,method:init?.method,body:init?.body?JSON.parse(String(init.body)):undefined});return new Response(JSON.stringify({revision:1}),{headers:{'content-type':'application/json'}})};
  try{
    const ref={projectId:'project-a',id:'rule-a',version:2,contentHash:'hash-v2'};
    await client.projectRulesApi.list('project-a');
    await client.projectRulesApi.confirm('project-a',{discoveryId:'d',suggestionId:'s',expectedRevision:0,answers:{q:'only owner'},expectedBehavior:['only owner'],confirmed:true});
    await client.projectRulesApi.revise('project-a','rule-a',{expectedRevision:1,expectedBehavior:['no reopen'],note:'业务纠正'});
    await client.projectRulesApi.confirmVersion('project-a','rule-a',{expectedRevision:2,version:2,confirmed:true});
    await client.projectRulesApi.select('project-a',{expectedRevision:3,ruleRef:ref});
    await client.projectRulesApi.version('project-a','rule-a',1);
    expect(calls.map(v=>v.path)).toEqual(['/api/projects/project-a/rules','/api/projects/project-a/rules/confirm','/api/projects/project-a/rules/rule-a/revise','/api/projects/project-a/rules/rule-a/confirm-version','/api/projects/project-a/rules/selection','/api/projects/project-a/rules/rule-a/versions/1']);
    expect(calls[4].body).toEqual({expectedRevision:3,ruleRef:ref});
    expect(calls[2].body).not.toHaveProperty('confirmed');
    expect(client.friendlyError('RULE_REVISION_CONFLICT')).toContain('输入已保留');
    expect(client.friendlyError('VALIDATION_RESOURCE_GAP')).toContain('独立验证');
  }finally{globalThis.fetch=oldFetch}
});

const suggestion={id:'owner-rule',flow:'修改订单',priorityReason:'权限风险',facts:[{text:'当前源码允许任何人修改订单。',sourceRefs:[]}],expectations:[{text:'仅所有者可修改订单。',source:'documentation',confirmation:'pending',sourceRefs:[]}],risks:[],openQuestions:['谁可以修改订单？'],operationNeeds:['修改订单'],observationNeeds:['所有者与最终状态'],sourceRefs:[]};
const session={id:'discovery-a',revision:1,status:'completed',referencesValid:true,budget:{calls:0,tokens:0,inputBytes:0,sourceBytes:0},reads:[],unresolved:[],result:{summary:'订单修改',objects:['订单'],roles:['所有者'],flows:[],suggestions:[suggestion],limitations:[],unresolved:[]}};
const baseRule={projectId:'project-a',id:'project-owner-rule',version:1,contentHash:'hash-v1',suggestionRef:{discoveryId:session.id,suggestionId:suggestion.id},sourceRefs:[],flow:suggestion.flow,facts:suggestion.facts,expectations:suggestion.expectations,openQuestions:suggestion.openQuestions,answers:{'谁可以修改订单？':'仅所有者'},expectedBehavior:['仅所有者可修改订单'],operationNeeds:suggestion.operationNeeds,observationNeeds:suggestion.observationNeeds,confirmation:{status:'confirmed',actor:'local_user'},corrections:[]};
const ref=(rule:any)=>({projectId:rule.projectId,id:rule.id,version:rule.version,contentHash:rule.contentHash});

async function importUi(path:string):Promise<any>{
  const source=await readFile(path,'utf8');
  let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  for(const match of [...js.matchAll(/from ["']([^"']+)["']/g)]){
    const name=match[1];let target:string;
    if(name.startsWith('.')){
      const relative=resolve(path,'..',name);let file=relative;
      for(const suffix of ['.tsx','.ts']){try{await readFile(relative+suffix);file=relative+suffix;break}catch{}}
      target=await moduleUrl(file);
    }else target=import.meta.resolve(name);
    js=js.replaceAll(`"${name}"`,JSON.stringify(target)).replaceAll(`'${name}'`,JSON.stringify(target));
  }
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
const moduleUrl=importUi;
test('server-rendered discovery requires unanswered questions and explicit independent expectations',async()=>{
  const {default:BusinessDiscovery}=await import(await moduleUrl('apps/ui/src/components/BusinessDiscovery.tsx'));
  const html=renderToStaticMarkup(createElement(BusinessDiscovery,{state:{settings:{}},project:{id:'project-a',discovery:session},refresh:async()=>{},select:()=>{}}));
  expect(html).toContain('继续：确认范围与预期');
  expect(html).not.toContain('确认并保存项目规则');
  const {default:ProjectRuleCard}=await import(await moduleUrl('apps/ui/src/components/ProjectRuleCard.tsx'));
  const form=renderToStaticMarkup(createElement(ProjectRuleCard,{projectId:'project-a',session,collection:{revision:0,versions:[],readiness:[]}}));
  expect(form).toContain('规则预期核对 修改订单');
  expect(form).toContain('检查这项业务');
  expect(form).not.toContain('确认后的预期行为（每行一条）');
  expect(html).toContain('查看业务分析报告');
  expect(html).not.toContain('核对这项业务');
  expect(html).not.toContain('checked=""');
  expect(form).not.toContain('采用受控工单关闭契约');
});

test('server-rendered project rule library shows four readiness states and keeps pending versions blocked',async()=>{
  const {default:ProjectRuleCard}=await import(await moduleUrl('apps/ui/src/components/ProjectRuleCard.tsx'));
  const statuses=['reusable','generatable','needs_conditions','needs_capability'],versions=statuses.map((status,i)=>({...baseRule,id:`rule-${i}`,flow:`业务${i}`,confirmation:{status:i===3?'pending':'confirmed'}}));
  const collection={projectId:'project-a',revision:2,versions,selectedRule:ref(versions[0]),readiness:versions.map((v,i)=>({ruleRef:ref(v),status:statuses[i],missing:[{code:'VALIDATION_RESOURCE_GAP',detail:'缺少精确版本的独立验证资源'}]}))};
  const html=renderToStaticMarkup(createElement(ProjectRuleCard,{projectId:'project-a',collection,stage:'plan'}));
  for(const label of ['已有合格方案','可生成方案','缺少测试条件','缺少执行能力','业务预期待确认','缺少精确版本的独立验证资源'])expect(html).toContain(label);
  expect(html).not.toContain('选择此版本');expect(html).not.toContain('修订业务预期');expect(html).not.toContain('<textarea');
  const readOnly=renderToStaticMarkup(createElement(ProjectRuleCard,{projectId:'project-a',collection,stage:'plan',readOnly:true}));
  expect(readOnly).not.toContain('选择此版本（仅保存草稿）');
  expect(readOnly).not.toContain('修订业务预期');
  expect(readOnly).not.toContain('确认当前版本');
  expect(readOnly).not.toContain('已选为项目规则草稿');
});

test('unsaved rule semantics stay distinguishable from the persisted version being confirmed',async()=>{
  const module=await import(await moduleUrl('apps/ui/src/components/ProjectRuleCard.tsx'));
  expect(module.hasUnsavedRuleChanges,'dirty semantic edits must block persisted-version confirmation').toBeDefined();
  expect(module.hasUnsavedRuleChanges(baseRule,'仅所有者可修改订单',baseRule.answers,'')).toBe(false);
  expect(module.hasUnsavedRuleChanges(baseRule,'关闭后不可重开',baseRule.answers,'')).toBe(true);
  expect(module.hasUnsavedRuleChanges(baseRule,'仅所有者可修改订单',{'谁可以修改订单？':'管理员'},'')).toBe(true);
  expect(module.hasUnsavedRuleChanges(baseRule,'仅所有者可修改订单',baseRule.answers,'尚未保存的纠正说明')).toBe(true);
});

async function setupUi(page:any,{versions=[],statuses=[],step=versions.length?5:3,analysis=session}:{versions?:any[];statuses?:string[];step?:number;analysis?:any}={}){
  let server:Server;server=createServer(async(req,res)=>{try{const url=new URL(req.url??'/','http://local'),file=url.pathname.startsWith('/assets/')?join(resolve('apps/ui/dist'),url.pathname):resolve('apps/ui/dist/index.html');const bytes=await readFile(file);res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':'text/html');res.end(bytes)}catch{res.statusCode=404;res.end()}});
  await listenLoopback(server);
  const url=`http://127.0.0.1:${(server.address() as any).port}`,writes:any[]=[],store={revision:0,versions:structuredClone(versions),selectedRule:undefined as any},project={id:'project-a',name:'规则UI夹具',directory:'/fixture',sourceOnly:true,sourceRevision:0,discovery:analysis};
  const readiness=()=>store.versions.map((r:any,i:number)=>({ruleRef:ref(r),status:statuses[i]??'needs_capability',missing:[{code:'OBSERVATION_GAP',detail:'缺少可靠的订单状态查询'}]}));
  await page.route('**/api/**',async(route:any)=>{
    const request=route.request(),path=new URL(request.url()).pathname,body=request.postDataJSON();
    if(request.method()==='POST')writes.push({path,body});
    const reply=(value:any,status=200)=>route.fulfill({status,json:value});
    if(path==='/api/session')return reply({token:'synthetic-ui-token'});
    if(path==='/api/state')return reply({projectRules:{[project.id]:{projectId:project.id,...store,readiness:readiness()}},projects:[project],rules:[],runs:[],catalog:{matches:[]},settings:{model:'',hasKey:false,serviceUrl:'',remembered:false,connection:{status:'not_checked',code:''}}});
    if(path.endsWith('/discovery-scope'))return reply({revision:0,scope:{allowedPaths:['.'],excludedPaths:[],includeProjectTests:false,serviceUrl:'https://model.invalid'},snapshot:{files:[],sourceHash:'hash',indexIssues:[]}});
    if(path.endsWith('/journey'))return reply({revision:0,lastStep:step});
    if(path.endsWith('/rules')&&request.method()==='GET')return reply({projectId:project.id,...store,readiness:readiness()});
    if(request.method()==='POST'&&body.expectedRevision!==store.revision)return reply({error:'RULE_REVISION_CONFLICT'},409);
    if(path.endsWith('/confirm')){store.revision++;store.versions.push({...baseRule,answers:body.answers,expectedBehavior:body.expectedBehavior});return reply(store.versions.at(-1));}
    if(path.endsWith('/revise')){const old=store.versions[0];store.revision++;store.selectedRule=undefined;store.versions[0]={...old,version:old.version+1,contentHash:'hash-v2',expectedBehavior:body.expectedBehavior,answers:body.answers??old.answers,...(body.requirements?{requirements:body.requirements}:{}),confirmation:{status:'pending'},corrections:[{note:body.note,previousVersion:old.version,time:'2026-10-14'}]};return reply(store.versions[0]);}
    if(path.endsWith('/confirm-version')){store.revision++;store.versions[0]={...store.versions[0],version:store.versions[0].version+1,confirmation:{status:'confirmed'}};return reply(store.versions[0]);}
    if(path.endsWith('/selection')){store.revision++;store.selectedRule=body.ruleRef;return reply(store);}
    if(path.endsWith('/versions/1'))return reply(baseRule);
    return reply({error:'unexpected-fixture-request'},404);
  });
  await page.goto(url+`/?page=verify&step=${step}&project=project-a`);
  return {writes,store,project,async close(){await new Promise<void>(r=>{server.closeAllConnections();server.close(()=>r())})}};
}

for(const width of [1280,390])test(`completed analysis has one next step and an optional report at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});const x=await setupUi(page,{step:2});try{
  const view=page.locator('[data-page=project]');await expect(view.getByRole('button',{name:'继续：确认范围与预期',exact:true})).toBeVisible();
  await expect(view.getByRole('button',{name:'读取项目',exact:true})).toHaveCount(0);await expect(view.getByRole('heading',{name:'建议核对的业务',exact:true})).toHaveCount(0);
  await mkdir('output/recorded-ui-fixes-20261018/screenshots',{recursive:true});await page.screenshot({path:`output/recorded-ui-fixes-20261018/screenshots/analysis-${width}.png`,fullPage:true});
  await view.getByRole('button',{name:'查看业务分析报告',exact:true}).click();const report=page.getByRole('dialog',{name:'查看业务分析报告',exact:true});await expect(report).toContainText('当前源码允许任何人修改订单。');await expect(report.getByRole('button',{name:'核对这项业务'})).toHaveCount(0);await report.getByRole('button',{name:'关闭详情'}).click();
  await view.getByRole('button',{name:'继续：确认范围与预期',exact:true}).click();await expect(page.getByRole('heading',{name:'选择要检查的业务',exact:true})).toBeVisible();expect(x.writes.filter(v=>/discovery$|candidate$|run$/.test(v.path))).toHaveLength(0);
 }finally{await x.close();}
});

for(const width of [1280,390])test(`separate business sections remain readable at ${width}px`,async({page})=>{
 const analysis=structuredClone(session);analysis.result.suggestions=[{...suggestion,id:'submit',flow:'提交报名'},{...suggestion,id:'edit',flow:'修改显示姓名'}];
 await page.setViewportSize({width,height:1000});const x=await setupUi(page,{analysis,step:3});try{
  await page.getByRole('region',{name:'规则预期核对 修改显示姓名'}).getByRole('checkbox',{name:'检查修改显示姓名',exact:true}).check();
  await expect(page.getByRole('region',{name:'规则预期核对 提交报名'})).toBeVisible();await expect(page.getByRole('region',{name:'规则预期核对 修改显示姓名'})).toBeVisible();
  await expect(page.getByText('AI建议已预填，可直接修改；没有足够依据的问题仍需补充。请逐项核对后确认。',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await mkdir('output/recorded-ui-fixes-20261018/screenshots',{recursive:true});await page.screenshot({path:`output/recorded-ui-fixes-20261018/screenshots/business-boundaries-${width}.png`,fullPage:true});expect(x.writes).toHaveLength(0);
 }finally{await x.close();}
});

for(const reusable of [false,true])test(`one explicit action preserves the exact business confirmation with ${reusable?'a published plan':'new capability'}`,async({page})=>{
 const x=await setupUi(page,{versions:[baseRule],step:5});
 const p=x.project as any;p.sourceOnly=false;p.supported=true;p.environmentHash='env';p.environmentCurrent=true;p.environmentConfirmed=true;p.accounts=[];p.data={count:2,seedVersion:'v1'};p.mapping={id:'fixture',version:1};p.preparation={status:'ready',environmentHash:'env'};p.workflow={revision:0,flow:'submit',flows:{}};p.executableRules=[];p.catalog={matches:reusable?[{ruleHash:'compiled-hash',ref:{id:'qualified-plan',version:'1.0.0',hash:'published-hash'},applicable:[],excluded:[],instructions:'使用已确认预期'}]:[]};
 const runtimeWrites:any[]=[];
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON();if(path.endsWith('/compile')){runtimeWrites.push({path,body});p.executableRules=[{id:baseRule.id,hash:'compiled-hash',ruleRef:ref(baseRule),expectedChanges:baseRule.expectedBehavior,invariants:[]}];await route.fulfill({json:{status:'compiled'}});return;}if(path.endsWith('/workflow')&&route.request().method()==='POST'){runtimeWrites.push({path,body});p.workflow={revision:body.revision+1,flow:body.flow,flows:{[body.flow]:body.choices}};await route.fulfill({json:p.workflow});return;}await route.fallback();});
 try{
  await page.reload();const card=page.getByRole('article',{name:'检查准备 修改订单'});await expect(card.getByRole('button',{name:'准备并加入本轮检查'})).toBeEnabled();expect(runtimeWrites).toHaveLength(0);
  await card.getByRole('button',{name:'准备并加入本轮检查'}).click();await expect(card).toContainText('已加入本轮检查');if(!reusable)await expect(page.getByRole('button',{name:'调用模型创建检查方案',exact:true})).toBeDisabled();
  expect(runtimeWrites.map(w=>w.path.split('/').at(-1))).toEqual(['compile','workflow']);expect(runtimeWrites[0].body.ruleRef).toEqual(ref(baseRule));expect(p.workflow.flows.submit[baseRule.id]).toMatchObject({enabled:true,confirmed:true,ruleHash:'compiled-hash',environmentHash:'env',...(reusable?{version:'published-hash'}:{})});
  expect(x.writes.some(w=>/candidate$|run$|selection$/.test(w.path))).toBe(false);await expect(card.getByRole('button',{name:'修订业务预期'})).toHaveCount(0);await expect(card.getByRole('textbox')).toHaveCount(0);
  await page.screenshot({path:'output/recorded-ui-fixes-20261018/screenshots/preparation-1280.png',fullPage:true});
 }finally{await x.close();}
});

test('changed project files recover through reinspection and fresh consent before real environment preparation',async({page})=>{
 const {cp,mkdir,writeFile}=await import('node:fs/promises');const directory=join(process.cwd(),'.local-data/recorded-ui-browser',randomUUID()),source=join(directory,'source');await mkdir(directory,{recursive:true});await cp(join(process.cwd(),'samples/registration'),source,{recursive:true});
 const host=await startWorkbench({directory:join(directory,'host'),registryDirectory:join(directory,'registry'),port:0});
 const request=async(path:string,body?:any)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await r.json();expect(r.ok,JSON.stringify(value)).toBe(true);return value;};
 try{
  const {projectId}=await request('/projects',{directory:source,accountMode:'automatic'});let p=(await request('/state')).projects[0];await request(`/projects/${projectId}/confirm`,{environment:true,environmentHash:p.environmentHash});await request(`/projects/${projectId}/prepare`,{});
  await writeFile(join(source,'README.md'),'changed test source documentation');await page.goto(host.url+`/?step=4&project=${projectId}`);
  await expect(page.getByRole('button',{name:'重新检查项目',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'执行环境检查',exact:true})).toBeDisabled();await expect(page.getByText('最近检查通过；本次执行前仍会重新核对凭据与环境。',{exact:true})).toHaveCount(0);
  await mkdir('output/recorded-ui-fixes-20261018/screenshots',{recursive:true});await page.screenshot({path:'output/recorded-ui-fixes-20261018/screenshots/stale-environment.png',fullPage:true});
  await page.getByRole('button',{name:'重新检查项目',exact:true}).click();await expect(page.getByRole('checkbox',{name:'我同意在独立测试副本中创建用户并重置测试数据'})).not.toBeChecked();
  const current=(await request('/state')).projects[0];expect(current.environmentCurrent).toBe(true);expect(current.environmentConfirmed).toBe(false);expect(current.accounts.map((a:any)=>a.userId)).toEqual(p.accounts.map((a:any)=>a.userId));
  await page.getByRole('checkbox',{name:'我同意在独立测试副本中创建用户并重置测试数据'}).check();await page.getByRole('button',{name:'执行环境检查',exact:true}).click();await expect(page.getByText('最近检查通过；本次执行前仍会重新核对凭据与环境。',{exact:true})).toBeVisible();
  p=(await request('/state')).projects[0];expect(p.preparation.status).toBe('ready');expect(p.preparation.verifiedAccounts).toBe(2);await page.screenshot({path:'output/recorded-ui-fixes-20261018/screenshots/recovered-environment.png',fullPage:true});
 }finally{await host.close();}
});
for(const width of [1280,390])test(`Chinese AI answers prefill once and preserve edits across steps at ${width}px`,async({page})=>{
 const q='Who may edit?',analysis=structuredClone(session);
 analysis.result.translations={[q]:'谁可以修改订单？','Only the owner may edit':'仅所有者可修改订单。','Code checks ownership':'源码检查工单归属。'};
 analysis.result.suggestions=[{...suggestion,openQuestions:[q],suggestedAnswers:{[q]:'建议仅订单所有者可以修改，待你核对。'},expectations:[{...suggestion.expectations[0],text:'Only the owner may edit'}],facts:[{text:'Code checks ownership',sourceRefs:[]}]}];
 await page.setViewportSize({width,height:900});const x=await setupUi(page,{analysis});
 try{
  const form=page.getByRole('region',{name:'规则预期核对 修改订单'});await form.getByLabel('检查修改订单',{exact:true}).check();
  await form.getByText('需要你核对的1个问题',{exact:true}).click();
  const answer=form.getByLabel('谁可以修改订单？',{exact:true});await expect(answer).toHaveValue('建议仅订单所有者可以修改，待你核对。');
  await expect(form.getByLabel('确认后的预期行为（每行一条）')).toHaveValue('仅所有者可修改订单。');
  await expect(form.getByLabel('已核对关键问题与业务预期')).not.toBeChecked();await expect(form.getByRole('button',{name:'确认并保存项目规则'})).toBeDisabled();expect(x.writes).toHaveLength(0);
  await form.getByText('核对建议的源码事实与候选预期',{exact:true}).click();await expect(form).toContainText('源码检查工单归属。');await expect(form).not.toContainText(q);
  await mkdir('output/recorded-ui-fixes-20261018/browser/business-ai-prefill-20261016',{recursive:true});await page.screenshot({path:`output/recorded-ui-fixes-20261018/browser/business-ai-prefill-20261016/prefill-${width}.png`,fullPage:true});
  await answer.fill('');await form.getByLabel('检查修改订单',{exact:true}).uncheck();await form.getByLabel('检查修改订单',{exact:true}).check();await expect(answer).toHaveValue('');await expect(form.getByLabel('已核对关键问题与业务预期')).toBeDisabled();await form.getByText('需要你核对的1个问题',{exact:true}).click();
  await answer.fill('人工修改：仅所有者可修改');await goStep(page,4);await goStep(page,3);await expect(answer).toHaveValue('人工修改：仅所有者可修改');await form.getByText('需要你核对的1个问题',{exact:true}).click();
  await form.getByLabel('已核对关键问题与业务预期').check();await answer.fill('最终核对：仅所有者可修改');await expect(form.getByLabel('已核对关键问题与业务预期')).not.toBeChecked();
  await form.getByLabel('已核对关键问题与业务预期').check();await form.getByRole('button',{name:'确认并保存项目规则'}).click();
  await expect(page.getByRole('article',{name:'已保存业务 修改订单'})).toBeVisible();
  expect(x.writes.filter(v=>v.path.endsWith('/confirm'))[0].body.answers).toEqual({[q]:'最终核对：仅所有者可修改'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await x.close();}
});
for(const width of [1280,390])test(`explicit owner expectation is saved without execution at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const x=await setupUi(page);
  try{
    const form=page.getByRole('region',{name:'规则预期核对 修改订单'});
    await expect(form).toBeVisible();await mkdir('output/recorded-ui-fixes-20261018/browser/business-confirmation-20261016',{recursive:true});await page.screenshot({path:`output/recorded-ui-fixes-20261018/browser/business-confirmation-20261016/business-${width}.png`,fullPage:true});await expect(form.getByRole('textbox')).toHaveCount(0);await form.getByLabel('检查修改订单',{exact:true}).check();await form.getByText('核对建议的源码事实与候选预期',{exact:true}).click();await expect(form.getByText('源码事实：当前源码允许任何人修改订单。',{exact:true})).toBeVisible();await expect(form.getByText('文档预期 · 待确认：仅所有者可修改订单。',{exact:true})).toBeVisible();
    expect(x.writes).toHaveLength(0);await expect(form.getByLabel('已核对关键问题与业务预期')).not.toBeChecked();await expect(form.getByRole('button',{name:'确认并保存项目规则'})).toBeDisabled();
    await form.getByText('需要你核对的1个问题',{exact:true}).click();await form.getByLabel('谁可以修改订单？',{exact:true}).fill('仅所有者');await form.getByLabel('确认后的预期行为（每行一条）').fill('仅所有者可修改订单');await form.getByLabel('已核对关键问题与业务预期').check();await form.getByRole('button',{name:'确认并保存项目规则'}).click();
    await expect(page.getByRole('article',{name:'已保存业务 修改订单'})).toContainText('已确认并保存');await expect(page.getByRole('button',{name:'查看历史版本'})).toBeHidden();await expect(form).toHaveCount(0);await goStep(page,5);const saved=page.getByRole('article',{name:'检查准备 修改订单'});await expect(saved).toContainText('业务预期已确认');await expect(saved.getByRole('button',{name:'选择此版本（仅保存草稿）'})).toHaveCount(0);
    expect(x.writes.filter(v=>v.path.includes('/rules/')).map(v=>v.path.split('/').at(-1))).toEqual(['confirm']);expect(x.writes[0].body.confirmed).toBe(true);expect(x.writes.some(v=>v.path.endsWith('/selection'))).toBe(false);await mkdir('output/recorded-ui-fixes-20261018/browser/business-confirmation-20261016',{recursive:true});await page.screenshot({path:`output/recorded-ui-fixes-20261018/browser/business-confirmation-20261016/plan-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{await x.close()}
});
test('editing saved business confirms a new version and preserves the old history',async({page})=>{
  const x=await setupUi(page,{versions:[baseRule],step:3});try{
    const card=page.getByRole('article',{name:'已保存业务 修改订单'});await card.getByRole('button',{name:'编辑',exact:true}).click();await card.getByLabel('确认后的预期行为（每行一条）').fill('订单关闭后不得重新打开');
    await expect(card.getByRole('button',{name:'确认并保存',exact:true})).toBeDisabled();await card.getByLabel('已核对关键问题与业务预期').check();await card.getByRole('button',{name:'确认并保存',exact:true}).click();
    await expect(card).toContainText('已确认并保存');await expect(card.getByRole('button',{name:'编辑',exact:true})).toBeVisible();expect(x.store.versions[0].version).toBe(3);expect(x.writes.map(v=>v.path.split('/').at(-1))).toEqual(['revise','confirm-version']);
    await card.getByText('来源与历史记录',{exact:true}).click();await card.getByLabel('历史版本').selectOption('1');await card.getByRole('button',{name:'查看历史版本'}).click();await expect(card.getByRole('region',{name:'历史规则 v1'})).toContainText('仅所有者可修改订单');
  }finally{await x.close()}
});
test('revision conflict preserves answers and expects another explicit confirmation',async({page})=>{
  const x=await setupUi(page);try{
    const form=page.getByRole('region',{name:'规则预期核对 修改订单'});await expect(form).toBeVisible();await form.getByLabel('检查修改订单',{exact:true}).check();x.store.revision=1;await form.getByText('需要你核对的1个问题',{exact:true}).click();await form.getByLabel('谁可以修改订单？',{exact:true}).fill('仅所有者');await form.getByLabel('确认后的预期行为（每行一条）').fill('禁止越权');await form.getByLabel('已核对关键问题与业务预期').check();await form.getByRole('button',{name:'确认并保存项目规则'}).click();
    await expect(page.getByRole('alert').filter({hasText:'输入已保留'})).toBeVisible();await expect(form.getByLabel('谁可以修改订单？',{exact:true})).toHaveValue('仅所有者');await page.getByRole('button',{name:'核对最新版本（保留本页输入）'}).click();await expect(form.getByLabel('确认后的预期行为（每行一条）')).toHaveValue('禁止越权');await expect(form.getByLabel('已核对关键问题与业务预期')).not.toBeChecked();expect(x.writes).toHaveLength(1);
  }finally{await x.close()}
});
test('all four readiness states display their gaps without generating or running',async({page})=>{
  const statuses=['reusable','generatable','needs_conditions','needs_capability'],versions=statuses.map((s,i)=>({...baseRule,id:`rule-${i}`,flow:`业务${i}`}));const x=await setupUi(page,{versions,statuses});try{
    for(const label of ['已有合格方案','可生成方案','缺少测试条件','缺少执行能力'])await expect(page.locator('div[data-page=verify]').getByText(label,{exact:true})).toBeVisible();await expect(page.locator('div[data-page=verify]').getByText('缺少可靠的订单状态查询',{exact:true})).toHaveCount(4);expect(x.writes).toHaveLength(0);
  }finally{await x.close()}
});

test('an edit conflict keeps local answers and clears the confirmation after loading another version',async({page})=>{
  const x=await setupUi(page,{versions:[baseRule],step:3});try{
    const card=page.getByRole('article',{name:'已保存业务 修改订单'});await card.getByRole('button',{name:'编辑',exact:true}).click();await card.getByLabel('确认后的预期行为（每行一条）').fill('本页核对：关闭后不可重开');await card.getByText('修改原因与高级设置（选填）',{exact:true}).click();await card.getByLabel('修改原因（选填）').fill('本页纠正说明');
    x.store.revision=1;x.store.versions[0]={...baseRule,version:2,contentHash:'other-tab-hash',expectedBehavior:['另一页面的新预期'],confirmation:{status:'pending'}};
    await card.getByLabel('已核对关键问题与业务预期').check();await card.getByRole('button',{name:'确认并保存',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'输入已保留'})).toBeVisible();await page.getByRole('button',{name:'核对最新版本（保留本页输入）'}).click();
    await expect(card.getByLabel('确认后的预期行为（每行一条）')).toHaveValue('本页核对：关闭后不可重开');await expect(card.getByLabel('修改原因（选填）')).toHaveValue('本页纠正说明');await expect(card.getByLabel('已核对关键问题与业务预期')).not.toBeChecked();await expect(card.getByRole('button',{name:'确认并保存',exact:true})).toBeDisabled();expect(x.writes).toHaveLength(1);
  }finally{await x.close()}
});
test('cancelling an edit restores the saved pending version without confirming it',async({page})=>{
  const pending={...baseRule,confirmation:{status:'pending'}};const x=await setupUi(page,{versions:[pending],step:3});try{
    const card=page.getByRole('article',{name:'已保存业务 修改订单'});await card.getByLabel('已核对关键问题与业务预期').check();await card.getByRole('button',{name:'编辑',exact:true}).click();await card.getByLabel('确认后的预期行为（每行一条）').fill('未保存的业务要求');await card.getByRole('button',{name:'取消编辑'}).click();
    await expect(card).toContainText('仅所有者可修改订单');await expect(card.getByLabel('已核对关键问题与业务预期')).not.toBeChecked();await expect(card.getByRole('button',{name:'确认并保存',exact:true})).toBeDisabled();expect(x.writes).toHaveLength(0);
    await card.getByLabel('已核对关键问题与业务预期').check();await expect(card.getByRole('button',{name:'确认并保存',exact:true})).toBeEnabled();expect(x.writes).toHaveLength(0);
  }finally{await x.close()}
});

test('03 preserves selected business input across step changes without binding or confirming',async({page})=>{
 const x=await setupUi(page);try{
  const form=page.getByRole('region',{name:'规则预期核对 修改订单'});await form.getByLabel('检查修改订单',{exact:true}).check();await form.getByLabel('确认后的预期行为（每行一条）').fill('仅本人可以修改标题，其他字段保持不变');
  await goStep(page,4);await goStep(page,3);await expect(form.getByLabel('检查修改订单',{exact:true})).toBeChecked();await expect(form.getByLabel('确认后的预期行为（每行一条）')).toHaveValue('仅本人可以修改标题，其他字段保持不变');
  expect(x.writes.filter(v=>v.path.includes('/rules/'))).toHaveLength(0);await expect(page.getByLabel('采用受控工单关闭契约')).toHaveCount(0);
 }finally{await x.close()}
});

test('unified editing keeps controlled closing bindings opt-in and rejects them for title editing',async({page})=>{
 const contract=await import('@website-verification/contracts/status-transition');const title={...baseRule,flow:'Update ticket title only',expectedBehavior:['仅更新标题，状态保持不变。']};
 const x=await setupUi(page,{versions:[title],step:3});try{
  const card=page.getByRole('article',{name:'已保存业务 修改工单标题'});await card.getByRole('button',{name:'编辑',exact:true}).click();await card.getByText('修改原因与高级设置（选填）',{exact:true}).click();await expect(card.getByLabel('采用受控工单关闭契约')).toHaveCount(0);expect(x.writes).toHaveLength(0);
 }finally{await x.close()}
 const closing={...baseRule,flow:'关闭工单',expectedBehavior:contract.statusTransitionBehavior};const y=await setupUi(page,{versions:[closing],step:3});try{
  const card=page.getByRole('article',{name:'已保存业务 关闭工单'});await card.getByRole('button',{name:'编辑',exact:true}).click();await card.getByText('修改原因与高级设置（选填）',{exact:true}).click();await card.getByLabel('采用受控工单关闭契约').check();await card.getByLabel('修改原因（选填）').fill('为已确认关闭预期绑定能力');await card.getByLabel('已核对关键问题与业务预期').check();await card.getByRole('button',{name:'确认并保存',exact:true}).click();await expect(card.getByRole('button',{name:'编辑',exact:true})).toBeVisible();expect(y.store.versions[0].version).toBe(3);expect(y.writes[0].body.expectedBehavior).toEqual(contract.statusTransitionBehavior);expect(y.writes[0].body.requirements).toEqual(contract.statusTransitionRequirements);expect(y.writes).toHaveLength(2);
 }finally{await y.close()}
});
