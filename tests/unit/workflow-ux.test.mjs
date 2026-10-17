import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const root=resolve('.'),source=join(root,'apps/ui/src'),output=await mkdtemp(join(tmpdir(),'cangjie-ux-'));
await symlink(join(root,'node_modules'),join(output,'node_modules'),process.platform==='win32'?'junction':'dir');
async function transpile(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory()){await transpile(path);continue;}if(!/\.tsx?$/.test(entry.name))continue;const destination=join(output,relative(source,path).replace(/\.tsx?$/,'.mjs'));await mkdir(dirname(destination),{recursive:true});const code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/(from\s+|import\s*)(['"])(\.\.?\/[^'"]+)\2/g,(_all,prefix,quote,specifier)=>`${prefix}${quote}${specifier.replace(/\.tsx?$/,'')}.mjs${quote}`);await writeFile(destination,code);}}
await transpile(source);
const load=async name=>(await import(pathToFileURL(join(output,name+'.mjs')).href)).default;
const Report=await load('ReportView'),Settings=await load('SettingsView');
const {friendlyError}=await import(pathToFileURL(join(output,'api/client.mjs')).href);
test.after(()=>rm(output,{recursive:true,force:true}));
const state={runs:[{id:'r1',projectId:'p',flow:{title:'合成记录'},status:'completed',startedAt:'2026-10-15T00:00:00Z'}],settings:{serviceUrl:'http://localhost',model:'fixture',remembered:false,connection:{status:'not_checked'}},preset:{}};
const props={state,project:{id:'p',name:'合成项目'},act:()=>{},refresh:async()=>{},select:()=>{}};
const render=(component,extra={})=>renderToStaticMarkup(React.createElement(component,{...props,...extra}));
test('existing history asks the user to select a run, not execute again',()=>{
 const html=render(Report,{step:11});assert.match(html,/请选择一次运行/);assert.doesNotMatch(html,/尚无验证结果|开始一次检查/);
});
test('model settings name the exact return step and explicitly disclose the model check',()=>{
 const html=render(Settings,{settingsReturn:'step:2'});assert.match(html,/返回：了解与分析业务/);assert.match(html,/保存并调用模型检查连接/);
});
test('stopped analysis preserves the diagnostic code and explains incomplete output',()=>{
 assert.match(friendlyError('TRUNCATED_OUTPUT'),/输出不完整/);assert.match(friendlyError('TRUNCATED_OUTPUT'),/TRUNCATED_OUTPUT/);
});
