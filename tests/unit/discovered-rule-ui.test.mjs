import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Transpile actual UI modules for pure SSR/behavior tests. No browser or socket is needed.
const root=resolve('.'),source=join(root,'apps/ui/src'),output=await mkdtemp(join(tmpdir(),'cangjie-rule-ui-'));
await symlink(join(root,'node_modules'),join(output,'node_modules'),process.platform==='win32'?'junction':'dir');
async function transpile(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory()){await transpile(path);continue}if(!/\.tsx?$/.test(entry.name))continue;const destination=join(output,relative(source,path).replace(/\.tsx?$/,'.mjs'));await mkdir(dirname(destination),{recursive:true});const code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/(from\s+|import\s*)(['"])(\.\.?\/[^'"]+)\2/g,(_all,prefix,quote,specifier)=>`${prefix}${quote}${specifier.replace(/\.tsx?$/,'')}.mjs${quote}`);await writeFile(destination,code)}}
await transpile(source);
const view=await import(pathToFileURL(join(output,'VerifyView.mjs')).href),client=await import(pathToFileURL(join(output,'api/client.mjs')).href);


const projectId='local-project',ruleId='d5cc3122-c3f4-45b5-a9b2-1b02664da40a';
const ref={projectId,id:ruleId,version:2,contentHash:'b'.repeat(64)};
const version={...ref,flow:'关闭已解决工单',expectedBehavior:['仅所有者可以关闭已解决工单'],answers:{},openQuestions:[],facts:[],expectations:[],sourceRefs:[],suggestionRef:{discoveryId:'analysis-local',suggestionId:'close-ticket'},confirmation:{status:'confirmed'},corrections:[]};
const legacy={id:'save-rule',hash:'legacy-hash',expectedChanges:['保存输入'],invariants:[]};
const dynamic={id:ruleId,hash:'compiled-hash',ruleRef:ref,expectedChanges:['status becomes closed'],invariants:['owner unchanged']};
const template={ruleHash:dynamic.hash,ref:{id:'close-status-template',version:'1.0.0',hash:'template-hash'},applicable:['独立测试环境'],excluded:['生产环境'],instructions:'核对状态变化'};
function fixture({compiled=[],matches=[],versions=[version],gaps=[],choice}={}){const project={id:projectId,name:'工单项目',environmentHash:'environment-hash',executableRules:compiled,ruleCompilationGaps:gaps,catalog:{matches},workflow:{revision:1,flow:'submit',flows:{submit:choice?{[ruleId]:choice}:{}}}};const state={rules:[legacy],catalog:{matches:[template]},projectRules:{[projectId]:{projectId,revision:2,versions}},settings:{model:'test-model',hasKey:true}};return {state,project}}
function render(value){return renderToStaticMarkup(React.createElement(view.default,{...value,refresh:async()=>{},act:()=>{},select:()=>{}}))}
const button=(html,label)=>html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0];

// Drive the real component's event handlers with isolated hook state. Network calls still
// go through the real projectRulesApi/fetch client; no helper-only payload assertions.
await writeFile(join(output,'hook-runtime.mjs'),`let active;
export function createRenderer(component,props){
  const instance={hooks:[],pending:[],index:0};
  return {render(){instance.index=0;instance.pending=[];active=instance;let tree;try{tree=component(props)}finally{active=undefined}for(const effect of instance.pending)effect();return tree}};
}
export function useState(initial){const owner=active,index=owner.index++;if(!(index in owner.hooks))owner.hooks[index]=typeof initial==='function'?initial():initial;return [owner.hooks[index],value=>{owner.hooks[index]=typeof value==='function'?value(owner.hooks[index]):value}]}
export function useRef(value){const owner=active,index=owner.index++;return owner.hooks[index]??(owner.hooks[index]={current:value})}
export function useEffect(effect,deps){const owner=active,index=owner.index++,previous=owner.hooks[index];if(!previous||!deps||deps.some((value,i)=>!Object.is(value,previous.deps[i]))){owner.hooks[index]={deps,cleanup:undefined};owner.pending.push(()=>{previous?.cleanup?.();owner.hooks[index].cleanup=effect()})}}
`);
const interactionSource=await readFile(join(source,'components/ProjectRuleCard.tsx'),'utf8');
const interactionCode=ts.transpileModule(interactionSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/from ['"]react['"]/g,"from '../hook-runtime.mjs'").replace(/(from\s+|import\s*)(['"])(\.\.?\/[^'"]+)\2/g,(_all,prefix,quote,specifier)=>`${prefix}${quote}${specifier.endsWith('.mjs')?specifier:specifier+'.mjs'}${quote}`);
await writeFile(join(output,'components/InteractiveProjectRuleCard.mjs'),interactionCode);
const ruleCard=await import(pathToFileURL(join(output,'components/InteractiveProjectRuleCard.mjs')).href);
const publicContract=await import('@website-verification/contracts/status-transition');
const {createRenderer}=await import(pathToFileURL(join(output,'hook-runtime.mjs')).href);
const {default:StaticRuleCard}=await import(pathToFileURL(join(output,'components/ProjectRuleCard.mjs')).href);
const optInLabel='采用受控工单关闭契约';

test('saved business edits use the original fields and require explicit confirmation before saving a new version',async()=>withCard([version],async(renderer,calls)=>{
 const saved=editor(renderer);let tree=saved.render();click(control(tree,'button','编辑'));tree=saved.render();
 const behavior=control(tree,'textarea','确认后的预期行为（每行一条）');change(behavior,'更新后的业务要求');tree=saved.render();
 assert.equal(control(tree,'button','确认并保存').props.disabled,true);
 change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=saved.render();assert.equal(control(tree,'button','确认并保存').props.disabled,false);
 assert.equal(calls.length,0);assert.ok(!textOf(tree).includes('修订业务预期'));assert.ok(!textOf(tree).includes('修订后的预期行为'));
},'business'));

test('a confirmation conflict after saving an edit leaves a pending version without selecting or running it',async()=>withCard([version],async(renderer,calls,collection)=>{
 collection.rejectConfirmation=true;
 const saved=editor(renderer);let tree=saved.render();click(control(tree,'button','编辑'));tree=saved.render();
 change(control(tree,'textarea','确认后的预期行为（每行一条）'),'人工确认的新预期');tree=saved.render();change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=saved.render();
 click(control(tree,'button','确认并保存'));await tick();await tick();
 assert.deepEqual(calls.map(call=>call.url.split('/').at(-1)),['revise','confirm-version']);
 assert.equal(collection.versions[0].confirmation.status,'pending');assert.equal(collection.versions[0].version,version.version+1);
 assert.ok(textOf(renderer.render()).includes('输入已保留'));
},'business'));
const question='是否符合本项目业务要求？';
const discovery={id:'analysis-local',status:'complete',referencesValid:true,result:{suggestions:[{id:'arbitrary-refund',flow:'任意建议不可自动推断工单契约',openQuestions:[question]}]}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object')return [];return [tree,...nodes(tree.props?.children)]}
function textOf(tree){if(Array.isArray(tree))return tree.map(textOf).join('');if(tree===null||tree===undefined||typeof tree==='boolean')return '';if(typeof tree!=='object')return String(tree);return textOf(tree.props?.children)}
function control(tree,type,label){const element=nodes(tree).find(node=>node.type===type&&(node.props['aria-label']===label||textOf(node)===label));assert.ok(element,`${type} control missing: ${label}`);return element}
function checkbox(tree,label){const field=control(tree,'label',label);return nodes(field).find(node=>node.type==='input'&&node.props.type==='checkbox')}
function change(element,value){assert.equal(!!element.props.disabled,false,'cannot change a disabled UI control');element.props.onChange({target:typeof value==='boolean'?{checked:value}:{value}})}
function click(element){assert.equal(!!element.props.disabled,false,'cannot click a disabled UI control');element.props.onClick()}
async function withCard(versions,action,stage='business'){const previous=globalThis.fetch,calls=[],collection={projectId,revision:2,versions,readiness:[]};globalThis.fetch=async(url,options)=>{let result=collection;if(options?.body){const body=JSON.parse(options.body);calls.push({url,body});if(url.endsWith('/revise')){result={...collection.versions[0],expectedBehavior:body.expectedBehavior,answers:body.answers,requirements:body.requirements,version:collection.versions[0].version+1,confirmation:{status:'pending'}};collection.versions=[result];collection.revision++;}if(url.endsWith('/confirm-version')){if(collection.rejectConfirmation)return new Response(JSON.stringify({error:'RULE_REVISION_CONFLICT'}),{status:409,headers:{'content-type':'application/json'}});result={...collection.versions[0],version:collection.versions[0].version+1,confirmation:{status:'confirmed'}};collection.versions=[result];collection.revision++;}}return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}})};try{const renderer=createRenderer(ruleCard.default,{projectId,session:discovery,collection,stage});renderer.render();await tick();return await action(renderer,calls,collection)}finally{globalThis.fetch=previous}}
function editor(renderer){const saved=nodes(renderer.render()).find(node=>typeof node.type==='function'&&node.props.rule);assert.ok(saved,'saved rule component missing');return createRenderer(saved.type,saved.props)}
function fieldInput(tree,label){return nodes(control(tree,'label',label)).find(node=>node.type==='textarea')}

const loadSource=await readFile(join(output,'components/TargetLoadCard.mjs'),'utf8');
await writeFile(join(output,'components/InteractiveTargetLoadCard.mjs'),loadSource.replace(/from ['"]react['"]/g,"from '../hook-runtime.mjs'"));
const {default:InteractiveLoad}=await import(pathToFileURL(join(output,'components/InteractiveTargetLoadCard.mjs')).href);
const preparationSource=await readFile(join(output,'components/PreparationCard.mjs'),'utf8');
await writeFile(join(output,'components/InteractivePreparationCard.mjs'),preparationSource.replace(/from ['"]react['"]/g,"from '../hook-runtime.mjs'"));
const {default:InteractivePreparation}=await import(pathToFileURL(join(output,'components/InteractivePreparationCard.mjs')).href);

test('a rechecked environment clears an old conditions error but never carries local consent forward',async()=>{
 const previous=globalThis.fetch,calls=[];
 globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify({error:'CONDITIONS_CHANGED_RECONNECT_REQUIRED'}),{status:409,headers:{'content-type':'application/json'}});};
 const props={project:{id:'p',name:'test',environmentHash:'old',environmentCurrent:true,environmentConfirmed:true,data:{seedVersion:'v1',count:2},mapping:{id:'m',version:1},accounts:[]},onReady:async()=>{throw Error('must not prepare automatically')}};
 try{
  const renderer=createRenderer(InteractivePreparation,props);let tree=renderer.render();click(control(tree,'button','执行检查'));await tick();tree=renderer.render();assert.equal(control(tree,'button','执行检查').props.disabled,true);
  Object.assign(props.project,{environmentHash:'rechecked',environmentCurrent:true,environmentConfirmed:false});renderer.render();tree=renderer.render();
  assert.equal(control(tree,'button','执行检查').props.disabled,false);assert.equal(checkbox(tree,'我同意在独立测试副本中创建用户并重置测试数据').props.checked,false);assert.equal(calls.length,1);
 }finally{globalThis.fetch=previous;}
});

test('03 shows Chinese business choices without contracts or version management',()=>{
 const html=renderToStaticMarkup(React.createElement(StaticRuleCard,{projectId,stage:'business',session:{...discovery,result:{suggestions:[{...discovery.result.suggestions[0],flow:'Update ticket title only',expectations:[]}]}},collection:{revision:2,versions:[],readiness:[]}}));
 assert.match(html,/修改工单标题/);assert.match(html,/检查这项业务/);
 assert.doesNotMatch(html,/采用受控工单关闭契约|项目规则版本库|查看旧版本|确认后的预期行为/);
});


test.after(()=>rm(output,{recursive:true,force:true}));

test('03 prefills AI answers only once and preserves explicit edits and clearing without confirming',async()=>{
 const previous=discovery.result.suggestions[0];
 discovery.result.suggestions[0]={...previous,expectations:[{text:'仅订单所有者可以取消'}],suggestedAnswers:{[question]:'建议仅允许所有者操作'}};
 try{await withCard([],async(renderer,calls)=>{
  let tree=renderer.render();change(control(tree,'input','检查'+previous.flow),true);tree=renderer.render();
  assert.equal(control(tree,'textarea',question).props.value,'建议仅允许所有者操作');
  assert.equal(checkbox(tree,'已核对关键问题与业务预期').props.checked,false);
  assert.equal(control(tree,'button','确认并保存项目规则').props.disabled,true);assert.equal(calls.length,0);
  change(control(tree,'textarea',question),'');tree=renderer.render();
  change(control(tree,'input','检查'+previous.flow),false);tree=renderer.render();change(control(tree,'input','检查'+previous.flow),true);tree=renderer.render();
  assert.equal(control(tree,'textarea',question).props.value,'');assert.equal(checkbox(tree,'已核对关键问题与业务预期').props.disabled,true);
  change(control(tree,'textarea',question),'人工核对后的回答');tree=renderer.render();change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=renderer.render();
  change(control(tree,'textarea',question),'再修订回答');tree=renderer.render();assert.equal(checkbox(tree,'已核对关键问题与业务预期').props.checked,false);
  change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=renderer.render();click(control(tree,'button','确认并保存项目规则'));await tick();
  assert.deepEqual(calls[0].body.answers,{[question]:'再修订回答'});assert.equal(calls.length,1);
 },'business');}finally{discovery.result.suggestions[0]=previous;}
});

test('03 Chinese display retains original question keys for confirmation and source text',async()=>{
 const previous=discovery.result.suggestions[0];
 discovery.result.translations={'Who can cancel?':'谁可以取消？','Only owner':'仅所有者可取消','Current code checks status':'当前代码检查状态'};
 discovery.result.suggestions[0]={...previous,openQuestions:['Who can cancel?'],suggestedAnswers:{'Who can cancel?':'建议仅允许订单所有者取消'},expectations:[{text:'Only owner'}],facts:[{text:'Current code checks status',sourceRefs:[]}]};
 try{await withCard([],async(renderer,calls)=>{
  let tree=renderer.render();change(control(tree,'input','检查'+previous.flow),true);tree=renderer.render();
  assert.equal(control(tree,'textarea','谁可以取消？').props.value,'建议仅允许订单所有者取消');
  assert.equal(control(tree,'textarea','确认后的预期行为（每行一条）').props.value,'仅所有者可取消');
  assert.ok(textOf(tree).includes('当前代码检查状态'));assert.ok(!textOf(tree).includes('Who can cancel?'));
  change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=renderer.render();click(control(tree,'button','确认并保存项目规则'));await tick();
  assert.deepEqual(calls[0].body.answers,{'Who can cancel?':'建议仅允许订单所有者取消'});
 },'business');}finally{discovery.result.suggestions[0]=previous;delete discovery.result.translations;}
});

test('translated saved rules remain clean until edited and never rewrite history on confirmation',async()=>{
 discovery.result.translations={'Who can cancel?':'谁可以取消？','Only owner':'仅所有者可取消'};
 const stored={...version,confirmation:{status:'pending'},openQuestions:['Who can cancel?'],answers:{'Who can cancel?':'Only owner'},expectedBehavior:['Only owner']};
 try{await withCard([stored],async(renderer,calls)=>{
  const saved=editor(renderer);let tree=saved.render();assert.ok(textOf(tree).includes('谁可以取消？'));assert.ok(!textOf(tree).includes('Who can cancel?'));
  change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=saved.render();assert.equal(control(tree,'button','确认并保存').props.disabled,false);
  click(control(tree,'button','编辑'));tree=saved.render();assert.equal(fieldInput(tree,'预期行为（请核对，可修改）').props.value,'仅所有者可取消');
  click(control(tree,'button','取消编辑'));tree=saved.render();change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=saved.render();click(control(tree,'button','确认并保存'));await tick();
  assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/confirm-version'));assert.deepEqual(stored.expectedBehavior,['Only owner']);assert.deepEqual(stored.answers,{'Who can cancel?':'Only owner'});
 });}finally{delete discovery.result.translations;}
});

test('compile API sends the exact reference to the project-specific endpoint',async()=>{
  assert.equal(typeof client.projectRulesApi.compile,'function','explicit compile API is missing');
  const previous=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({status:'blocked',ruleRef:ref,missing:[{code:'RULE_CAPABILITY_GAP',detail:'未支持的状态语义'}]}),{headers:{'content-type':'application/json'}})};
  try{const result=await client.projectRulesApi.compile('project/one','rule/two',{ruleRef:ref});assert.equal(result.status,'blocked');assert.equal(calls[0].url,'/api/projects/project%2Fone/rules/rule%2Ftwo/compile');assert.deepEqual(JSON.parse(calls[0].options.body),{ruleRef:ref})}finally{globalThis.fetch=previous}
});

test('verification only exposes legacy plus compiled exact current confirmed local versions',()=>{
  assert.equal(typeof view.verificationRules,'function','compiled rules are not integrated');
  const stale={...dynamic,ruleRef:{...ref,version:1}},foreign={...dynamic,id:'foreign',ruleRef:{...ref,projectId:'other'}},unconfirmed={...dynamic,id:'unconfirmed',ruleRef:{...ref,id:'unconfirmed'}};
  const value=fixture({compiled:[dynamic,stale,foreign,unconfirmed],versions:[version,{...version,id:'unconfirmed',confirmation:{status:'pending'}}]});
  assert.deepEqual(view.verificationRules(value.state,value.project),[legacy,dynamic]);
  assert.deepEqual(view.verificationRules(value.state,{...value.project,id:'other'}),[legacy]);
});

test('catalog selection uses current project matches and never globally exposes dynamic matches',()=>{
  assert.equal(typeof view.verificationCatalog,'function','project catalog is not integrated');
  const value=fixture({compiled:[dynamic]});assert.deepEqual(view.verificationCatalog(value.state,value.project).matches,[]);
  assert.deepEqual(view.verificationCatalog(value.state,{...value.project,catalog:undefined}).matches,[]);
  const local=fixture({compiled:[dynamic],matches:[template]});assert.deepEqual(view.verificationCatalog(local.state,local.project).matches,[template]);
});

test('candidate and run request builders preserve exact dynamic refs without legacy title defaults',()=>{
  assert.equal(typeof view.candidateRequest,'function','dynamic candidate request is missing');
  assert.equal(typeof view.verificationCheck,'function','dynamic run check is missing');
  assert.deepEqual(view.candidateRequest(dynamic,true),{ruleRef:ref,confirmRule:true,resume:true});
  assert.deepEqual(view.candidateRequest(legacy,false),{ruleId:legacy.id,confirmRule:true,resume:false});
  assert.deepEqual(view.verificationCheck(dynamic,true,template.ref),{ruleRef:ref,confirmed:true,templateRef:template.ref});
  assert.deepEqual(view.verificationCheck(legacy,false,template.ref),{ruleId:legacy.id,confirmed:false,templateRef:template.ref});
});

test('confirmed project versions require explicit compilation and cannot prepare a run from resources alone',()=>{
  const html=render(fixture());assert.ok(button(html,'编译此精确规则版本'),'confirmed rule needs an explicit compile control');assert.match(html,/编译不会生成合格方案/);assert.match(button(html,'准备本轮检查'),/disabled/);assert.doesNotMatch(html,/修订业务预期<\/button>/);
  const pending=render(fixture({versions:[{...version,expectedBehavior:publicContract.statusTransitionBehavior,confirmation:{status:'pending'}}]}));assert.match(button(pending,'编译此精确规则版本'),/disabled/);
});

test('compilation gaps show semantic details without presenting the rule as executable',()=>{
  const html=render(fixture({gaps:[{ruleRef:ref,missing:[{code:'RULE_CAPABILITY_GAP',detail:'没有可信的退款状态验证资源'}]}]}));assert.match(html,/没有可信的退款状态验证资源/);assert.match(html,/RULE_CAPABILITY_GAP/);assert.match(button(html,'准备本轮检查'),/disabled/);
});

test('compiled rules remain behind candidate generation and dual-review template admission',()=>{
  const choice={enabled:true,confirmed:true,ruleHash:dynamic.hash,environmentHash:'environment-hash'};
  const html=render(fixture({compiled:[dynamic],choice}));assert.match(html,/关闭已解决工单/);assert.match(html,/已编译，尚需生成与审核检查方案/);assert.ok(button(html,'调用模型创建检查方案'));assert.match(button(html,'准备本轮检查'),/disabled/);
  const ready=render(fixture({compiled:[dynamic],matches:[template],choice:{...choice,version:template.ref.hash}}));assert.doesNotMatch(button(ready,'准备本轮检查'),/disabled/);assert.match(ready,/close-status-template/);
});

test('a dynamic candidate continues in the existing automatic validation and review chain',()=>{
  const value=fixture({compiled:[dynamic]});value.project.candidate={id:'candidate-local',ruleId,ruleRef:ref,status:'needs_capability',phase:'awaiting_trial',code:'TARGET_TRIAL_EVIDENCE_INCOMPLETE',reference:{applicable:[],excluded:[],instructions:''}};
  const html=render(value);assert.match(html,/检查方案验证与审核/);assert.match(html,/自动验证/);assert.match(html,/确认并发布/);
});

test('an old dynamic candidate cannot appear as the current exact version review or resume',()=>{
  assert.equal(typeof view.candidateMatchesRule,'function','dynamic candidate binding must compare exact references');
  const stale={id:'candidate-old',ruleId,ruleRef:{...ref,version:1},status:'ready_for_review',phase:'review',reference:{applicable:[],excluded:[],instructions:''}};
  assert.equal(view.candidateMatchesRule(stale,dynamic),false);
  assert.equal(view.candidateMatchesRule({...stale,ruleRef:ref},dynamic),true);
  assert.equal(view.candidateMatchesRule({...stale,ruleRef:undefined},dynamic),false);
  assert.equal(view.candidateMatchesRule({ruleId:legacy.id},legacy),true);
  const value=fixture({compiled:[dynamic],choice:{enabled:true,confirmed:true,ruleHash:dynamic.hash,environmentHash:'environment-hash'}});value.project.candidate=stale;
  const html=render(value);assert.doesNotMatch(html,/审核这条检查方案<\/button>/);assert.ok(button(html,'调用模型创建检查方案'));assert.match(html,/<div hidden=""><section class="card candidate-review"/);
});

test('03 confirms only selected business expectations without binding a contract',async()=>withCard([],async(renderer,calls)=>{
 let tree=renderer.render();assert.equal(nodes(tree).some(n=>n.type==='textarea'),false);
 change(checkbox(tree,'检查这项业务'),true);tree=renderer.render();
 assert.equal(checkbox(tree,'已核对关键问题与业务预期').props.disabled,true);
 change(control(tree,'textarea',question),'  用户独立确认  ');tree=renderer.render();
 change(control(tree,'textarea','确认后的预期行为（每行一条）'),'  退款由财务复核  ');tree=renderer.render();
 change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=renderer.render();
 click(control(tree,'button','确认并保存项目规则'));await tick();
 assert.deepEqual(calls,[{url:`/api/projects/${projectId}/rules/confirm`,body:{discoveryId:discovery.id,suggestionId:'arbitrary-refund',expectedRevision:2,answers:{[question]:'用户独立确认'},expectedBehavior:['退款由财务复核'],confirmed:true}}]);
}, 'business'));

test('editing a selected business expectation clears confirmation without adding contract requirements',async()=>withCard([],async(renderer,calls)=>{
 let tree=renderer.render();change(checkbox(tree,'检查这项业务'),true);tree=renderer.render();
 change(control(tree,'textarea',question),'用户确认');tree=renderer.render();change(control(tree,'textarea','确认后的预期行为（每行一条）'),'仅所有者可修改标题');tree=renderer.render();
 change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=renderer.render();
 change(control(tree,'textarea','确认后的预期行为（每行一条）'),'仅所有者可修改标题，优先级不变');tree=renderer.render();
 assert.equal(checkbox(tree,'已核对关键问题与业务预期').props.checked,false);assert.equal(calls.length,0);
}, 'business'));
test('actual free revision preserves existing controlled bindings without implicitly adopting contract semantics',async()=>withCard([{...version,expectedBehavior:publicContract.statusTransitionBehavior,requirements:publicContract.statusTransitionRequirements}],async(renderer,calls)=>{
  const saved=editor(renderer);let tree=saved.render();click(control(tree,'button','编辑'));tree=saved.render();assert.equal(checkbox(tree,optInLabel).props.checked,false);
  change(fieldInput(tree,'预期行为（请核对，可修改）'),publicContract.statusTransitionBehavior.join('\n'));tree=saved.render();change(fieldInput(tree,'修改原因（选填）'),'明确保留当前能力绑定');tree=saved.render();change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=saved.render();click(control(tree,'button','确认并保存'));await tick();
  assert.deepEqual(calls[0],{url:`/api/projects/${projectId}/rules/${ruleId}/revise`,body:{expectedRevision:2,expectedBehavior:publicContract.statusTransitionBehavior,answers:{},note:'明确保留当前能力绑定',requirements:publicContract.statusTransitionRequirements}});
}));

test('revision opt-in is unsaved semantic state and converts a free version through actual revision API before confirmation',async()=>withCard([{...version,expectedBehavior:publicContract.statusTransitionBehavior,confirmation:{status:'pending'}}],async(renderer,calls)=>{
  const saved=editor(renderer);let tree=saved.render();click(control(tree,'button','编辑'));tree=saved.render();change(checkbox(tree,optInLabel),true);tree=saved.render();
  assert.equal(fieldInput(tree,'预期行为（请核对，可修改）').props.disabled,true);
  click(control(tree,'button','取消编辑'));tree=saved.render();assert.equal(control(tree,'button','确认并保存').props.disabled,true,'cancelled edit must not leave a confirmation checked');
  click(control(tree,'button','编辑'));tree=saved.render();change(checkbox(tree,optInLabel),true);tree=saved.render();change(fieldInput(tree,'修改原因（选填）'),'明确采用受控关闭契约');tree=saved.render();change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=saved.render();click(control(tree,'button','确认并保存'));await tick();
  assert.deepEqual(calls[0],{url:`/api/projects/${projectId}/rules/${ruleId}/revise`,body:{expectedRevision:2,expectedBehavior:publicContract.statusTransitionBehavior,answers:{},note:'明确采用受控关闭契约',requirements:publicContract.statusTransitionRequirements}});assert.equal(calls.length,2);assert.ok(calls[1].url.endsWith('/confirm-version'));assert.equal(calls[1].body.version,version.version+1);assert.equal(calls[1].body.confirmed,true);
}));


test('discarding unsaved contract selection restores free current-version confirmation without issuing an API request',async()=>withCard([{...version,expectedBehavior:publicContract.statusTransitionBehavior,confirmation:{status:'pending'}}],async(renderer,calls)=>{
  const saved=editor(renderer);let tree=saved.render();click(control(tree,'button','编辑'));tree=saved.render();change(checkbox(tree,optInLabel),true);tree=saved.render();click(control(tree,'button','取消编辑'));tree=saved.render();
  assert.equal(nodes(tree).some(node=>node.type==='button'&&textOf(node)==='取消编辑'),false);assert.equal(calls.length,0);
  change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=saved.render();assert.equal(control(tree,'button','确认并保存').props.disabled,false);
  click(control(tree,'button','编辑'));tree=saved.render();assert.equal(checkbox(tree,optInLabel).props.checked,false);assert.equal(fieldInput(tree,'预期行为（请核对，可修改）').props.value,publicContract.statusTransitionBehavior.join('\n'));
}));

test('an unchecked free revision does not add controlled requirements to an unbound version',async()=>withCard([version],async(renderer,calls)=>{
  const saved=editor(renderer);let tree=saved.render();click(control(tree,'button','编辑'));tree=saved.render();change(fieldInput(tree,'修改原因（选填）'),'只补充业务回答');tree=saved.render();change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=saved.render();click(control(tree,'button','确认并保存'));await tick();
  assert.deepEqual(calls[0].body.expectedBehavior,version.expectedBehavior);assert.equal(Object.hasOwn(calls[0].body,'requirements'),false);assert.equal(calls.length,2);
}));

test('stale-source history blocks selection and confirmation while real correction handler appends exact reference',async()=>{
  await withCard([{...version,sourceCurrent:false}],async(renderer,calls)=>{
    const saved=editor(renderer);let tree=saved.render();
    click(control(tree,'button','编辑'));tree=saved.render();assert.equal(control(tree,'button','确认并保存').props.disabled,true);
    assert.ok(textOf(tree).includes('来源已变化，请重新分析后核对'));
    change(fieldInput(tree,'问题说明'),'保留旧预期，需要重新分析并核对。');tree=saved.render();click(control(tree,'button','保存问题并标记待确认'));await tick();await tick();
    const sent=calls.find(c=>c.url.endsWith('/corrections'));assert.ok(sent,'real correction request missing');assert.deepEqual(sent.body,{ruleRef:ref,note:'保留旧预期，需要重新分析并核对。',expectedRevision:2});assert.equal(sent.url,`/api/projects/${projectId}/rules/${ruleId}/corrections`);
  });
});
test('source-invalidated versions cannot be displayed as executable or offered for compilation',()=>{const value=fixture({compiled:[dynamic],versions:[{...version,sourceCurrent:false}]});assert.deepEqual(view.verificationRules(value.state,value.project),[legacy]);const html=render(value);assert.match(button(html,'编译此精确规则版本'),/disabled/);assert.match(html,/来源已变化，请重新分析/);});

const loadProps=()=>({project:{id:'p',environmentConfirmed:true,data:{count:0},journey:{rate:'2',durationSeconds:'10'}},run:{id:'run-a',status:'completed',checks:[{rule:{id:'save-rule'},mode:'verify',verdicts:[{status:'pass'}]}]},state:{loads:[],loadPreset:{}},refresh:async()=>{},act:()=>{}});
const rateField=tree=>nodes(tree).find(n=>n.type==='input'&&n.props.type==='number');
test('load form blocks fractional or excessive rates before dispatch',()=>{
 const renderer=createRenderer(InteractiveLoad,loadProps());let tree=renderer.render();
 for(const value of ['0.5','101']){rateField(tree).props.onChange({target:{value}});tree=renderer.render();nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});tree=renderer.render();assert.equal(control(tree,'button','执行目标负载检查').props.disabled,true)}
});
test('load form follows external saved targets when untouched and clears consent',()=>{
 const props=loadProps(),renderer=createRenderer(InteractiveLoad,props);let tree=renderer.render();
 nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
 props.project.journey={rate:'5',durationSeconds:'20'};renderer.render();tree=renderer.render();
 assert.equal(rateField(tree).props.value,'5');
 assert.equal(nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox').props.checked,false);
});
test('load form preserves edits and blocks execution until changed targets are reconciled',()=>{
 const props=loadProps(),renderer=createRenderer(InteractiveLoad,props);let tree=renderer.render();
 rateField(tree).props.onChange({target:{value:'3'}});renderer.render();
 props.project.journey={rate:'8',durationSeconds:'30'};renderer.render();tree=renderer.render();
 assert.equal(rateField(tree).props.value,'3');assert.match(textOf(tree),/已保存的检查目标已变化/);
 assert.equal(nodes(tree).find(n=>n.type==='button'&&textOf(n)==='执行目标负载检查').props.disabled,true);
 nodes(tree).find(n=>n.type==='button'&&textOf(n)==='使用最新检查目标').props.onClick();tree=renderer.render();
 assert.equal(rateField(tree).props.value,'8');assert.doesNotMatch(textOf(tree),/已保存的检查目标已变化/);
});
test('new run load instance has fresh proportions and no old consent',()=>{
 const first=loadProps(),one=createRenderer(InteractiveLoad,first);let tree=one.render();
 nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
 const next=loadProps();next.run={...next.run,id:'run-b',checks:[...next.run.checks,{rule:{id:'other'},mode:'verify',verdicts:[{status:'pass'}]}]};
 tree=createRenderer(InteractiveLoad,next).render();
 assert.equal(nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox').props.checked,false);
 assert.equal(nodes(tree).find(n=>n.type==='button'&&textOf(n)==='执行目标负载检查').props.disabled,true);
});
test('numbered preparation integrates capability action without a duplicate compilation panel',()=>{
 const value=fixture();value.project.supported=true;
 value.state.projectRules[projectId].readiness=[{ruleRef:ref,status:'generatable',missing:[]}];
 const html=render({...value,step:5});
 assert.match(html,/准备并加入本轮检查/);assert.doesNotMatch(html,/编译已确认的项目规则/);
});


test('business editing never offers a closing contract for a title-editing business',async()=>withCard([{...version,flow:'Update ticket title only',expectedBehavior:publicContract.statusTransitionBehavior}],async(renderer,calls)=>{
  const saved=editor(renderer);let tree=saved.render();click(control(tree,'button','编辑'));tree=saved.render();
  assert.equal(nodes(tree).some(n=>n.type==='input'&&n.props.type==='checkbox'&&textOf(n)===optInLabel),false);
  assert.ok(!textOf(tree).includes('采用受控工单关闭契约'));
  assert.equal(calls.length,0);
}));


test('unknown English businesses keep distinct Chinese names in compiled selection',()=>{
 const second={...version,id:'second-rule',flow:'Another unknown business'};const first={...version,flow:'Unknown business'};
 const html=render(fixture({versions:[first,second],compiled:[dynamic,{...dynamic,id:'second-rule',ruleRef:{...ref,id:'second-rule'}}]}));
 assert.match(html,/aria-label="项目业务1"/);assert.match(html,/aria-label="项目业务2"/);
});
