import {startWorkbench} from '../apps/host/dist/api.js';
const app=await startWorkbench({port:Number(process.env.WORKBENCH_PORT??4317)});
console.log(`网站验证工作台：${app.url}`);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void app.close().then(()=>process.exit(0)));
