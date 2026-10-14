import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';

test('ticket mapping exposes the fields required by title invariants',async()=>{
  const {normalized}=await import('../../apps/host/dist/execution/mapping.js');
  const {mapping}=JSON.parse(await readFile('samples/ticket/verification.json','utf8'));
  const result=normalized(mapping,'query',{items:[{id:'ticket',title:'title',priority:'high',ownerId:'owner'}]});
  assert.equal(result.priority,'high');assert.equal(result.ownerId,'owner');
});

test('incomplete target evidence pauses and resumes the same candidate without a model call',{timeout:60000},async t=>{
  const {startWorkbench}=await import('../../apps/host/dist/api.js');
  const spec=JSON.parse(await readFile('tests/fixtures/title-update.json','utf8'));
  let calls=0;
  const provider=createServer(async(req,res)=>{for await(const chunk of req){}calls++;res.writeHead(200,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(spec)}}],usage:{total_tokens:20}}));});
  await new Promise(r=>provider.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>provider.close(r)));
  const directory=join(process.cwd(),'.local-data/trial-recovery-tests',randomUUID());
  const host=await startWorkbench({directory,registryDirectory:join(directory,'registry'),port:0});t.after(()=>host.close());
  const request=async(path,body)=>{const r=await fetch(host.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${host.token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;};
  const {mapping}=JSON.parse(await readFile('samples/ticket/verification.json','utf8'));
  delete mapping.resultBindings.query.priority;delete mapping.resultBindings.query.ownerId;
  await request('/settings',{serviceUrl:`http://127.0.0.1:${provider.address().port}`,model:'synthetic-trial-recovery',key:'synthetic-trial-recovery-key'});
  const {projectId}=await request('/projects',{directory:join(process.cwd(),'samples/ticket'),accountMode:'automatic',purpose:'synthetic trial recovery',mapping});
  let project=(await request('/state')).projects[0];
  const disclosure=await request(`/projects/${projectId}/disclosure`);
  await request(`/projects/${projectId}/confirm`,{environment:true,environmentHash:project.environmentHash,send:true,scopeHash:disclosure.scopeHash});
  const first=await request(`/projects/${projectId}/candidate`,{ruleId:'title-update-rule',confirmRule:true});
  const wait=async predicate=>{for(let i=0;i<300;i++){const p=(await request('/state')).projects[0];if(predicate(p.candidate))return p;await new Promise(r=>setTimeout(r,100));}throw new Error('candidate recovery timed out');};
  project=await wait(c=>c?.code==='TARGET_TRIAL_EVIDENCE_INCOMPLETE'&&c.status==='paused');
  assert.equal(project.candidate.status,'paused');assert.equal(project.candidate.phase,'awaiting_trial');
  assert.ok(project.candidate.trial.verdicts.some(v=>v.status==='inconclusive'));assert.equal(calls,1);
  const budget=project.candidate.budget;
  const {chromium,expect}=await import('@playwright/test');
  const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();await page.goto(host.url+`/?page=verify&project=${projectId}`);
  await page.getByLabel('选择流程').selectOption('edit');
  await page.getByLabel('只改标题，优先级和所有者不变',{exact:true}).check();
  await page.getByLabel('这就是我期望的网站行为',{exact:true}).check();
  await expect(page.getByRole('status').filter({hasText:'检查选择已保存'})).toBeVisible();
  await expect(page.getByText('已暂停',{exact:true})).toBeVisible();
  const resume=page.getByRole('button',{name:'继续原方案的试运行',exact:true});await expect(resume).toBeEnabled();
  await mkdir('output/t9-ui-acceptance/screenshots',{recursive:true});
  await page.screenshot({path:'output/t9-ui-acceptance/screenshots/trial-paused.png',fullPage:true});
  mapping.resultBindings.query.priority=['items','0','priority'];mapping.resultBindings.query.ownerId=['items','0','ownerId'];
  await request('/projects',{id:projectId,directory:project.directory,mapping});
  project=(await request('/state')).projects[0];assert.equal(project.environmentConfirmed,false);
  await request(`/projects/${projectId}/confirm`,{environment:true,environmentHash:project.environmentHash});
  // Reconnection changes the environment fingerprint and invalidates the old rule confirmation.
  await page.waitForResponse(async response=>response.url().endsWith('/api/state')&&response.ok()&&(await response.json()).projects.some(p=>p.id===projectId&&p.environmentHash===project.environmentHash&&p.environmentConfirmed));
  await expect(page.getByLabel('这就是我期望的网站行为',{exact:true})).not.toBeChecked();
  await page.getByLabel('这就是我期望的网站行为',{exact:true}).check();
  await expect(page.getByRole('status').filter({hasText:'检查选择已保存'})).toBeVisible();
  await expect(resume).toBeEnabled();await resume.click();
  try {project=await wait(c=>c?.status==='ready_for_review');}
  catch(error){const latest=(await request('/state')).projects[0];throw new Error(`${error.message}; candidate=${JSON.stringify({status:latest.candidate?.status,phase:latest.candidate?.phase,code:latest.candidate?.code})}; page=${await page.locator('main').innerText()}`);}
  assert.equal(project.candidate.id,first.candidateId);assert.deepEqual(project.candidate.budget,budget);
  assert.equal(calls,1);assert.equal(project.candidate.revisionIndex,0);
  assert.equal(project.candidate.trial.completed,true);
  assert.ok(project.candidate.trial.verdicts.every(v=>v.status==='pass'));
  await expect(page.getByText('等待双重审核',{exact:true})).toBeVisible();
  await page.screenshot({path:'output/t9-ui-acceptance/screenshots/trial-recovered.png',fullPage:true});
});
