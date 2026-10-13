import {readFile} from 'node:fs/promises';
import {ModelCredentials} from '../../apps/host/dist/model/credentials.js';
// Caller supplies only the fresh acceptance directory created by that test.
// Cleanup is independent of the workbench's active candidate-job guard.
export async function cleanupFixtureCredential(configFile){
  let saved;try{saved=JSON.parse(await readFile(configFile,'utf8'));}catch(e){if(e.code==='ENOENT')return false;throw e;}
  const ref=saved.config?.credentialRef;if(!ref?.startsWith('windows:'))return false;
  if(!/^windows:[a-f0-9-]{36}$/.test(ref))throw new Error('INVALID_TEST_CREDENTIAL_REF');
  const keys=new ModelCredentials();
  try{
    await keys.clear(ref);
    try{await keys.get(ref,saved.config.serviceUrl);}catch(e){if(e.message==='MODEL_KEY_REQUIRED')return true;throw e;}
    throw new Error('TEST_CREDENTIAL_CLEANUP_FAILED');
  }finally{keys.close();}
}
