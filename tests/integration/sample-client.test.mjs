import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {sampleSite} from '../support/sample-site.mjs';
// Minimal DOM contract, not a browser or visual acceptance substitute.
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.dataset={};this.value='';this.hidden=false;this.disabled=false;this.textContent=''}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=nodes}
 addEventListener(name,fn){this.listeners[name]=fn}
 focus(){}
}
const descendants=n=>[n,...n.children.flatMap(descendants)];
for(const name of ['ticket','registration','status-ticket'])test(`${name}: shipped client completes login, create, dedupe, edit, logout and isolation`,async t=>{
 const site=await sampleSite(t,name);
 const ids=['attempt','intent','message','logout','refresh','workspace','login-area','session','records','password','count','username','title','signed-in','login-form','create-form','new-intent','scope-form'];
 const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
 const body=new Element('body');body.dataset.kind=name;for(const e of Object.values(elements))body.append(e);
 const document={body,getElementById:id=>elements[id],createElement:tag=>new Element(tag),querySelectorAll:tag=>descendants(body).filter(e=>e.tagName===tag)};
 const calls=[],storage=new Map();
 const context=vm.createContext({document,crypto:webcrypto,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},fetch:async(path,options)=>{calls.push({path,options});return fetch(site.url+path,options)}});
 vm.runInContext(await readFile('samples/'+name+'/src/public/app.js','utf8'),context);
 async function event(element,name){element.listeners[name]({preventDefault(){}});const deadline=Date.now()+3000;while(vm.runInContext('busy',context)){if(Date.now()>deadline)throw new Error('client remained busy');await new Promise(r=>setTimeout(r,5))}}
 const login=async a=>{elements.username.value=a.username;elements.password.value=a.password;await event(elements['login-form'],'submit')};
 await login(site.accounts[0]);assert.equal(elements.workspace.hidden,false);assert.equal(elements.password.value,'');
 const literal='<img src=x onerror=alert(1)>';elements.title.value=literal;await event(elements['create-form'],'submit');await event(elements['create-form'],'submit');
 assert.equal(elements.count.textContent,'1 条');let card=elements.records.children[0];assert.equal(card.children[0].textContent,literal);assert.equal(descendants(card).some(n=>n.tagName==='img'),false);
 if(name==='status-ticket'){
  await event(card.children.find(n=>n.tagName==='button'),'click');card=elements.records.children[0];assert.equal(card.children[1].textContent,'已关闭');await event(card.children.find(n=>n.tagName==='button'),'click');assert.match(elements.message.textContent,/已拒绝重新打开/);assert.equal(elements.records.children[0].children[1].textContent,'已关闭');
 }else{
  const form=card.children.find(n=>n.tagName==='form');descendants(form).find(n=>n.tagName==='input').value='已修改';await event(form,'submit');assert.equal(elements.records.children[0].children[0].textContent,'已修改');
 }
 const previousIntent=elements.intent.value;await event(elements['new-intent'],'click');assert.notEqual(elements.intent.value,previousIntent);assert.equal(elements.title.value,'');
 const loginCall=calls.find(c=>/login|sessions/.test(c.path));assert.ok(loginCall);
 await event(elements.logout,'click');assert.equal(elements.workspace.hidden,true);assert.equal(elements.records.children.length,0);
 await login(site.accounts[1]);assert.equal(elements.count.textContent,'0 条');assert.equal(storage.size,1);assert.ok(storage.has('sample-attempt'));
});
