const kind=document.body.dataset.kind;
const registration=kind==='registration',statusSite=kind==='status-ticket';
const endpoint=registration?'/enrollments':'/tickets',field=registration?'displayName':'title';
const $=id=>document.getElementById(id);
let token='',busy=false,intent=crypto.randomUUID();
let attempt;try{attempt=sessionStorage.getItem('sample-attempt')}catch{}attempt||='manual-'+crypto.randomUUID();
function rememberAttempt(){try{sessionStorage.setItem('sample-attempt',attempt)}catch{}}
rememberAttempt();$('attempt').value=attempt;$('intent').value=intent;
function message(text,error=false){$('message').textContent=text;$('message').dataset.error=String(error)}
function lock(value){busy=value;for(const node of document.querySelectorAll('fieldset'))node.disabled=value;for(const button of document.querySelectorAll('button'))button.disabled=value}
async function action(work){if(busy)return;lock(true);try{await work()}catch(e){message(e.message||'请求失败，请重试',true)}finally{lock(false)}}
async function api(path,method='GET',body){
 let response;try{response=await fetch(path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),'x-verification-attempt':attempt,'x-verification-intent':intent},...(body?{body:JSON.stringify(body)}:{})})}catch{throw new Error('无法连接样例服务，请检查启动终端。')}
 let data;try{data=await response.json()}catch{throw new Error('服务返回了无法识别的响应。')}
 if(!response.ok){if(response.status===401&&token)endSession();const known={'invalid login':'账号或密码不正确','authentication required':'请先登录','not found':'记录不存在，或不属于当前账号/演示批次','closed ticket cannot reopen':'服务器已拒绝重新打开：关闭后的工单不可恢复'};throw new Error((known[data.error]||data.error||'操作失败')+'（HTTP '+response.status+'）')}
 return data;
}
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n}
function endSession(){token='';$('workspace').hidden=true;$('login-area').hidden=false;$('session').hidden=true;$('records').replaceChildren();$('password').value='';$('count').textContent='0 条'}
async function refresh(){
 const data=await api(endpoint+'?attemptId='+encodeURIComponent(attempt)),items=registration?data.entries:data.items;
 if(!Array.isArray(items))throw new Error('列表结构不符合样例接口约定。');
 const total=registration?data.page?.count:data.total,hasMore=registration?data.page?.more:data.hasMore;
 $('count').textContent=String(total??items.length)+' 条'+(hasMore?'（仅显示部分）':'');$('records').replaceChildren();
 if(!items.length){$('records').append(node('p','当前账号在此演示批次中暂无记录。请先提交一条，或核对批次编号。','empty'));return}
 for(const record of items){
  const card=node('article',undefined,'record');card.append(node('h3',record[field]));
  card.append(node('span',statusSite?(record.status==='closed'?'已关闭':'处理中'):registration?'组别：'+record.track:'优先级：'+record.priority,'pill'));
  card.append(node('small','记录 ID：'+record.id),node('small','归属：'+record.ownerId));
  if(statusSite){const button=node('button',record.status==='closed'?'尝试重新打开（应被拒绝）':'关闭工单');button.type='button';button.addEventListener('click',()=>action(async()=>{try{await api(endpoint+'/'+encodeURIComponent(record.id),'PATCH',{status:record.status==='closed'?'open':'closed'});message('状态已更新；下方列表来自服务器重新查询。')}finally{await refresh()}}));card.append(button)}
  else {const form=node('form'),label=node('label',registration?'修改姓名':'修改标题'),input=node('input');input.value=record[field];input.required=true;input.maxLength=160;label.append(input);const button=node('button','保存修改');button.type='submit';form.append(label,button);form.addEventListener('submit',event=>{event.preventDefault();if(!input.value.trim()){message('内容不能为空。',true);return}action(async()=>{await api(endpoint+'/'+encodeURIComponent(record.id)+(registration?'/profile':''),registration?'PUT':'PATCH',{[field]:input.value.trim()});await refresh();message('修改已保存。组别/优先级与归属可在列表核对。')})});card.append(form)}
  $('records').append(card);
 }
}
$('login-form').addEventListener('submit',event=>{event.preventDefault();action(async()=>{const account=$('username').value.trim(),password=$('password').value;const data=await api(registration?'/sessions':'/login','POST',registration?{account,passphrase:password}:{username:account,password});token=registration?data.session.access:data.token;$('password').value='';$('login-area').hidden=true;$('workspace').hidden=false;$('session').hidden=false;$('signed-in').textContent=account;await refresh();message('已登录。所有提交与修改均使用当前样例的真实接口。')})});
$('logout').addEventListener('click',()=>action(async()=>{await api('/logout','POST',{});endSession();message('已退出，可登录另一个测试账号核对数据隔离。')}));
$('create-form').addEventListener('submit',event=>{event.preventDefault();if(!$('title').value.trim()){message('内容不能为空。',true);return}action(async()=>{const value=$('title').value.trim();await api(endpoint,'POST',registration?{displayName:value,submissionKey:intent}:{title:value,intentId:intent,...(statusSite?{status:'open'}:{})});await refresh();message('提交完成。同一提交意图重复点击不会增加第二条记录；新建另一条请点击“新的提交”。')})});
$('new-intent').addEventListener('click',()=>{intent=crypto.randomUUID();$('intent').value=intent;$('title').value='';$('title').focus();message('已准备新的提交意图；填写内容后再提交。')});
$('refresh').addEventListener('click',()=>action(async()=>{await refresh();message('列表已刷新。')}));
$('scope-form').addEventListener('submit',event=>{event.preventDefault();const value=$('attempt').value.trim();if(!value){message('批次编号不能为空。',true);return}action(async()=>{attempt=value;rememberAttempt();await refresh();message('已切换演示批次。切换账号时保留相同批次，便于核对隔离。')})});
