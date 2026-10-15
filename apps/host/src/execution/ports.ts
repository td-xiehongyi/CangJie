import {createServer,type Server} from 'node:net';
import {randomInt} from 'node:crypto';
/** Use high dynamic ports for HTTP, independently of the OS ephemeral range.
 * Some Windows configurations assign port 0 into Fetch/browser-blocked ports.
 * Explicit ports keep their meaning; retry only automatic bind conflicts. */
export async function listenLoopback<T extends Server>(server:T,port=0):Promise<T>{
  for(let attempt=0;;attempt++){
    try{
      await new Promise<void>((resolve,reject)=>{
        const cleanup=()=>{server.off('error',failed);server.off('listening',ready);};
        const failed=(error:Error)=>{cleanup();reject(error);};
        const ready=()=>{cleanup();resolve();};
        server.once('error',failed);server.once('listening',ready);
        try{server.listen(port===0?randomInt(49152,65536):port,'127.0.0.1');}catch(error){failed(error as Error);}
      });
      return server;
    }catch(error){if(port!==0||attempt===31||!['EADDRINUSE','EACCES'].includes((error as NodeJS.ErrnoException).code??''))throw error;}
  }
}
/** Like the previous port-0 probe, this releases the reservation before spawn. */
export async function availableLoopbackPort():Promise<number>{
  const server=await listenLoopback(createServer()),port=(server.address() as {port:number}).port;
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));return port;
}
