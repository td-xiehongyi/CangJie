import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
// @ts-ignore local deterministic fixture
import {setupDiscovery,action,read,overview} from '../support/discovery.mjs';
// @ts-ignore compiled host
import {startWorkbench} from '../../apps/host/dist/api.js';
async function setup(respond:(p:any,n:number)=>any){
  const cleanup:(()=>any)[]=[],x=await setupDiscovery({after:(f:()=>any)=>cleanup.push(f)},respond);
  const directory=join(x.directory,'ui-host'),host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});
  const request=async(path:string,body?:unknown)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});expect(r.ok).toBe(true);return r.json()};
  await request('/settings',{serviceUrl:x.config.serviceUrl,model:'deterministic-ui-discovery',key:'synthetic-ui-discovery-key',remember:false});
  return {...x,host,request,async close(){await host.close();for(const fn of cleanup.reverse())await fn()}};
}
const complete=(p:any,n:number)=>n===1?action([read('src/routes.ts',1,5),read('src/orders.ts',1,9),read('src/storage.ts',1,2),read('README.md',1,2)]):overview(p.files);
for(const width of [1280,390])test(`source-only discovery shows real citations and pending project recommendations at ${width}px`,async({page})=>{
  const x=await setup(complete);
  try{
    await page.setViewportSize({width,height:900});await page.goto(x.host.url);
    await page.getByRole('textbox',{name:'项目目录',exact:true}).fill(x.root);
    await page.getByRole('button',{name:'读取源码并分析业务',exact:true}).click();
    await expect(page.getByRole('heading',{name:'源码业务分析',exact:true})).toBeVisible();
    await expect(page.getByText('源码分析无需启动网站、测试账号或 verification.json。',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'查看读取与发送范围',exact:true}).click();
    await expect(page.getByText('目录摘要也会发送；正文只在此范围内按需读取。',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'开始源码业务分析',exact:true})).toBeDisabled();
    await page.getByLabel('同意向所列服务发送目录摘要及范围内经过过滤的源码片段',{exact:true}).check();
    await page.getByRole('button',{name:'开始源码业务分析',exact:true}).click();
    await expect(page.getByRole('heading',{name:'业务概览',exact:true})).toBeVisible();
    await expect(page.getByText('取消订单',{exact:true}).first()).toBeVisible();
    await expect(page.getByRole('heading',{name:'项目特有检查建议',exact:true})).toBeVisible();
    await expect(page.getByText('文档中的预期 · 待核对',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'展开源码 README.md:1-2',exact:true}).click();
    await expect(page.getByRole('region',{name:'源码片段 README.md:1-2',exact:true})).toContainText('release inventory at most once');
    await page.getByRole('button',{name:'聚焦这条业务',exact:true}).click();
    await expect(page.getByText('已聚焦此业务；建议仍待确认，不是已验证规则。',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'展开源码 src/orders.ts:1-9',exact:true}).first().click();
    await expect(page.getByRole('region',{name:'源码片段 src/orders.ts:1-9',exact:true}).first()).toContainText('releaseInventory');
    await expect(page.getByRole('heading',{name:'阅读范围与局限',exact:true})).toBeVisible();
    await expect(page.getByText('仅建议，尚未确认业务预期，也未执行检查。',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await mkdir('output/s2-discovery/screenshots',{recursive:true});await page.screenshot({path:`output/s2-discovery/screenshots/overview-${width}.png`,fullPage:true});
    expect((await x.request('/state')).runs).toHaveLength(0);
    await writeFile(join(x.root,'src/orders.ts'),'export const changed=1;');
    await expect(page.getByText('源码已变化，旧引用已失效；请重新索引并创建新分析。',{exact:true})).toBeVisible();
  }finally{await x.close()}
});

test('source-only project can open manual runtime accounts without losing source identity',async({page})=>{
  const x=await setup(complete),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    const p=await x.request('/source-projects',{directory:x.root});await page.goto(x.host.url+`/?page=project&project=${p.id}`);
    await page.getByRole('button',{name:'接入运行配置（保留分析）',exact:true}).click();
    await page.getByLabel('手动指定测试账号',{exact:true}).check();
    await expect(page.getByLabel('用户甲账号',{exact:true})).toBeVisible();expect(errors).toEqual([]);expect(x.requests).toHaveLength(0);
  }finally{await x.close()}
});
test('scope drafts survive settings navigation and a second tab cannot overwrite newer scope',async({page,context})=>{
  const x=await setup(complete);
  try{
    const p=await x.request('/source-projects',{directory:x.root});await page.goto(x.host.url+`/?page=project&project=${p.id}`);
    await page.getByRole('button',{name:'查看读取与发送范围',exact:true}).click();
    await page.getByLabel('允许读取的目录或文件',{exact:true}).fill('src/orders.ts');
    await page.getByRole('button',{name:'配置分析模型',exact:true}).click();
    await page.getByRole('button',{name:'返回项目分析',exact:true}).click();
    await expect(page.getByLabel('允许读取的目录或文件',{exact:true})).toHaveValue('src/orders.ts');
    const other=await context.newPage();await other.goto(page.url());await other.getByRole('button',{name:'查看读取与发送范围',exact:true}).click();
    await other.getByLabel('允许读取的目录或文件',{exact:true}).fill('README.md');await other.getByRole('button',{name:'保存读取范围',exact:true}).click();
    await page.getByRole('button',{name:'保存读取范围',exact:true}).click();
    await expect(page.getByText('另一页面已修改分析范围。本页输入已保留，请加载最新范围或保留本页重新保存。',{exact:true})).toBeVisible();
    await expect(page.getByLabel('允许读取的目录或文件',{exact:true})).toHaveValue('src/orders.ts');
    await page.getByRole('button',{name:'加载最新范围',exact:true}).click();await expect(page.getByLabel('允许读取的目录或文件',{exact:true})).toHaveValue('readme.md');expect(x.requests).toHaveLength(0);
  }finally{await x.close()}
});
test('partial information and failed output remain honest, retry is explicit and preserves the original task',async({page})=>{
  const x=await setup((p,n)=>n===1?{kind:'insufficient',unresolved:['缺少权限依据'],limitations:[]}:n===2?{kind:'bad-output'}:n===3?action([read('src/orders.ts',1,9)]):overview(p.files));
  try{
    const p=await x.request('/source-projects',{directory:x.root});await page.goto(x.host.url+`/?page=project&project=${p.id}`);
    await page.getByRole('button',{name:'查看读取与发送范围',exact:true}).click();await page.getByLabel('同意向所列服务发送目录摘要及范围内经过过滤的源码片段',{exact:true}).check();await page.getByRole('button',{name:'开始源码业务分析',exact:true}).click();
    await expect(page.getByText('分析不完整',{exact:true})).toBeVisible();await expect(page.getByText('缺少权限依据',{exact:true})).toBeVisible();
    const before=(await x.request('/state')).projects.find((v:any)=>v.id===p.id).discovery;
    await page.reload();expect(x.requests).toHaveLength(1);await page.getByRole('button',{name:'继续原分析',exact:true}).click();
    await expect(page.getByText('分析失败，进度已保留',{exact:true})).toBeVisible();await page.getByRole('button',{name:'继续原分析',exact:true}).click();
    await expect(page.getByRole('heading',{name:'业务概览',exact:true})).toBeVisible();
    const after=(await x.request('/state')).projects.find((v:any)=>v.id===p.id).discovery;expect(after.id).toBe(before.id);expect(after.budget.calls).toBe(4);expect(after.budget.startedAt).toBe(before.budget.startedAt);
  }finally{await x.close()}
});
test('pause manages an in-flight request and reload does not restart analysis',async({page})=>{
  let release:()=>void;const gate=new Promise<void>(r=>release=r);
  const x=await setup(async(p,n)=>{if(n===1){await gate;return action([read('src/orders.ts',1,9)])}return overview(p.files)});
  try{
    const p=await x.request('/source-projects',{directory:x.root});await page.goto(x.host.url+`/?page=project&project=${p.id}`);
    await page.getByRole('button',{name:'查看读取与发送范围',exact:true}).click();await page.getByLabel('同意向所列服务发送目录摘要及范围内经过过滤的源码片段',{exact:true}).check();await page.getByRole('button',{name:'开始源码业务分析',exact:true}).click();
    await expect.poll(()=>x.requests.length).toBe(1);await page.getByRole('button',{name:'暂停分析',exact:true}).click();
    await expect(page.getByText('分析已暂停',{exact:true})).toBeVisible();await page.reload();expect(x.requests).toHaveLength(1);release!();
  }finally{release!();await x.close()}
});
