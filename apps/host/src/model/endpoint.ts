export const OFFICIAL_SERVICE='https://api.deepseek.com';
export function serviceUrl(value:string):string{
  let url:URL;try{url=new URL(value);}catch{throw new Error('INVALID_SERVICE_URL');}
  if(url.username||url.password||url.search||url.hash||!['','/','/v1','/v1/'].includes(url.pathname)||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname))))throw new Error('INVALID_SERVICE_URL');
  return url.origin+(url.pathname.startsWith('/v1')?'/v1':'');
}
