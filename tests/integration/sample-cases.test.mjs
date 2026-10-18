import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {sampleSite} from '../support/sample-site.mjs';

test('sample cases cover all three outcomes and materialize real isolated HTTP behavior',{timeout:180000},async t=>{
 const catalog=JSON.parse(await readFile('samples/cases.json','utf8'));
 const {materializeCase}=await import('../../scripts/sample-cases.mjs');
 await mkdir('practice-projects',{recursive:true});
 const directory=await mkdtemp(resolve('practice-projects/case-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 for(const sample of ['ticket','registration','status-ticket']){
  assert.deepEqual([...new Set(catalog.cases.filter(c=>c.sample===sample).map(c=>c.kind))].sort(),['defect','normal','unknown']);
 }
 for(const c of catalog.cases)await t.test(c.id,async st=>{
  const destination=join(directory,c.id),result=await materializeCase(c.id,destination);
  assert.equal(result.project,join(destination,'project'));
  await assert.rejects(materializeCase(c.id,destination),{code:'EEXIST'});
  const {url,accounts}=await sampleSite(st,c.sample,result.project),registration=c.sample==='registration',status=c.sample==='status-ticket';
  const request=async(path,token,method='GET',body)=>{
   const response=await fetch(url+path,{method,headers:{'content-type':'application/json','x-verification-attempt':'case-test','x-verification-intent':'same-intent',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
   return {status:response.status,body:await response.json()};
  };
  const login=async a=>{const r=await request(registration?'/sessions':'/login',null,'POST',registration?{account:a.username,passphrase:a.password}:{username:a.username,password:a.password});assert.equal(r.status,200);return registration?r.body.session.access:r.body.token};
  const owner=await login(accounts[0]),other=await login(accounts[1]),endpoint=registration?'/enrollments':'/tickets';
  const body=registration?{displayName:'案例原文',submissionKey:'same-intent'}:{title:'案例原文',intentId:'same-intent',...(status?{status:'open'}:{})};
  const created=await request(endpoint,owner,'POST',body);assert.equal(created.status,201);
  await request(endpoint,owner,'POST',body);
  const list=await request(endpoint+'?attemptId=case-test',owner),rows=registration?list.body.entries:list.body.items;
  assert.equal(rows.length,c.variant==='duplicate'?2:1);
  assert.equal(rows[0][registration?'displayName':'title'],c.variant==='save-drop'?'错误保存': '案例原文');
  const hidden=await request(endpoint+'?attemptId=case-test',other);
  assert.equal((registration?hidden.body.entries:hidden.body.items).length,c.variant==='permission-leak'?1:0);
  const edit=endpoint+'/'+created.body.id+(registration?'/profile':'');
  assert.equal((await request(edit,other,registration?'PUT':'PATCH',registration?{displayName:'越权'}:status?{status:'closed'}:{title:'越权'})).status,404);
  const edited=await request(edit,owner,registration?'PUT':'PATCH',registration?{displayName:'修改后'}:status?{status:'closed'}:{title:'修改后'});assert.equal(edited.status,200);
  if(status){
   assert.equal(edited.body.status,'closed');
   assert.equal(edited.body.ownerId,'owner');
   const reopened=await request(edit,owner,'PATCH',{status:'open'});
   assert.equal(reopened.status,c.variant==='reopen-defect'?200:409);
   const final=await request(endpoint+'?attemptId=case-test',owner);
   assert.equal(final.body.items[0].status,c.variant==='reopen-defect'?'open':'closed');
   if(c.variant==='temporary-mutation'){assert.notEqual(edited.body.title,'案例原文');assert.equal(final.body.items[0].title,'案例原文');assert.equal(final.body.items[0].ownerId,'owner');}
  }else{
   assert.equal(edited.body[registration?'displayName':'title'],'修改后');
   assert.equal(edited.body[registration?'track':'priority'],c.variant==='field-change'?(registration?'standard':'low'):(registration?'advanced':'high'));
   assert.equal(edited.body.ownerId,c.variant==='owner-change'?'other':'owner');
  }
  const complete=registration?list.body.page.exhaustive:list.body.complete;
  assert.equal(complete,c.kind!=='unknown');
  assert.equal(await readFile(join(result.project,'src/server.ts'),'utf8').then(s=>s.includes('expectedVerdict')),false);
 });
 await assert.rejects(materializeCase('not-a-case',join(directory,'invalid')),/UNKNOWN_SAMPLE_CASE/);
});
