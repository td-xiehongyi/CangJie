import {startWorkbench} from '../apps/host/dist/api.js';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
let main;
try{main=JSON.parse(await readFile(new URL('../main-version.json',import.meta.url),'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;}
if(main&&(main.schemaVersion!==1||typeof main.id!=='string'||typeof main.runtime?.directory!=='string'||typeof main.runtime?.registryDirectory!=='string'||!Number.isInteger(main.runtime?.port)))throw new Error('INVALID_MAIN_VERSION');
let app;try{app=await startWorkbench({...(main?{directory:resolve(root,main.runtime.directory),registryDirectory:resolve(root,main.runtime.registryDirectory)}:{}),port:Number(process.env.WORKBENCH_PORT??main?.runtime.port??4317)});}catch(error){console.error(error.code==='EADDRINUSE'?'端口被占用：请关闭已有工作台，或设置 WORKBENCH_PORT 后重试。':error.message);process.exit(1);}
console.log(`网站验证工作台${main?`（主版本 ${main.id}）`:''}：${app.url}`);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void app.close().then(()=>process.exit(0)));

if(process.argv.includes('--open')){try{const {openBrowser}=await import('./launch.mjs');await openBrowser(app.url);}catch{console.log('浏览器未能自动打开，请手动访问上方本机地址；工作台仍在运行。');}}
