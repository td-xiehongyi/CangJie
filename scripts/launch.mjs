import {spawn as nativeSpawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
async function exists(path){try{await access(path);return true;}catch{return false;}}
function run(args,options){return new Promise((resolve,reject)=>{const child=nativeSpawn(process.execPath,args,{...options,stdio:'inherit',shell:false,windowsHide:false});child.once('error',reject);child.once('close',(code,signal)=>code===0?resolve():reject(new Error(`STARTUP_STEP_FAILED (${signal??code}): ${args[0]}`)));});}
export async function launch(options={}){
 const root=options.root??projectRoot,has=options.exists??exists,execute=options.run??run,log=options.log??console.log;
 if(Number((options.nodeVersion??process.versions.node).split('.')[0])!==24)throw new Error('NODE_24_REQUIRED: 请先安装 Node.js 24.x，再双击 Start-JianShi.cmd。');
 for(const path of ['node_modules/typescript/bin/tsc','node_modules/vite/bin/vite.js','node_modules/express/package.json','node_modules/react/package.json'])if(!await has(join(root,path)))throw new Error('DEPENDENCIES_MISSING: 在项目目录运行 npm ci --ignore-scripts；安装成功后再次双击 Start-JianShi.cmd。首次准备需要网络。');
 const hasCore=await has(join(root,'apps/core/target/verification-core.exe')),hasSdk=await has(join(options.sdk??process.env.CANGJIE_SDK??join(root,'.local-tools/cangjie'),'bin/cjc.exe'));
 if(hasCore&&!hasSdk)throw new Error('CORE_REBUILD_REQUIRED: 已有仓颉核心无法核验是否与源码一致。请配置 CANGJIE_SDK/CANGJIE_STDX 后重新启动并构建核心。');
 log('正在准备 鉴实；不会自动安装软件、调用模型或读取 API Key。');
 // Rebuild on every launch, avoiding stale dist after pulling source changes.
 for(const config of ['packages/contracts/tsconfig.json','apps/host/tsconfig.json','samples/ticket/tsconfig.json','samples/registration/tsconfig.json','samples/status-ticket/tsconfig.json','apps/ui/tsconfig.json'])await execute(['node_modules/typescript/bin/tsc','-p',config],{cwd:root});
 await execute(['node_modules/vite/bin/vite.js','build','apps/ui'],{cwd:root});
 if(hasSdk)await execute(['scripts/build-core.mjs'],{cwd:root});
 if(!hasCore&&!hasSdk)log('提示：未找到原生仓颉核心。可打开界面与配置 API；正式验证/候选准入/复跑前须构建核心并验收。');
 await execute(['scripts/workbench.mjs','--open'],{cwd:root});
}
export async function openBrowser(value,options={}){
 const url=new URL(value);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!url.port)throw new Error('INVALID_LOCAL_URL');
 if((options.platform??process.platform)!=='win32')throw new Error('BROWSER_OPEN_UNSUPPORTED');
 await new Promise((resolve,reject)=>{const child=(options.spawn??nativeSpawn)('rundll32.exe',['url.dll,FileProtocolHandler',url.href],{detached:true,stdio:'ignore',shell:false,windowsHide:true});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await launch();}catch(error){console.error(error.code==='EADDRINUSE'?'端口被占用，请关闭已有实例或修改 WORKBENCH_PORT。':error.message);process.exitCode=1;}
}
