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

test('03 permits confirmed project business before compilation while pending or stale business stays blocked',async()=>{
 const {default:Verify}=await import(pathToFileURL(join(output,'VerifyView.mjs')));
 const rule={id:'r',projectId:'p',version:1,contentHash:'h',flow:'报名业务',expectedBehavior:['提交后保存报名内容'],answers:{},confirmation:{status:'confirmed'},sourceCurrent:true,suggestionRef:{discoveryId:'d',suggestionId:'s'}};
 for(const [changes,disabled] of [[{},false],[{sourceCurrent:false},true],[{confirmation:{status:'pending'}},true]]){
  const html=renderToStaticMarkup(React.createElement(Verify,{step:3,project:{id:'p',sourceOnly:true},state:{settings:{},rules:[],catalog:{matches:[]},projectRules:{p:{revision:1,versions:[{...rule,...changes}]}}},refresh:async()=>{},act:()=>{},select:()=>{}}));
  const button=html.match(/<button[^>]*>保存并继续：运行检查<\/button>/)?.[0];
  assert.ok(button);assert.equal(button.includes('disabled'),disabled);
 }
});

test('02 presents project AI and manual entry without scope or prompt forms, including after a failed analysis',async()=>{
 const {default:Discovery}=await import(pathToFileURL(join(output,'components/BusinessDiscovery.mjs')));
 const props={project:{id:'p',name:'project'},state:{settings:{}},refresh:async()=>{},select:()=>{}};
 for(const session of [undefined,{id:'s',status:'failed',budget:{calls:1,tokens:20},reads:[],unresolved:['TRUNCATED_OUTPUT'],recovery:{allowed:true,message:'可继续'}}]){
  const html=renderToStaticMarkup(React.createElement(Discovery,{...props,project:{...props.project,discovery:session}}));
  assert.match(html,/>AI读取项目分析<\/h2>/);assert.match(html,/>自行填写业务<\/h2>/);
  assert.match(html,/>读取项目<\/button>/);assert.match(html,/>自行填写并确认业务<\/button>/);
  assert.doesNotMatch(html,/<textarea|修改分析范围|重点关注什么/);
 }
});

test('saved response recovery is explicitly local and enabled without a model key',async()=>{
 const {default:Discovery}=await import(pathToFileURL(join(output,'components/BusinessDiscovery.mjs')));
 const session={id:'s',status:'failed',budget:{calls:1,tokens:20},reads:[],unresolved:['INVALID_DISCOVERY_OUTPUT'],recovery:{allowed:true,reason:'saved_response',message:'已保存响应'}};
 const html=renderToStaticMarkup(React.createElement(Discovery,{project:{id:'p',name:'project',discovery:session},state:{settings:{}},refresh:async()=>{},select:()=>{}}));
 const button=html.match(/<button[^>]*>恢复已保存的业务草稿（不调用模型）<\/button>/)?.[0];
 assert.ok(button);assert.doesNotMatch(button,/disabled/);assert.doesNotMatch(html,/>继续原分析（调用模型）<\/button>/);
});

test('completed analysis has one next action and keeps its report behind a detail control',async()=>{
 const {default:Discovery}=await import(pathToFileURL(join(output,'components/BusinessDiscovery.mjs')));
 const session={id:'s',status:'completed',budget:{calls:1,tokens:20},reads:[],unresolved:[],result:{summary:'报名系统',objects:[],roles:[],flows:[],suggestions:[],limitations:[]}};
 const html=renderToStaticMarkup(React.createElement(Discovery,{project:{id:'p',name:'报名系统',discovery:session},state:{settings:{}},refresh:async()=>{},select:()=>{}}));
 assert.match(html,/>继续：确认范围与预期<\/button>/);
 assert.match(html,/查看业务分析报告/);
 assert.doesNotMatch(html,/>AI读取项目分析<\/h2>|>自行填写业务<\/h2>|>核对这项业务<\/button>|>建议核对的业务<\/h2>/);
});

test('plan preparation does not repeat business editing or version selection',async()=>{
 const {default:Card}=await import(pathToFileURL(join(output,'components/ProjectRuleCard.mjs')));
 const rule={id:'r',projectId:'p',version:1,contentHash:'h',flow:'报名业务',expectedBehavior:['仅本人可查看'],answers:{},openQuestions:[],facts:[],expectations:[],sourceRefs:[],corrections:[],confirmation:{status:'confirmed'},sourceCurrent:true,suggestionRef:{discoveryId:'d',suggestionId:'s'}};
 const html=renderToStaticMarkup(React.createElement(Card,{projectId:'p',stage:'plan',collection:{revision:1,versions:[rule],readiness:[]},prepareAction:()=>React.createElement('button',{},'准备这项业务的检查')}));
 assert.match(html,/准备已确认业务的检查/);
 assert.match(html,/准备这项业务的检查/);
 assert.doesNotMatch(html,/契约绑定与版本管理|选择此版本|项目规则草稿|修订业务预期|追加纠正记录|<textarea/);
});
test('step11 does not mount a hidden second load-execution form',()=>{
 const run={id:'r',projectId:'p',status:'completed',kind:'verification',flow:{title:'示例'},plan:{sourceHash:'h',mapping:{}},checks:[],uncovered:[],startedAt:'2026-10-15',events:[]};
 const props={step:11,project:{id:'p',sourceHash:'h',mapping:{}},run,state:{runs:[run],loads:[],catalog:{matches:[]}},refresh:async()=>{},act:()=>{},select:()=>{}};
 const html=renderToStaticMarkup(React.createElement(Report,props));
 assert.match(html,/导出与保存/);assert.match(html,/修复与复测/);
 assert.doesNotMatch(html,/本轮存在失败、未知、待定项或未完成，不能开始目标负载验证/);
 assert.doesNotMatch(html,/执行目标负载检查|核对目标与限制/);
});

test('selected report precedes history in reading order while an unselected report keeps the picker first',()=>{
 const run={id:'r',projectId:'p',status:'completed',kind:'verification',flow:{title:'示例'},plan:{sourceHash:'h',mapping:{}},checks:[],uncovered:[],startedAt:'2026-10-15',events:[]};
 const props={step:11,project:{id:'p',sourceHash:'h',mapping:{}},state:{runs:[run],loads:[],catalog:{matches:[]}},refresh:async()=>{},act:()=>{},select:()=>{}};
 for(const selected of [true,false]){
  const html=renderToStaticMarkup(React.createElement(Report,{...props,run:selected?run:undefined}));
  assert.equal(html.indexOf('id="report-panel-result"')<html.indexOf('>运行记录</h2>'),selected);
 }
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
 let tree=render();const input=nodes(tree).find(n=>n.type==='input'&&n.props.placeholder?.startsWith('粘贴完整路径'));
 input.props.onChange({target:{value:'synthetic-project'}});tree=render();
 const button=nodes(tree).find(n=>n.type==='button'&&text(n)==='检查并准备环境');
 assert.ok(button);assert.equal(button.props.disabled,false);button.props.onClick();await pending;
 assert.deepEqual(selected,[['new-project',undefined,'step:4']]);
});

test('primary navigation has four stages and technical tasks stay in the current stage',async()=>{
 const {default:Journey}=await import(pathToFileURL(join(output,'components/WorkflowJourney.mjs')));
 const {default:Tasks}=await import(pathToFileURL(join(output,'components/WorkflowTasks.mjs')));
 const html=renderToStaticMarkup(React.createElement(Journey,{step:5}));
 assert.equal((html.match(/aria-current="step"/g)??[]).length,1);
 for(const title of ['选择项目','确认检查','运行检查','处理结果'])assert.match(html,new RegExp(title));
 assert.doesNotMatch(html,/06|07|08|独立验证方案|已完成|业务通过/);
 const tasks=renderToStaticMarkup(React.createElement(Tasks,{step:5,state:{},project:{id:'p'}}));
 assert.match(tasks,/运行条件/);assert.match(tasks,/检查方法/);assert.match(tasks,/方案审核/);assert.match(tasks,/开始检查/);
 assert.doesNotMatch(tasks,/整理业务|确认范围与预期/);
 assert.equal(renderToStaticMarkup(React.createElement(Tasks,{step:11,state:{}})),'');
});

test('failed report prioritizes external repair and nests format exports',()=>{
 const run={id:'r',projectId:'p',status:'completed',kind:'verification',flow:{title:'示例'},plan:{sourceHash:'h',mapping:{}},checks:[{mode:'verify',rule:{id:'r',expectedChanges:['x'],invariants:[]},templateRef:{id:'t',version:1},observations:[],actions:[],verdicts:[{status:'fail',assertionRef:'a',evidenceRefs:[]}]}],uncovered:[],startedAt:'2026-10-15',events:[]};
 const html=renderToStaticMarkup(React.createElement(Report,{step:11,project:{id:'p',sourceHash:'h',mapping:{}},run,state:{runs:[run],loads:[],catalog:{matches:[]}},refresh:async()=>{},act:()=>{},select:()=>{}}));
 assert.match(html,/预览修复材料/);assert.doesNotMatch(html,/交给其他agent修复（下载报告）/);assert.match(html,/<summary>更多导出格式与备份<\/summary>/);
});

test('result differences show before, expectation and observed values with escaped content and separate passing evidence',async()=>{
 const {default:Checks}=await import(pathToFileURL(join(output,'components/ResultChecks.mjs')));
 const c={mode:'verify',rule:{id:'edit',expectedChanges:['只改标题'],invariants:['归属不变']},actions:[{stepId:'before',actionId:'before',checkId:'edit'},{stepId:'after',actionId:'after',checkId:'edit'}],observations:[{actionId:'before',result:{ownerId:'owner'},evidenceRefs:['e:before']},{actionId:'after',result:{ownerId:'<script>other</script>'},evidenceRefs:['e:after']}],template:{steps:[{stepId:'before',output:'before'},{stepId:'after',output:'after'}],assertions:[{id:'owner',expr:{op:'eq',args:[{op:'field',var:'after',path:['ownerId']},{op:'field',var:'before',path:['ownerId']}]}}]},verdicts:[{assertionRef:'owner',checkId:'edit',status:'fail',reasonCode:'ASSERTION_FALSE',evidenceRefs:['e:before','e:after']}]};
 const render=()=>renderToStaticMarkup(React.createElement(Checks,{run:{checks:[c]}}));
 const html=render();assert.match(html,/操作前/);assert.match(html,/操作后／实际观察/);assert.match(html,/&lt;script&gt;other/);assert.doesNotMatch(html,/<script>/);assert.match(html,/e:before/);
 c.verdicts[0].status='pass';assert.match(render(),/<summary>查看通过项的结果对照<\/summary>/);
 c.verdicts[0].status='inconclusive';assert.match(render(),/局部值不能证明通过或失败/);
 c.mode='observe';assert.doesNotMatch(render(),/difference-values/);
});

test('04 reuses imported directory and has one runtime preparation action',async()=>{
 const {default:Project}=await import(pathToFileURL(join(output,'ProjectView.mjs')));
 const html=renderToStaticMarkup(React.createElement(Project,{step:4,project:{id:'p',name:'project',directory:'sample',sourceOnly:true,journey:{businessNotes:'已确认的业务'}},state:{settings:{},catalog:{matches:[]}},refresh:async()=>{},act:()=>{},select:()=>{}}));
 const runtime=html.slice(html.indexOf('沿用已选项目'));
 assert.match(runtime,/已确认的业务/);assert.match(runtime,/检查并准备环境/);
 assert.doesNotMatch(runtime,/>导入源码<\/button>|>网站用途<textarea/);
 assert.match(runtime,/方案生成材料（与业务分析分别授权）/);
});


test('preparation keeps the current blocker visible and folds technical progress',async()=>{
 const {default:Preparation}=await import(pathToFileURL(join(output,'components/PlanPreparation.mjs')));
 const html=renderToStaticMarkup(React.createElement(Preparation,{selected:1,reusable:0,candidate:{status:'paused',code:'SYNTHETIC_BLOCKER'},onReview:()=>{}}));
 assert.match(html,/<details><summary>查看方案准备过程<\/summary><ol/);
 assert.match(html,/方案准备受阻/);
 assert.ok(html.indexOf('方案准备受阻')<html.indexOf('查看方案准备过程'));
 assert.doesNotMatch(html,/<details open/);
});

test('published preparation drops expired review guidance but keeps other blockers visible',async()=>{
 const {default:Preparation}=await import(pathToFileURL(join(output,'components/PlanPreparation.mjs')));
 const props={selected:1,reusable:1,candidate:{status:'ready_for_review',code:'REVIEW_REQUIRED'},onReview:()=>{}};
 const pending=renderToStaticMarkup(React.createElement(Preparation,props));
 assert.match(pending,/请先保存当前方案的审核材料/);
 const published=renderToStaticMarkup(React.createElement(Preparation,{...props,published:true}));
 assert.match(published,/已发布/);assert.match(published,/已有合格方案/);
 assert.doesNotMatch(published,/请先保存当前方案的审核材料/);
 const unmatched=renderToStaticMarkup(React.createElement(Preparation,{...props,published:true,reusable:0}));
 assert.doesNotMatch(unmatched,/请先保存当前方案的审核材料|方案准备受阻/);
 const blocked=renderToStaticMarkup(React.createElement(Preparation,{...props,published:true,candidate:{status:'paused',code:'SYNTHETIC_BLOCKER'}}));
 assert.match(blocked,/SYNTHETIC_BLOCKER/);
});

test('retest comparison exposes both recorded actual values and evidence',async()=>{
 const {default:Comparison}=await import(pathToFileURL(join(output,'components/RunComparison.mjs')));
 const makeCheck=value=>({rule:{id:'r',confirmation:'confirmed',expectedChanges:['保存预期内容'],invariants:[]},templateRef:{id:'t',version:'1',hash:'a'.repeat(64)},mode:'verify',status:'completed',template:{parameters:{title:'expected'},steps:[{stepId:'query',output:'saved'}],assertions:[{id:'a',expr:{op:'eq',args:[{op:'field',var:'saved',path:['title']},{op:'field',var:'params',path:['title']}]}}]},actions:[{actionId:'query',stepId:'query',checkId:'save'}],observations:[{actionId:'query',result:{title:value},evidenceRefs:['e']}],verdicts:[{status:value==='expected'?'pass':'fail',checkId:'save',assertionRef:'a',evidenceRefs:['e']}]});
 const old={id:'old',projectId:'p',flow:{title:'保存'},startedAt:'2026-10-17',status:'completed',plan:{sourceHash:'a',mapping:{}},checks:[makeCheck('wrong')],uncovered:[]},next={...old,id:'next',parentRunId:'old',checks:[makeCheck('expected')]};
 const html=renderToStaticMarkup(React.createElement(Comparison,{run:next,state:{runs:[old,next]},select:()=>{}}));
 assert.match(html,/上次实际值/);assert.match(html,/本次实际值/);assert.match(html,/wrong/);assert.match(html,/expected/);assert.match(html,/证据引用/);
});
