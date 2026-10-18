import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve,join,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
export const catalog=JSON.parse(await readFile(join(root,'samples/cases.json'),'utf8'));
function replaceOnce(source,needle,replacement){
 if(source.split(needle).length!==2)throw new Error('SAMPLE_SOURCE_CHANGED: '+needle);
 return source.replace(needle,replacement);
}
function variantSource(source,sample,variant){
 const registration=sample==='registration',status=sample==='status-ticket';
 const table=registration?'enrollments':'tickets';
 const edit=registration?"db.prepare('UPDATE enrollments SET displayName=? WHERE id=?').run(req.body.displayName,id);":status?"db.prepare('UPDATE tickets SET status=? WHERE id=?').run(req.body.status,String(req.params.id));":"db.prepare('UPDATE tickets SET title=? WHERE id=?').run(req.body.title,String(req.params.id));";
 if(variant==='normal')return source;
 if(variant==='save-drop'){
  const value=registration?"req.body.displayName,'advanced'":"String(req.body.title??'无标题'),'high'";
  return replaceOnce(source,value,registration?"'错误保存','advanced'":"'错误保存','high'");
 }
 if(variant==='duplicate'){
  const row=source.match(/let row=db\.prepare\('SELECT \* FROM (?:tickets|enrollments) WHERE [^;]+;/)?.[0];
  if(!row)throw new Error('SAMPLE_SOURCE_CHANGED: duplicate lookup');
  return replaceOnce(source,row,'let row: any;');
 }
 if(variant==='permission-leak')return replaceOnce(source,`SELECT * FROM ${table} WHERE ${registration?'creatorId':'ownerId'}=? AND attemptId=? ORDER BY id`,`SELECT * FROM ${table} WHERE (${registration?'creatorId':'ownerId'}=? OR 1=1) AND attemptId=? ORDER BY id`);
 if(variant==='incomplete-query')return replaceOnce(source,registration?'exhaustive:true':'complete:true',registration?'exhaustive:false':'complete:false');
 if(variant==='field-change'||variant==='owner-change'){
  const assignment=variant==='owner-change'?"ownerId='other'":registration?"track='standard'":"priority='low'";
  return replaceOnce(source,edit,edit+`db.prepare("UPDATE ${table} SET ${assignment} WHERE id=?").run(${registration?'id':'String(req.params.id)'});`);
 }
 if(variant==='reopen-defect')return replaceOnce(source,"if(row.status==='closed'&&req.body.status==='open')","if(false)");
 if(variant==='title-change')return replaceOnce(source,edit,edit+"db.prepare(\"UPDATE tickets SET title='意外改写' WHERE id=?\").run(String(req.params.id));");
 if(variant==='temporary-mutation'){
  source=replaceOnce(source,edit,edit+"if(req.body.status==='closed')db.prepare(\"UPDATE tickets SET title=title || ' [临时改写]' WHERE id=?\").run(String(req.params.id));");
  return replaceOnce(source,"res.status(409).json({...row,error:'closed ticket cannot reopen'});","db.prepare(\"UPDATE tickets SET title=replace(title,' [临时改写]','') WHERE id=?\").run(String(req.params.id));res.status(409).json({...row,error:'closed ticket cannot reopen'});");
 }
 throw new Error('UNKNOWN_SAMPLE_VARIANT: '+variant);
}

/** Expected labels stay outside the project directory imported by CangJie. */
export async function materializeCase(id,destination){
 const entry=catalog.cases.find(c=>c.id===id);
 if(!entry)throw new Error('UNKNOWN_SAMPLE_CASE: '+id);
 const source=join(root,'samples',entry.sample),target=resolve(destination);
 for(const protectedPath of ['samples','apps','tests','packages','scripts','docs'].map(p=>join(root,p))){
  const rel=relative(protectedPath,target);
  if(!rel||(!rel.startsWith('..'+sep)&&rel!=='..'))throw new Error('OUTPUT_INSIDE_PROTECTED_SOURCE');
 }
 const server=variantSource(await readFile(join(source,'src/server.ts'),'utf8'),entry.sample,entry.variant);
 await mkdir(target,{recursive:false});
 const project=join(target,'project');await mkdir(project);
 for(const name of ['src','package.json','tsconfig.json','verification.json','README.md'])await cp(join(source,name),join(project,name),{recursive:true,errorOnExist:true,force:false});
 await writeFile(join(project,'src/server.ts'),server);
 if(entry.variant==='duplicate'){
  const seedPath=join(project,'src/seed.ts'),seed=await readFile(seedPath,'utf8');
  await writeFile(seedPath,replaceOnce(seed,entry.sample==='registration'?',UNIQUE(creatorId,intentId,attemptId)':',UNIQUE(ownerId,intentId,attemptId)',''));
 }
 await writeFile(join(target,'case.json'),JSON.stringify({...entry,project:'./project',scope:'预期标签仅供人工核对，不能作为平台运行结果或独立验收答案。'},null,2)+'\n');
 await writeFile(join(target,'README.md'),`# ${entry.title}\n\n${entry.description}\n\n在 CangJie 中仅导入此目录下的 project 子目录。预期：${entry.expected}。\n\n同级 case.json 是人工核对材料，不是实际运行证据。缺陷只存在于本次练习副本；不要用于真实数据。\n`);
 return {project,caseId:id};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2);
 if(!args.length||args.length===1&&args[0]==='--list'){
  console.log(catalog.cases.map(c=>`${c.id}\t${c.title}\t${c.kind}`).join('\n'));
 }else{
  const options={};
  for(let i=0;i<args.length;i+=2){if(!['--case','--out'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||options[args[i]])throw new Error('Usage: --list | --case <id> [--out <new-directory>]');options[args[i]]=args[i+1];}
  if(!options['--case'])throw new Error('CASE_REQUIRED');
  await mkdir(join(root,'practice-projects'),{recursive:true});
  const destination=options['--out']??join(root,'practice-projects',`${options['--case']}-${randomUUID().slice(0,8)}`);
  console.log(JSON.stringify(await materializeCase(options['--case'],destination),null,2));
 }
}
