export async function readJson(response:Response):Promise<unknown>{
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('NON_JSON_RESPONSE');
  if(!response.body)throw new Error('EMPTY_RESPONSE');
  const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576)throw new Error('RESPONSE_TOO_LARGE');chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}finally{await reader.cancel().catch(()=>{});}
}
