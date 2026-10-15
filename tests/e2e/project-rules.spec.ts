import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer,type Server} from 'node:http';
import {join,resolve,extname} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import ts from 'typescript';

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
  expect(html).toContain('前往03 确认业务与目标');
  expect(html).not.toContain('确认并保存项目规则');
  const {default:ProjectRuleCard}=await import(await moduleUrl('apps/ui/src/components/ProjectRuleCard.tsx'));
  const form=renderToStaticMarkup(createElement(ProjectRuleCard,{projectId:'project-a',session,collection:{revision:0,versions:[],readiness:[]}}));
  expect(form).toContain('规则预期核对 修改订单');
  expect(form).toContain('确认后的预期行为（每行一条）');
  expect(html).toContain('当前源码允许任何人修改订单。');
  expect(html).toContain('仅所有者可修改订单。');
  expect(html).not.toContain('checked=""');
  expect(form).toMatch(/disabled=""[^>]*>确认并保存项目规则/);
});

test('server-rendered project rule library shows four readiness states and keeps pending versions blocked',async()=>{
  const {default:ProjectRuleCard}=await import(await moduleUrl('apps/ui/src/components/ProjectRuleCard.tsx'));
  const statuses=['reusable','generatable','needs_conditions','needs_capability'],versions=statuses.map((status,i)=>({...baseRule,id:`rule-${i}`,flow:`业务${i}`,confirmation:{status:i===3?'pending':'confirmed'}}));
  const collection={projectId:'project-a',revision:2,versions,selectedRule:ref(versions[0]),readiness:versions.map((v,i)=>({ruleRef:ref(v),status:statuses[i],missing:[{code:'VALIDATION_RESOURCE_GAP',detail:'缺少精确版本的独立验证资源'}]}))};
  const html=renderToStaticMarkup(createElement(ProjectRuleCard,{projectId:'project-a',collection}));
  for(const label of ['已有合格方案','可生成方案','缺少测试条件','缺少执行能力','已选为项目规则草稿','待重新确认','缺少精确版本的独立验证资源'])expect(html).toContain(label);
  expect(html).toMatch(/disabled=""[^>]*>确认当前版本/);
  const readOnly=renderToStaticMarkup(createElement(ProjectRuleCard,{projectId:'project-a',collection,readOnly:true}));
  expect(readOnly).not.toContain('选择此版本（仅保存草稿）');
  expect(readOnly).not.toContain('修订业务预期');
  expect(readOnly).not.toContain('确认当前版本');
  expect(readOnly).toContain('已选为项目规则草稿');
});

test('unsaved rule semantics stay distinguishable from the persisted version being confirmed',async()=>{
  const module=await import(await moduleUrl('apps/ui/src/components/ProjectRuleCard.tsx'));
  expect(module.hasUnsavedRuleChanges,'dirty semantic edits must block persisted-version confirmation').toBeDefined();
  expect(module.hasUnsavedRuleChanges(baseRule,'仅所有者可修改订单',baseRule.answers,'')).toBe(false);
  expect(module.hasUnsavedRuleChanges(baseRule,'关闭后不可重开',baseRule.answers,'')).toBe(true);
  expect(module.hasUnsavedRuleChanges(baseRule,'仅所有者可修改订单',{'谁可以修改订单？':'管理员'},'')).toBe(true);
  expect(module.hasUnsavedRuleChanges(baseRule,'仅所有者可修改订单',baseRule.answers,'尚未保存的纠正说明')).toBe(true);
});

async function setupUi(page:any,{versions=[],statuses=[]}:{versions?:any[];statuses?:string[]}={}){
  let server:Server;server=createServer(async(req,res)=>{try{const url=new URL(req.url??'/','http://local'),file=url.pathname.startsWith('/assets/')?join(resolve('apps/ui/dist'),url.pathname):resolve('apps/ui/dist/index.html');const bytes=await readFile(file);res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':'text/html');res.end(bytes)}catch{res.statusCode=404;res.end()}});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${(server.address() as any).port}`,writes:any[]=[],store={revision:0,versions:structuredClone(versions),selectedRule:undefined as any},project={id:'project-a',name:'规则UI夹具',directory:'/fixture',sourceOnly:true,sourceRevision:0,discovery:session};
  const readiness=()=>store.versions.map((r:any,i:number)=>({ruleRef:ref(r),status:statuses[i]??'needs_capability',missing:[{code:'OBSERVATION_GAP',detail:'缺少可靠的订单状态查询'}]}));
  await page.route('**/api/**',async(route:any)=>{
    const request=route.request(),path=new URL(request.url()).pathname,body=request.postDataJSON();
    if(request.method()==='POST')writes.push({path,body});
    const reply=(value:any,status=200)=>route.fulfill({status,json:value});
    if(path==='/api/session')return reply({token:'synthetic-ui-token'});
    if(path==='/api/state')return reply({projectRules:{[project.id]:{projectId:project.id,...store,readiness:readiness()}},projects:[project],rules:[],runs:[],catalog:{matches:[]},settings:{model:'',hasKey:false,serviceUrl:'',remembered:false,connection:{status:'not_checked',code:''}}});
    if(path.endsWith('/discovery-scope'))return reply({revision:0,scope:{allowedPaths:['.'],excludedPaths:[],includeProjectTests:false,serviceUrl:'https://model.invalid'},snapshot:{files:[],sourceHash:'hash',indexIssues:[]}});
    if(path.endsWith('/rules')&&request.method()==='GET')return reply({projectId:project.id,...store,readiness:readiness()});
    if(request.method()==='POST'&&body.expectedRevision!==store.revision)return reply({error:'RULE_REVISION_CONFLICT'},409);
    if(path.endsWith('/confirm')){store.revision++;store.versions.push({...baseRule,answers:body.answers,expectedBehavior:body.expectedBehavior});return reply(store.versions.at(-1));}
    if(path.endsWith('/revise')){const old=store.versions[0];store.revision++;store.selectedRule=undefined;store.versions[0]={...old,version:old.version+1,contentHash:'hash-v2',expectedBehavior:body.expectedBehavior,answers:body.answers??old.answers,confirmation:{status:'pending'},corrections:[{note:body.note,previousVersion:old.version,time:'2026-10-14'}]};return reply(store.versions[0]);}
    if(path.endsWith('/confirm-version')){store.revision++;store.versions[0]={...store.versions[0],version:store.versions[0].version+1,confirmation:{status:'confirmed'}};return reply(store.versions[0]);}
    if(path.endsWith('/selection')){store.revision++;store.selectedRule=body.ruleRef;return reply(store);}
    if(path.endsWith('/versions/1'))return reply(baseRule);
    return reply({error:'unexpected-fixture-request'},404);
  });
  await page.goto(url+'/?page=verify&step=3&project=project-a');
  return {writes,store,async close(){await new Promise<void>(r=>{server.closeAllConnections();server.close(()=>r())})}};
}
for(const width of [1280,390])test(`explicit owner expectation is saved without execution at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const x=await setupUi(page);
  try{
    const form=page.getByRole('region',{name:'规则预期核对 修改订单'});
    await expect(form).toBeVisible();await form.getByText('核对建议的源码事实与候选预期',{exact:true}).click();await expect(form.getByText('当前源码允许任何人修改订单。',{exact:true})).toBeVisible();await expect(form.getByText('仅所有者可修改订单。',{exact:true})).toBeVisible();
    expect(x.writes).toHaveLength(0);await expect(form.getByLabel('已核对关键问题与业务预期')).not.toBeChecked();await expect(form.getByRole('button',{name:'确认并保存项目规则'})).toBeDisabled();
    await form.getByLabel('谁可以修改订单？',{exact:true}).fill('仅所有者');await form.getByLabel('确认后的预期行为（每行一条）').fill('仅所有者可修改订单');await form.getByLabel('已核对关键问题与业务预期').check();await form.getByRole('button',{name:'确认并保存项目规则'}).click();
    await expect(page.getByRole('heading',{name:'项目规则版本库'})).toBeVisible();const saved=page.getByRole('article',{name:'项目规则 修改订单 v1'});await expect(saved).toContainText('已由你确认');await saved.getByRole('button',{name:'选择此版本（仅保存草稿）'}).click();await expect(saved).toContainText('已选为项目规则草稿');
    expect(x.writes.map(v=>v.path.split('/').at(-1))).toEqual(['confirm','selection']);expect(x.writes[0].body.confirmed).toBe(true);expect(x.writes[1].body.ruleRef).toEqual(ref(x.store.versions[0]));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{await x.close()}
});
test('revision clears confirmation, preserves old version and requires explicit reconfirmation',async({page})=>{
  const x=await setupUi(page,{versions:[baseRule]});try{
    const card=page.getByRole('article',{name:'项目规则 修改订单 v1'});await card.getByRole('button',{name:'修订业务预期'}).click();await card.getByLabel('修订后的预期行为（每行一条）').fill('订单关闭后不得重新打开');await card.getByLabel('纠正说明').fill('按需求核对状态限制');await card.getByRole('button',{name:'保存修订（清除确认）'}).click();
    const revised=page.getByRole('article',{name:'项目规则 修改订单 v2'});await expect(revised).toContainText('待重新确认');await expect(revised.getByRole('button',{name:'选择此版本（仅保存草稿）'})).toBeDisabled();await revised.getByText('历史版本',{exact:true}).first().click();await revised.getByLabel('历史版本').selectOption('1');await revised.getByRole('button',{name:'查看历史版本'}).click();await expect(revised.getByRole('region',{name:'历史规则 v1'})).toContainText('仅所有者可修改订单');
    await revised.getByLabel('已核对修订后的业务预期').check();await revised.getByRole('button',{name:'确认当前版本'}).click();await expect(page.getByRole('article',{name:'项目规则 修改订单 v3'})).toContainText('已由你确认');expect(x.writes.map(v=>v.path.split('/').at(-1))).toEqual(['revise','confirm-version']);
  }finally{await x.close()}
});
test('revision conflict preserves answers and expects another explicit confirmation',async({page})=>{
  const x=await setupUi(page);try{
    const form=page.getByRole('region',{name:'规则预期核对 修改订单'});await expect(form).toBeVisible();x.store.revision=1;await form.getByLabel('谁可以修改订单？',{exact:true}).fill('仅所有者');await form.getByLabel('确认后的预期行为（每行一条）').fill('禁止越权');await form.getByLabel('已核对关键问题与业务预期').check();await form.getByRole('button',{name:'确认并保存项目规则'}).click();
    await expect(page.getByRole('alert').filter({hasText:'输入已保留'})).toBeVisible();await expect(form.getByLabel('谁可以修改订单？',{exact:true})).toHaveValue('仅所有者');await page.getByRole('button',{name:'核对最新版本（保留本页输入）'}).click();await expect(form.getByLabel('确认后的预期行为（每行一条）')).toHaveValue('禁止越权');await expect(form.getByLabel('已核对关键问题与业务预期')).not.toBeChecked();expect(x.writes).toHaveLength(1);
  }finally{await x.close()}
});
test('all four readiness states display their gaps without generating or running',async({page})=>{
  const statuses=['reusable','generatable','needs_conditions','needs_capability'],versions=statuses.map((s,i)=>({...baseRule,id:`rule-${i}`,flow:`业务${i}`}));const x=await setupUi(page,{versions,statuses});try{
    for(const label of ['已有合格方案','可生成方案','缺少测试条件','缺少执行能力'])await expect(page.locator('div[data-page=verify]').getByText(label,{exact:true})).toBeVisible();await expect(page.locator('div[data-page=verify]').getByText('缺少可靠的订单状态查询',{exact:true})).toHaveCount(4);expect(x.writes).toHaveLength(0);
  }finally{await x.close()}
});

test('revision conflict keeps local correction when another tab appends a version',async({page})=>{
  const x=await setupUi(page,{versions:[baseRule]});try{
    const card=page.getByRole('article',{name:'项目规则 修改订单 v1'});await card.getByRole('button',{name:'修订业务预期'}).click();await card.getByLabel('修订后的预期行为（每行一条）').fill('本页核对：关闭后不可重开');await card.getByLabel('纠正说明').fill('本页纠正说明');
    x.store.revision=1;x.store.versions[0]={...baseRule,version:2,contentHash:'other-tab-hash',expectedBehavior:['另一页面的新预期'],confirmation:{status:'pending'}};
    await card.getByRole('button',{name:'保存修订（清除确认）'}).click();await expect(page.getByRole('alert').filter({hasText:'输入已保留'})).toBeVisible();await page.getByRole('button',{name:'核对最新版本（保留本页输入）'}).click();
    const latest=page.getByRole('article',{name:'项目规则 修改订单 v2'});await expect(latest.getByLabel('修订后的预期行为（每行一条）')).toHaveValue('本页核对：关闭后不可重开');await expect(latest.getByLabel('纠正说明')).toHaveValue('本页纠正说明');await expect(latest.getByRole('button',{name:'确认当前版本'})).toBeDisabled();expect(x.writes).toHaveLength(1);
  }finally{await x.close()}
});

test('pending rule cannot be confirmed with collapsed unsaved edits',async({page})=>{
  const pending={...baseRule,confirmation:{status:'pending'}};const x=await setupUi(page,{versions:[pending]});try{
    const card=page.getByRole('article',{name:'项目规则 修改订单 v1'});await card.getByLabel('已核对修订后的业务预期').check();await card.getByRole('button',{name:'修订业务预期'}).click();await card.getByLabel('修订后的预期行为（每行一条）').fill('关闭后不可重开');await card.getByLabel('纠正说明').fill('未保存的业务修订');await card.getByRole('button',{name:'收起修订（保留输入）'}).click();
    await expect(card.getByLabel('已核对修订后的业务预期')).not.toBeChecked();await expect(card.getByRole('button',{name:'确认当前版本'})).toBeDisabled();await expect(card.getByText('有尚未保存的修订。请先保存修订或明确放弃，再确认当前版本。',{exact:true})).toBeVisible();expect(x.writes).toHaveLength(0);
    await card.getByRole('button',{name:'放弃未保存修订'}).click();await card.getByLabel('已核对修订后的业务预期').check();await expect(card.getByRole('button',{name:'确认当前版本'})).toBeEnabled();expect(x.writes).toHaveLength(0);
  }finally{await x.close()}
});
