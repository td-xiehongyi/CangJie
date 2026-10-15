import type {AnalysisScope,SourceSnapshot,SourceExcerpt} from '@website-verification/contracts/discovery';
import {scopedSourceFiles} from './access.js';
import {readIndexedFile,sourceHash,sourceLines,containsSecret} from './index.js';
import {serviceUrl} from '../model/endpoint.js';
export interface FullAnalysisInput {mode:'automatic'|'prompt';prompt:string;manifestHash?:string}
export const fullInputLimits=Object.freeze({fileBytes:65536,totalBytes:65536,promptCharacters:8000,requestBytes:98304});
export async function prepareFullFileInput(snapshot:SourceSnapshot,scope:AnalysisScope,config:{model:string;serviceUrl:string},input:FullAnalysisInput){
 if(!input||!['automatic','prompt'].includes(input.mode)||typeof input.prompt!=='string'||input.prompt.length>fullInputLimits.promptCharacters||input.mode==='prompt'&&!input.prompt.trim())throw new Error('INVALID_ANALYSIS_INPUT');
 if(containsSecret(input.prompt))throw new Error('SENSITIVE_FILE');
 const files=scopedSourceFiles(snapshot,scope);
 if(!files.length)throw new Error('EMPTY_ANALYSIS_INPUT');
 const reads:SourceExcerpt[]=[];let totalBytes=0;
 for(const file of files){
  totalBytes+=file.bytes;
  if(file.bytes>fullInputLimits.fileBytes)throw new Error('FULL_INPUT_TOO_LARGE: '+file.path+' 单文件超过65536字节');
  if(totalBytes>fullInputLimits.totalBytes)throw new Error('FULL_INPUT_TOO_LARGE: 完整正文合计超过65536字节');
  const text=await readIndexedFile(snapshot,file);
  reads.push({kind:'full-file',text,bytes:Buffer.byteLength(text),ref:{snapshotId:snapshot.id,path:file.path,fileHash:file.hash,startLine:1,endLine:sourceLines(text).length,excerptHash:sourceHash(text)}});
 }
 const binding={scopeHash:scope.scopeHash,snapshotId:snapshot.id,sourceHash:snapshot.sourceHash,model:config.model,serviceUrl:serviceUrl(config.serviceUrl),mode:input.mode,prompt:input.prompt,files:reads.map(r=>r.ref)};
 // Conservative visible preview bound. The provider checks the exact encoded envelope again before any network call.
 const estimatedRequestBytes=Buffer.byteLength(JSON.stringify({binding,reads,index:files}))*2+8192;
 if(estimatedRequestBytes>fullInputLimits.requestBytes)throw new Error('FULL_INPUT_TOO_LARGE');
 return {mode:input.mode,prompt:input.prompt,reads,totalBytes,estimatedRequestBytes,manifestHash:sourceHash(JSON.stringify(binding)),limits:fullInputLimits,excluded:snapshot.indexIssues};
}
