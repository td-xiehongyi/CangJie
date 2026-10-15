import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {sampleSite} from '../support/sample-site.mjs';
for(const name of ['ticket','registration','status-ticket'])test(`${name}: real browser basic interface`,async t=>{
 const {url,accounts}=await sampleSite(t,name);
 const browser=await chromium.launch(process.platform==='win32'?{channel:'msedge'}:{executablePath:process.env.CANGJIE_BROWSER_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
 t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('#username').fill(accounts[0].username);await page.locator('#password').fill(accounts[0].password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('#workspace').waitFor({state:'visible'});
 await page.locator('#title').fill('浏览器测试');await page.getByRole('button',{name:'提交',exact:true}).click();await page.getByRole('heading',{name:'浏览器测试',exact:true}).waitFor();
 if(name==='status-ticket'){await page.getByRole('button',{name:'关闭工单',exact:true}).click();await page.getByRole('button',{name:'尝试重新打开（应被拒绝）'}).click();await page.getByText(/服务器已拒绝重新打开/).waitFor()}
 else{await page.locator('#records input').fill('修改后的内容');await page.getByRole('button',{name:'保存修改'}).click();await page.getByRole('heading',{name:'修改后的内容'}).waitFor()}
 await page.getByRole('button',{name:'退出登录'}).click();await page.locator('#login-area').waitFor({state:'visible'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
});
