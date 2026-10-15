import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleSite} from '../support/sample-site.mjs';
for(const name of ['ticket','registration','status-ticket'])test(`${name}: page, assets, authentication and real business actions`,async t=>{
 const {url,accounts}=await sampleSite(t,name),registration=name==='registration',status=name==='status-ticket';
 const page=await fetch(url+'/');assert.equal(page.status,200);const html=await page.text();assert.match(html,/lang="zh-CN"/);assert.match(html,/id="login-form"/);assert.match(html,/id="records"/);assert.match(page.headers.get('content-security-policy'),/default-src 'self'/);
 const js=await fetch(url+'/ui/app.js');assert.equal(js.status,200);const code=await js.text();assert.ok(!code.includes('innerHTML'));assert.ok(!code.includes('localStorage'));assert.match(code,/x-verification-attempt/);
 assert.equal((await fetch(url+'/ui/style.css')).status,200);
 assert.equal((await fetch(url+'/ui/../db.ts')).status,401);
 const request=async(path,token,method='GET',body)=>{const r=await fetch(url+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),'x-verification-attempt':'browser-demo','x-verification-intent':'intent-one'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,value:await r.json()}};
 const endpoint=registration?'/enrollments':'/tickets';assert.equal((await request(endpoint)).status,401);
 const login=async a=>{const r=await request(registration?'/sessions':'/login',null,'POST',registration?{account:a.username,passphrase:a.password}:{username:a.username,password:a.password});assert.equal(r.status,200);return registration?r.value.session.access:r.value.token};
 const token=await login(accounts[0]),other=await login(accounts[1]);
 const body=registration?{displayName:'<img src=x onerror=alert(1)>',submissionKey:'intent-one'}:{title:'<img src=x onerror=alert(1)>',intentId:'intent-one',...(status?{status:'open'}:{})};
 const first=await request(endpoint,token,'POST',body),duplicate=await request(endpoint,token,'POST',body);assert.equal(first.status,201);assert.equal(first.value.id,duplicate.value.id);
 const query=endpoint+'?attemptId=browser-demo';const listed=await request(query,token);assert.equal((registration?listed.value.entries:listed.value.items).length,1);
 const hidden=await request(query,other);assert.equal((registration?hidden.value.entries:hidden.value.items).length,0);
 const edit=endpoint+'/'+first.value.id+(registration?'/profile':'');const changed=await request(edit,token,registration?'PUT':'PATCH',registration?{displayName:'已修改'}:status?{status:'closed'}:{title:'已修改'});assert.equal(changed.status,200);
 assert.equal(changed.value.ownerId,first.value.ownerId);if(status){assert.equal(changed.value.title,first.value.title);assert.equal((await request(edit,token,'PATCH',{status:'open'})).status,409)}else{assert.equal(changed.value[registration?'track':'priority'],first.value[registration?'track':'priority'])}
 assert.equal((await request('/logout',token,'POST',{})).status,200);assert.equal((await request(query,token)).status,401);
});

import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {resolve} from 'node:path';
for(const name of ['ticket','registration','status-ticket'])test(`${name}: demo launcher creates usable disposable credentials`,async t=>{
 const child=spawn(process.execPath,['src/demo.mjs','--json'],{cwd:resolve('samples',name),env:{...process.env,PORT:'0',TEST_DATABASE:'must-not-use-this-path'},stdio:['ignore','pipe','pipe']});
 const closed=new Promise(r=>child.once('close',r));
 t.after(async()=>{if(child.exitCode===null)child.kill();await closed});
 let errors='';child.stderr.on('data',v=>errors+=v);
 const info=await new Promise((res,rej)=>{let output='';const timer=setTimeout(()=>rej(new Error('demo startup timeout: '+errors)),10000);child.once('error',e=>{clearTimeout(timer);rej(e)});child.once('exit',code=>{clearTimeout(timer);rej(new Error('demo exit '+code+': '+errors))});child.stdout.on('data',v=>{output+=v;if(output.includes('\n')){clearTimeout(timer);try{res(JSON.parse(output.split('\n')[0]))}catch(e){rej(e)}}})});
 assert.equal((await fetch(info.url)).status,200);assert.equal(info.accounts.length,2);assert.notEqual(info.accounts[0].password,info.accounts[1].password);
 const a=info.accounts[0],registration=name==='registration',login=await fetch(info.url+(registration?'/sessions':'/login'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(registration?{account:a.username,passphrase:a.password}:{username:a.username,password:a.password})});assert.equal(login.status,200);
 child.kill();await closed;await assert.rejects(access(info.directory));
});
