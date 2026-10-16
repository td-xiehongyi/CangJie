import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '@playwright/test';
import {startWorkbench} from '../../apps/host/dist/api.js';
test('numbered workbench preserves drafts, scopes goals and never auto-dispatches',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'workflow-ui-')),source=join(directory,'source');
 await cp('tests/fixtures/discovery-orders',source,{recursive:true});
 const host=await startWorkbench({directory:join(directory,'host'),registryDirectory:join(directory,'registry'),port:0});
 t.after(async()=>{await host.close();await rm(directory,{recursive:true,force:true});});
 const browser=await chromium.launch(process.platform==='win32'?{channel:'msedge'}:{executablePath:process.env.CANGJIE_BROWSER_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
 t.after(async()=>{await browser.close();});
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let modelOrRunCalls=0;page.on('request',r=>{if(r.method()==='POST'&&/\/(discovery|candidate|run|replay|load)$/.test(new URL(r.url()).pathname))modelOrRunCalls++;});
 await page.goto(host.url);
 const nav=page.getByRole('navigation',{name:'完整业务验证流程'});
 await nav.getByRole('button').first().waitFor();
 assert.equal(await nav.getByRole('button').count(),9);
 assert.equal(await nav.getByLabel('05内的自动子步骤').locator('li').count(),3);
 await page.getByLabel('项目目录',{exact:true}).locator('visible=true').fill(source);
 await page.getByRole('button',{name:'导入源码',exact:true}).click();
 await page.waitForURL(/project=/);
 const pid=new URL(page.url()).searchParams.get('project');
 await nav.getByRole('button',{name:/^02 /}).click();
 await page.getByRole('heading',{name:'AI读取项目分析',exact:true}).waitFor();
 await nav.getByRole('button',{name:/^05 /}).click(); await page.waitForURL(/step=3/);
 assert.match(await page.getByRole('alert').innerText(),/请先在03选择至少一项检查/);
 await nav.getByRole('button',{name:/^02 /}).click();
 await page.waitForURL(/step=2/);

 assert.equal(await page.getByRole('heading',{name:'自行填写业务',exact:true}).count(),1);
 assert.equal(await page.locator('.business-discovery textarea').count(),0);
 await page.getByRole('button',{name:'读取项目',exact:true}).click();
 await page.getByRole('button',{name:'查看完整文件清单与正文',exact:true}).click();
 await page.getByRole('dialog',{name:'查看完整文件清单与正文',exact:true}).waitFor();
 await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('button',{name:'查看完整文件清单与正文',exact:true}).evaluate(e=>e===document.activeElement),true);
 await page.getByRole('button',{name:'配置分析模型',exact:true}).click();
 await page.getByLabel('模型名称',{exact:true}).fill('synthetic-unsent-model');
 await page.getByRole('button',{name:'保存到本机',exact:true}).click();
 await page.getByRole('status').filter({hasText:'未发送连接检查'}).waitFor();
 await page.getByRole('button',{name:'返回02 了解与分析业务',exact:true}).click();
 assert.equal(new URL(page.url()).searchParams.get('step'),'2');
 assert.equal(await page.getByRole('button',{name:'同意发送并开始分析',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'查看完整文件清单与正文',exact:true}).count(),0);
 await page.getByRole('button',{name:'前往03填写业务',exact:true}).click();
 await page.getByLabel('业务说明（人工输入）',{exact:true}).fill('检查取消订单后库存恢复一次');
 await page.getByLabel('测试目标',{exact:true}).selectOption('both');
 await page.getByLabel('计划每秒完整检查次数').fill('2');
 await page.getByLabel('计划持续秒数').fill('10');
 await page.getByRole('button',{name:'保存测试目标',exact:true}).click();
 await page.getByText('当前目标已保存；没有启动任何检查。',{exact:true}).waitFor();
 await page.reload();
 await page.getByLabel('测试目标',{exact:true}).waitFor();
 // Initial render can precede project load; wait until the saved preference is projected.
 await page.waitForFunction(()=>document.querySelector('select')&&Array.from(document.querySelectorAll('select')).some(s=>s.value==='both'));
 assert.equal(await page.getByLabel('测试目标',{exact:true}).inputValue(),'both');
 assert.equal(new URL(page.url()).searchParams.get('project'),pid);
 // Clicking the already-current step must not swallow the next navigation.
 await nav.getByRole('button',{name:/^03 /}).click();
 await nav.getByRole('button',{name:/^12 /}).click();
 await page.getByRole('heading',{name:'核对变化并复测',exact:true}).waitFor();
 assert.match(await nav.getByRole('button',{name:/^12 /}).innerText(),/未启用/);
 await nav.getByRole('button',{name:/^11 /}).click();
 await page.getByRole('heading',{name:'尚无验证结果',exact:true}).waitFor();
 for(const width of [390,800,1280,1920]){
  await page.setViewportSize({width,height:720});
  for(const zoom of [1,1.25,1.5]){
   await page.evaluate(z=>document.body.style.zoom=String(z),zoom);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,'horizontal overflow '+width+'/'+zoom);
  }
 }
 await page.evaluate(()=>document.body.style.zoom='1');
 await page.setViewportSize({width:1280,height:720});
 await mkdir('output/analysis-entry-20261016',{recursive:true});
 await page.screenshot({path:'output/analysis-entry-20261016/11-results.png',fullPage:true});
 await nav.getByRole('button',{name:/^02 /}).click();
 await page.screenshot({path:'output/analysis-entry-20261016/02-analysis.png',fullPage:true});
 assert.equal(modelOrRunCalls,0,'navigation and configuration must not launch work');
 assert.deepEqual(errors,[]);
});
