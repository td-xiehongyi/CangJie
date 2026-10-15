import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const root=resolve('.'),source=join(root,'apps/ui/src'),output=await mkdtemp(join(tmpdir(),'workflow-view-'));
await symlink(join(root,'node_modules'),join(output,'node_modules'),process.platform==='win32'?'junction':'dir');
test.after(()=>rm(output,{recursive:true,force:true}));
async function transpile(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory()){await transpile(p);continue;}if(!/\.tsx?$/.test(e.name))continue;const out=join(output,relative(source,p).replace(/\.tsx?$/,'.mjs'));await mkdir(dirname(out),{recursive:true});const js=ts.transpileModule(await readFile(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/(from\s+|import\s*)(['"])(\.\.?\/[^'"]+)\2/g,(_,prefix,q,spec)=>prefix+q+spec.replace(/\.tsx?$/,'')+'.mjs'+q);await writeFile(out,js);}}
await transpile(source);
const {default:Report}=await import(pathToFileURL(join(output,'ReportView.mjs')));
test('step11 does not mount a hidden second load-execution form',()=>{
 const run={id:'r',projectId:'p',status:'completed',kind:'verification',flow:{title:'示例'},plan:{sourceHash:'h',mapping:{}},checks:[],uncovered:[],startedAt:'2026-10-15',events:[]};
 const props={step:11,project:{id:'p',sourceHash:'h',mapping:{}},run,state:{runs:[run],loads:[],catalog:{matches:[]}},refresh:async()=>{},act:()=>{},select:()=>{}};
 const html=renderToStaticMarkup(React.createElement(Report,props));
 assert.match(html,/11 导出报告/);assert.match(html,/进入12 修复与复测/);
 assert.doesNotMatch(html,/本轮存在失败、未知、待定项或未完成，不能开始目标负载验证/);
 assert.doesNotMatch(html,/设置并开始负载检查/);
});

test('actual runtime import handler remains on04 instead of jumping to01',async()=>{
 await writeFile(join(output,'hooks.mjs'),"let i=0,s=[];export function reset(){i=0}export function useState(v){let n=i++;if(!(n in s))s[n]=typeof v==='function'?v():v;return[s[n],x=>s[n]=typeof x==='function'?x(s[n]):x]}export function useRef(v){return{current:v}}export function useEffect(){}");
 await writeFile(join(output,'nav-stub.mjs'),"export const useLeaveGuard=()=>({});");
 await writeFile(join(output,'client-stub.mjs'),"export async function api(path,body){if(path!=='/projects')throw new Error('Unexpected '+path);return{projectId:'new-project'}}export const download=()=>{};export const statusNames={};export const friendlyError=x=>x;");
 const original=await readFile(join(output,'ProjectView.mjs'),'utf8');
 await writeFile(join(output,'InteractiveProjectView.mjs'),original.replace("from 'react'","from './hooks.mjs'").replace("from './navigation.mjs'","from './nav-stub.mjs'").replace("from './api/client.mjs'","from './client-stub.mjs'"));
 const {default:Project}=await import(pathToFileURL(join(output,'InteractiveProjectView.mjs')));
 const {reset}=await import(pathToFileURL(join(output,'hooks.mjs')));
 const nodes=t=>Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.props?.children)]:[];
 const text=t=>Array.isArray(t)?t.map(text).join(''):t&&typeof t==='object'?text(t.props?.children):t??'';
 const selected=[];let pending;
 const props={step:4,state:{settings:{},catalog:{matches:[]}},refresh:async()=>{},act:fn=>pending=fn(),select:(...args)=>selected.push(args)};
 const shell=Project(props),runtime=nodes(shell).find(n=>typeof n.type==='function'&&n.type.name==='RuntimeProjectView');
 assert.ok(runtime);
 const render=()=>{reset();return runtime.type(runtime.props)};
 let tree=render();const input=nodes(tree).find(n=>n.type==='input'&&n.props.placeholder?.startsWith('例如'));
 input.props.onChange({target:{value:'synthetic-project'}});tree=render();
 const button=nodes(tree).find(n=>n.type==='button'&&text(n)==='检查项目并继续');
 assert.ok(button);assert.equal(button.props.disabled,false);button.props.onClick();await pending;
 assert.deepEqual(selected,[['new-project',undefined,'step:4']]);
});
