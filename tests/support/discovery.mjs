import {listenLoopback} from '../../apps/host/dist/execution/ports.js';
import assert from 'node:assert/strict';
import {cp,mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:http';
export async function loadDiscovery(){
  let exists=true;try{await readFile('apps/host/dist/discovery/service.js')}catch(e){if(e.code==='ENOENT')exists=false;else throw e}
  assert.ok(exists,'D2 persistent controlled discovery is not implemented');
  return {...await import('../../apps/host/dist/discovery/service.js'),...await import('../../apps/host/dist/discovery/store.js'),...await import('../../apps/host/dist/discovery/index.js'),...await import('../../apps/host/dist/discovery/access.js'),...await import('../../apps/host/dist/model/credentials.js'),...await import('../../apps/host/dist/model/budget.js')};
}
export const action=actions=>({kind:'actions',actions});
export const read=(path,startLine=1,endLine=2)=>({type:'read',path,startLine,endLine});
export function overview(files,name='取消订单'){
  const refs=files.map(f=>f.sourceRef),source=files.find(f=>f.path.endsWith('orders.ts'))?.sourceRef??refs[0],doc=files.find(f=>f.path==='README.md')?.sourceRef;
  return {kind:'result',result:{summary:name,objects:['订单','库存'],roles:['客户'],flows:[{name,roles:['客户'],steps:['读取订单','取消订单','释放库存'],data:['state','ownerId'],sourceRefs:[source]}],sourceRefs:[source],suggestions:[{id:'cancel-order-once',status:'suggestion',flow:name,facts:[{text:'当前实现按unpaid状态取消，没有在此函数核对所有者。',sourceRefs:[source]}],expectations:[{text:'仅订单所有者可以取消，库存至多释放一次。',source:doc?'documentation':'ai_hypothesis',confirmation:'pending',sourceRefs:doc?[doc]:[source]}],risks:[{text:'应检查其他用户能否取消以及重复请求是否重复释放。',sourceRefs:[source]}],openQuestions:['请确认未付款订单可取消及库存恢复规则。'],sourceRefs:[source],priorityReason:'涉及归属和库存状态',operationNeeds:['取消订单入口'],observationNeeds:['可核对库存及订单归属']}],limitations:['未核对运行环境及其他取消入口'],unresolved:['调用方是否另有权限检查尚不清楚']}};
}
export async function setupDiscovery(t,respond,options={}){
  const a=await loadDiscovery();const output=process.env.CANGJIE_TEST_OUTPUT??'output/s2-discovery';await mkdir(output,{recursive:true});
  const directory=await mkdtemp(join(process.cwd(),output,'session-'));t.after(()=>rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const root=join(directory,'source');await cp('tests/fixtures/discovery-orders',root,{recursive:true});
  const requests=[];
  const server=createServer(async(req,res)=>{try{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw),payload=JSON.parse(body.messages[1].content);requests.push({body,payload,raw});const value=await respond(payload,requests.length,{req,res});if(res.destroyed)return;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{total_tokens:options.actualTokens??20}}));}catch{res.destroy()}});
  await listenLoopback(server);t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}));
  const credentials=new a.ModelCredentials(),serviceUrl=`http://127.0.0.1:${server.address().port}`;
  const credentialRef=await credentials.set(serviceUrl,'synthetic-discovery-model-key',{remember:false});t.after(()=>credentials.close());
  const config={serviceUrl,model:'deterministic-discovery',credentialRef},store=new a.DiscoveryStore(join(directory,'sessions'));
  const service=new a.DiscoveryService({store,config:()=>config,credentials,...options});t.after(()=>service.close());
  const snapshot=await a.buildSourceSnapshot(root,'source-orders');
  const scope={...a.createAnalysisScope(snapshot,{allowedPaths:['src','README.md'],excludedPaths:[],includeProjectTests:false,serviceUrl}),confirmedAt:new Date().toISOString()};
  return {a,directory,root,requests,config,store,service,snapshot,scope,async create(){return service.createDiscovery(snapshot,scope)}};
}
