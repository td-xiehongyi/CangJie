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
const question='是否符合本项目业务要求？';
const discovery={id:'analysis-local',status:'complete',referencesValid:true,result:{suggestions:[{id:'arbitrary-refund',flow:'任意建议不可自动推断工单契约',openQuestions:[question]}]}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object')return [];return [tree,...nodes(tree.props?.children)]}
function textOf(tree){if(Array.isArray(tree))return tree.map(textOf).join('');if(tree===null||tree===undefined||typeof tree==='boolean')return '';if(typeof tree!=='object')return String(tree);return textOf(tree.props?.children)}
function control(tree,type,label){const element=nodes(tree).find(node=>node.type===type&&(node.props['aria-label']===label||textOf(node)===label));assert.ok(element,`${type} control missing: ${label}`);return element}
function checkbox(tree,label){const field=control(tree,'label',label);return nodes(field).find(node=>node.type==='input'&&node.props.type==='checkbox')}
function change(element,value){assert.equal(!!element.props.disabled,false,'cannot change a disabled UI control');element.props.onChange({target:typeof value==='boolean'?{checked:value}:{value}})}
function click(element){assert.equal(!!element.props.disabled,false,'cannot click a disabled UI control');element.props.onClick()}
async function withCard(versions,action){const previous=globalThis.fetch,calls=[],collection={projectId,revision:2,versions,readiness:[]};globalThis.fetch=async(url,options)=>{if(options?.body)calls.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify(collection),{headers:{'content-type':'application/json'}})};try{const renderer=createRenderer(ruleCard.default,{projectId,session:discovery,collection});renderer.render();await tick();return await action(renderer,calls,collection)}finally{globalThis.fetch=previous}}
function editor(renderer){const saved=nodes(renderer.render()).find(node=>typeof node.type==='function'&&node.props.rule);assert.ok(saved,'saved rule component missing');return createRenderer(saved.type,saved.props)}
function fieldInput(tree,label){return nodes(control(tree,'label',label)).find(node=>node.type==='textarea')}


test.after(()=>rm(output,{recursive:true,force:true}));

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
  const pending=render(fixture({versions:[{...version,confirmation:{status:'pending'}}]}));assert.match(button(pending,'编译此精确规则版本'),/disabled/);
});

test('compilation gaps show semantic details without presenting the rule as executable',()=>{
  const html=render(fixture({gaps:[{ruleRef:ref,missing:[{code:'RULE_CAPABILITY_GAP',detail:'没有可信的退款状态验证资源'}]}]}));assert.match(html,/没有可信的退款状态验证资源/);assert.match(html,/RULE_CAPABILITY_GAP/);assert.match(button(html,'准备本轮检查'),/disabled/);
});

test('compiled rules remain behind candidate generation and dual-review template admission',()=>{
  const choice={enabled:true,confirmed:true,ruleHash:dynamic.hash,environmentHash:'environment-hash'};
  const html=render(fixture({compiled:[dynamic],choice}));assert.match(html,/关闭已解决工单/);assert.match(html,/已编译，尚需生成与审核检查方案/);assert.ok(button(html,'为这条规则创建检查方案'));assert.match(button(html,'准备本轮检查'),/disabled/);
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
  const html=render(value);assert.doesNotMatch(html,/审核这条检查方案<\/button>/);assert.ok(button(html,'为这条规则创建检查方案'));assert.match(html,/<div hidden=""><section class="card candidate-review"/);
});

test('controlled contract is visible and unchecked by default without inferring arbitrary suggestion semantics',()=>{
  const html=renderToStaticMarkup(React.createElement(StaticRuleCard,{projectId,session:discovery,collection:{revision:2,versions:[],readiness:[]}}));
  assert.match(html,new RegExp(optInLabel));assert.doesNotMatch(html,/type="checkbox"[^>]*checked/);
  assert.match(html,/选择和确认本身不会生成方案或执行项目规则/);
  for(const behavior of publicContract.statusTransitionBehavior)assert.ok(html.includes(behavior));
  for(const operation of publicContract.statusTransitionRequirements.operations){assert.ok(html.includes(operation.operationId));assert.ok(html.includes(operation.actorRef));for(const parameter of operation.parameters)assert.ok(html.includes(parameter))}
  for(const observation of publicContract.statusTransitionRequirements.observations)assert.ok(html.includes(`${observation.operationId}.${observation.field} · requiresComplete=${observation.requiresComplete}`));
  assert.match(html,/requiresComplete.*true/);assert.match(html,/eq/);assert.match(html,/synthetic-status-ticket/);
});

test('actual confirm handler sends controlled exact behavior and requirements only after explicit opt-in',async()=>withCard([],async(renderer,calls)=>{
  let tree=renderer.render();assert.equal(checkbox(tree,optInLabel).props.checked,false);
  change(checkbox(tree,optInLabel),true);tree=renderer.render();
  assert.equal(checkbox(tree,'已核对关键问题与业务预期').props.disabled,true,'contract opt-in cannot bypass unanswered business questions');
  assert.equal(control(tree,'textarea','确认后的预期行为（每行一条）').props.disabled,true);
  assert.equal(control(tree,'textarea','确认后的预期行为（每行一条）').props.value,publicContract.statusTransitionBehavior.join('\n'));
  change(control(tree,'textarea',question),'  由用户独立确认  ');tree=renderer.render();
  change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=renderer.render();
  click(control(tree,'button','确认并保存项目规则'));await tick();
  assert.deepEqual(calls,[{url:`/api/projects/${projectId}/rules/confirm`,body:{discoveryId:discovery.id,suggestionId:'arbitrary-refund',expectedRevision:2,answers:{[question]:'由用户独立确认'},expectedBehavior:publicContract.statusTransitionBehavior,requirements:publicContract.statusTransitionRequirements,confirmed:true}}]);
}));

test('unchecked actual confirm stays free-text without requirements and changing opt-in clears confirmation',async()=>withCard([],async(renderer,calls)=>{
  let tree=renderer.render();change(control(tree,'textarea',question),'用户确认');tree=renderer.render();change(control(tree,'textarea','确认后的预期行为（每行一条）'),'  退款由财务复核  \n');tree=renderer.render();change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=renderer.render();
  change(checkbox(tree,optInLabel),true);tree=renderer.render();assert.equal(checkbox(tree,'已核对关键问题与业务预期').props.checked,false);
  change(checkbox(tree,optInLabel),false);tree=renderer.render();assert.equal(control(tree,'textarea','确认后的预期行为（每行一条）').props.value,'  退款由财务复核  \n');change(checkbox(tree,'已核对关键问题与业务预期'),true);tree=renderer.render();click(control(tree,'button','确认并保存项目规则'));await tick();
  assert.deepEqual(calls[0].body.expectedBehavior,['退款由财务复核']);assert.equal(Object.hasOwn(calls[0].body,'requirements'),false);
}));

test('actual free revision preserves existing controlled bindings without implicitly adopting contract semantics',async()=>withCard([{...version,requirements:publicContract.statusTransitionRequirements}],async(renderer,calls)=>{
  const saved=editor(renderer);let tree=saved.render();click(control(tree,'button','修订业务预期'));tree=saved.render();assert.equal(checkbox(tree,optInLabel).props.checked,false);
  change(fieldInput(tree,'修订后的预期行为（每行一条）'),'更严格的自由业务预期');tree=saved.render();change(fieldInput(tree,'纠正说明'),'明确保留当前能力绑定');tree=saved.render();click(control(tree,'button','保存修订（清除确认）'));await tick();
  assert.deepEqual(calls[0],{url:`/api/projects/${projectId}/rules/${ruleId}/revise`,body:{expectedRevision:2,expectedBehavior:['更严格的自由业务预期'],answers:{},note:'明确保留当前能力绑定',requirements:publicContract.statusTransitionRequirements}});
}));

test('revision opt-in is unsaved semantic state and converts a free version through actual revision API before confirmation',async()=>withCard([{...version,confirmation:{status:'pending'}}],async(renderer,calls)=>{
  const saved=editor(renderer);let tree=saved.render();click(control(tree,'button','修订业务预期'));tree=saved.render();change(checkbox(tree,optInLabel),true);tree=saved.render();
  assert.equal(fieldInput(tree,'修订后的预期行为（每行一条）').props.disabled,true);
  click(control(tree,'button','收起修订（保留输入）'));tree=saved.render();assert.equal(control(tree,'button','确认当前版本').props.disabled,true,'unsaved contract choice must block current-version confirmation');
  click(control(tree,'button','修订业务预期'));tree=saved.render();change(fieldInput(tree,'纠正说明'),'明确采用受控关闭契约');tree=saved.render();click(control(tree,'button','保存修订（清除确认）'));await tick();
  assert.deepEqual(calls[0],{url:`/api/projects/${projectId}/rules/${ruleId}/revise`,body:{expectedRevision:2,expectedBehavior:publicContract.statusTransitionBehavior,answers:{},note:'明确采用受控关闭契约',requirements:publicContract.statusTransitionRequirements}});assert.equal(calls.length,1,'revision must not automatically confirm or select');
}));


test('discarding unsaved contract selection restores free current-version confirmation without issuing an API request',async()=>withCard([{...version,confirmation:{status:'pending'}}],async(renderer,calls)=>{
  const saved=editor(renderer);let tree=saved.render();click(control(tree,'button','修订业务预期'));tree=saved.render();change(checkbox(tree,optInLabel),true);tree=saved.render();click(control(tree,'button','放弃未保存修订'));tree=saved.render();
  assert.equal(nodes(tree).some(node=>node.type==='button'&&textOf(node)==='放弃未保存修订'),false);assert.equal(calls.length,0);
  change(checkbox(tree,'已核对修订后的业务预期'),true);tree=saved.render();assert.equal(control(tree,'button','确认当前版本').props.disabled,false);
  click(control(tree,'button','修订业务预期'));tree=saved.render();assert.equal(checkbox(tree,optInLabel).props.checked,false);assert.equal(fieldInput(tree,'修订后的预期行为（每行一条）').props.value,version.expectedBehavior.join('\n'));
}));

test('an unchecked free revision does not add controlled requirements to an unbound version',async()=>withCard([version],async(renderer,calls)=>{
  const saved=editor(renderer);let tree=saved.render();click(control(tree,'button','修订业务预期'));tree=saved.render();change(fieldInput(tree,'纠正说明'),'只补充业务回答');tree=saved.render();click(control(tree,'button','保存修订（清除确认）'));await tick();
  assert.deepEqual(calls[0].body.expectedBehavior,version.expectedBehavior);assert.equal(Object.hasOwn(calls[0].body,'requirements'),false);assert.equal(calls.length,1);
}));

test('stale-source history blocks selection and confirmation while real correction handler appends exact reference',async()=>{
  await withCard([{...version,sourceCurrent:false}],async(renderer,calls)=>{
    const saved=editor(renderer);let tree=saved.render();
    assert.equal(control(tree,'button','选择此版本（仅保存草稿）').props.disabled,true);
    assert.ok(textOf(tree).includes('来源已变化，当时已由你确认'));
    change(fieldInput(tree,'处理/纠正记录（追加，不改历史）'),'保留旧预期，需要重新分析并核对。');tree=saved.render();click(control(tree,'button','追加纠正记录（清除确认）'));await tick();await tick();
    const sent=calls.find(c=>c.url.endsWith('/corrections'));assert.ok(sent,'real correction request missing');assert.deepEqual(sent.body,{ruleRef:ref,note:'保留旧预期，需要重新分析并核对。',expectedRevision:2});assert.equal(sent.url,`/api/projects/${projectId}/rules/${ruleId}/corrections`);
  });
});
test('source-invalidated versions cannot be displayed as executable or offered for compilation',()=>{const value=fixture({compiled:[dynamic],versions:[{...version,sourceCurrent:false}]});assert.deepEqual(view.verificationRules(value.state,value.project),[legacy]);const html=render(value);assert.match(button(html,'编译此精确规则版本'),/disabled/);assert.match(html,/来源已变化，请重新分析/);});
