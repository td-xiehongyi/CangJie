import {goStep} from './workflow-steps';
import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
// @ts-ignore local deterministic fixture
import {setupDiscovery,action,read,overview} from '../support/discovery.mjs';
// @ts-ignore compiled host
import {startWorkbench} from '../../apps/host/dist/api.js';
// @ts-ignore compiled persistence for an interrupted historical response fixture
import {DiscoveryStore} from '../../apps/host/dist/discovery/store.js';
async function setup(respond:(p:any,n:number)=>any){
  const cleanup:(()=>any)[]=[],x=await setupDiscovery({after:(f:()=>any)=>cleanup.push(f)},respond);
  const directory=join(x.directory,'ui-host'),host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  const request=async(path:string,body?:unknown)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});expect(r.ok).toBe(true);return r.json()};
  await request('/settings',{serviceUrl:x.config.serviceUrl,model:'deterministic-ui-discovery',key:'synthetic-ui-discovery-key',remember:false});
  return {...x,host,request,async close(){await host.close();for(const fn of cleanup.reverse())await fn()}};
}
const complete=(p:any,_n?:number)=>{const result=overview(p.files);Object.assign(result.result.suggestions[0],{preconditions:['未付款订单'],exceptions:['所有者权限待确认'],stateChanges:['取消后释放库存']});return JSON.parse(JSON.stringify(result),(key,value)=>key==='sourceRefs'?value.map((ref:any)=>p.input.knownSourceRefs.findIndex((known:any)=>known.path===ref.path)):value);};

test('saved model response restores a draft locally after deadline and without a key',async({page})=>{
 const x=await setup(complete);
 try{
  const p=await x.request('/source-projects',{directory:x.root});
  const material=await x.request('/projects/'+p.id+'/discovery-input',{expectedRevision:p.revision,mode:'automatic',prompt:''});
  const analysis=await x.request('/projects/'+p.id+'/discovery',{confirmed:true,scopeHash:p.scope.scopeHash,expectedRevision:p.revision,requestId:crypto.randomUUID(),input:{mode:'automatic',prompt:'',manifestHash:material.manifestHash}});
  await expect.poll(async()=> (await x.request('/discovery/'+analysis.id)).status).toBe('completed');
  const store=new DiscoveryStore(join(x.directory,'ui-host','discovery')),record=await store.get(analysis.id),raw=structuredClone(record.session.audit.at(-1).response);
  for(const suggestion of raw.result.suggestions)for(const field of ['preconditions','exceptions','stateChanges'])delete suggestion[field];
  record.session.status='failed';record.session.pendingResponse=raw;record.session.unresolved=['INVALID_DISCOVERY_OUTPUT'];delete record.session.result;
  record.session.budget.startedAt=Date.now()-record.preset.deadlineMs-1;await store.save(record,record.session.revision);
  const budget=record.session.budget;await x.request('/settings/clear',{});
  await page.goto(x.host.url+`/?page=project&step=2&project=${p.id}`);
  await page.getByRole('button',{name:'恢复已保存的业务草稿（不调用模型）',exact:true}).click();
  await expect(page.getByRole('heading',{name:'业务草稿',exact:true})).toBeVisible();
  const done=await x.request('/discovery/'+analysis.id);expect(done.budget).toEqual(budget);expect(x.requests).toHaveLength(1);
  await expect(page.getByText(/部分前置条件、异常或状态变化未提供/)).toBeVisible();
  await page.screenshot({path:'output/analysis-entry-20261016/local-draft-recovery.png',fullPage:true});
 }finally{await x.close()}
});
for(const width of [1280,390])test(`source-only discovery shows real citations and pending project recommendations at ${width}px`,async({page})=>{
  const x=await setup(complete);
  try{
    await page.setViewportSize({width,height:900});await page.goto(x.host.url);
    await page.getByRole('textbox',{name:'项目目录',exact:true}).fill(x.root);
    await page.getByRole('button',{name:'导入源码',exact:true}).click();
    await expect.poll(()=>new URL(page.url()).searchParams.get('project')).toBeTruthy();await goStep(page,2);
    await expect(page.getByRole('heading',{name:'AI读取项目分析',exact:true})).toBeVisible();



    expect(x.requests).toHaveLength(0);
    await page.getByRole('button',{name:'读取项目',exact:true}).click();
    expect(x.requests).toHaveLength(0);
    await page.getByRole('button',{name:'同意发送并开始分析',exact:true}).click();
    await expect(page.getByRole('heading',{name:'业务草稿',exact:true})).toBeVisible();
    await expect(page.getByText('取消订单',{exact:true}).first()).toBeVisible();
    await expect(page.getByRole('heading',{name:'建议核对的业务',exact:true})).toBeVisible();
    await page.getByText('查看源码事实与依据',{exact:true}).click();
    await expect(page.getByText('文档中的预期 · 待核对',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:/^展开源码 README.md:1-/}).click();
    await expect(page.getByRole('region',{name:/^源码片段 README.md:1-/})).toContainText('release inventory at most once');

    await page.getByRole('button',{name:/^展开源码 src\/orders.ts:1-/}).first().click();
    await expect(page.getByRole('region',{name:/^源码片段 src\/orders.ts:1-/}).first()).toContainText('releaseInventory');
    await expect(page.getByRole('heading',{name:'仍需核对的范围',exact:true})).toBeVisible();
    await expect(page.getByText('仅建议，尚未确认业务预期，也未执行检查。',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await mkdir('output/analysis-entry-20261016',{recursive:true});await page.screenshot({path:`output/analysis-entry-20261016/overview-${width}.png`,fullPage:true});
    expect((await x.request('/state')).runs).toHaveLength(0);
    await page.getByRole('button',{name:'去03核对这项业务',exact:true}).click();
    await expect(page.locator('.step-heading h1')).toContainText('03 ');await expect(page.getByRole('region',{name:'规则预期核对 取消订单'}).getByRole('heading',{name:'取消订单',exact:true})).toBeVisible();
    await page.getByLabel('检查取消订单',{exact:true}).check();await expect(page.getByRole('button',{name:'确认并保存项目规则',exact:true})).toBeDisabled();
    await page.getByText('核对建议的源码事实与候选预期',{exact:true}).click();
    await expect(page.getByText(/文档预期 · 待确认/)).toBeVisible();
    await goStep(page,2);
    await writeFile(join(x.root,'src/orders.ts'),'export const changed=1;');
    await expect(page.getByText('源码已变化，请重新检查材料',{exact:true})).toBeVisible();
  }finally{await x.close()}
});

test('source-only project can open manual runtime accounts without losing source identity',async({page})=>{
  const x=await setup(complete),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    const p=await x.request('/source-projects',{directory:x.root});await page.goto(x.host.url+`/?page=project&step=2&project=${p.id}`);
    await goStep(page,4);
    await page.getByLabel('手动指定测试账号',{exact:true}).check();
    await expect(page.getByLabel('用户甲账号',{exact:true})).toBeVisible();expect(errors).toEqual([]);expect(x.requests).toHaveLength(0);
  }finally{await x.close()}
});
test('whole project read includes tests and a second tab cannot send a stale preview',async({page,context})=>{
  const x=await setup(complete);
  try{
    const p=await x.request('/source-projects',{directory:x.root});await page.goto(x.host.url+`/?page=project&step=2&project=${p.id}`);

    await mkdir(join(x.root,'tests'),{recursive:true});await writeFile(join(x.root,'tests/business.test.ts'),'// documented expectation: cancel restores inventory once');
    await page.getByRole('button',{name:'读取项目',exact:true}).click();
    await expect(page.getByRole('region',{name:'待发送材料',exact:true})).toBeVisible();
    const source=(await x.request('/projects/'+p.id+'/discovery-scope'));expect(source.scope.allowedPaths).toEqual(['.']);expect(source.scope.includeProjectTests).toBe(true);expect(source.snapshot.files.some((file:any)=>file.path==='tests/business.test.ts')).toBe(true);
    await page.getByRole('button',{name:'模型设置',exact:true}).click();
    await page.getByRole('button',{name:'返回02 了解与分析业务',exact:true}).click();
    await expect(page.getByRole('heading',{name:'AI读取项目分析',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'读取项目',exact:true}).click();
    await expect(page.getByRole('region',{name:'待发送材料',exact:true})).toBeVisible();
    const other=await context.newPage();await other.goto(page.url());
    await other.getByRole('button',{name:'读取项目',exact:true}).click();
    // Establish the newer server revision before submitting the original stale draft.
    await expect(other.getByRole('region',{name:'待发送材料',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'同意发送并开始分析',exact:true}).click();
    await expect(page.getByText('另一页面已更新项目。请加载最新项目状态，再读取项目。',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'加载最新项目状态',exact:true}).click();await expect(page.getByRole('region',{name:'待发送材料',exact:true})).toHaveCount(0);expect(x.requests).toHaveLength(0);
  }finally{await x.close()}
});
test('partial information and failed output remain honest, retry is explicit and preserves the original task',async({page})=>{
  const x=await setup((p,n)=>n===1?{kind:'insufficient',unresolved:['缺少权限依据'],limitations:[]}:n===2?{kind:'bad-output'}:complete(p));
  try{
    const p=await x.request('/source-projects',{directory:x.root});await page.goto(x.host.url+`/?page=project&step=2&project=${p.id}`);
    await page.getByRole('button',{name:'读取项目',exact:true}).click();await page.getByRole('button',{name:'同意发送并开始分析',exact:true}).click();
    await expect(page.getByText('分析尚未完成',{exact:true})).toBeVisible();await expect(page.getByText('缺少权限依据',{exact:true})).toBeVisible();
    const before=(await x.request('/state')).projects.find((v:any)=>v.id===p.id).discovery;
    await page.reload();expect(x.requests).toHaveLength(1);await page.getByRole('button',{name:'继续原分析（调用模型）',exact:true}).click();
    await expect(page.getByText('分析未完成',{exact:true})).toBeVisible();await page.getByRole('button',{name:'继续原分析（调用模型）',exact:true}).click();
    await expect(page.getByRole('heading',{name:'业务草稿',exact:true})).toBeVisible();
    const after=(await x.request('/state')).projects.find((v:any)=>v.id===p.id).discovery;expect(after.id).toBe(before.id);expect(after.budget.calls).toBe(3);expect(after.budget.startedAt).toBe(before.budget.startedAt);
  }finally{await x.close()}
});
test('pause manages an in-flight request and reload does not restart analysis',async({page})=>{
  let release:()=>void;const gate=new Promise<void>(r=>release=r);
  const x=await setup(async(p,n)=>{if(n===1){await gate;return complete(p)}return complete(p)});
  try{
    const p=await x.request('/source-projects',{directory:x.root});await page.goto(x.host.url+`/?page=project&step=2&project=${p.id}`);
    await page.getByRole('button',{name:'读取项目',exact:true}).click();await page.getByRole('button',{name:'同意发送并开始分析',exact:true}).click();
    await expect.poll(()=>x.requests.length).toBe(1);await page.getByRole('button',{name:'暂停分析',exact:true}).click();
    await expect(page.getByText('分析已暂停',{exact:true})).toBeVisible();await page.reload();expect(x.requests).toHaveLength(1);release!();
  }finally{release!();await x.close()}
});
