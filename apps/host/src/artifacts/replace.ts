import {rename} from 'node:fs/promises';

/** Keep the previous file intact while Windows briefly denies replacement.
 * Only file-lock errors retry; business actions are never retried here. */
export async function replaceFile(source:string,destination:string):Promise<void>{
  for(let attempt=0;;attempt++)try{await rename(source,destination);return;}catch(error){
    if(attempt===7||!['EPERM','EACCES','EBUSY'].includes((error as NodeJS.ErrnoException).code??''))throw error;
    await new Promise(r=>setTimeout(r,25*(attempt+1)));
  }
}
