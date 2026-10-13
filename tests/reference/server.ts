import express from 'express';
import {readFileSync} from 'node:fs';
import {randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {openTestDatabase,publicBaseline} from './db.ts';
import {behavior} from './behaviors.ts';

const control=JSON.parse(readFileSync(new URL('./control.json',import.meta.url),'utf8'));
const mode=behavior(control.behavior);
const db=openTestDatabase(),app=express(),tokens=new Map<string,string>();
type Row={id:string;ownerId:string;title:string;priority:string;intentId:string;attemptId:string};
// Independent in-memory business implementation; SQLite is used only for the
// shared T2 synthetic-account/baseline preparation contract, never as an oracle.
const records:Row[]=[];
app.disable('x-powered-by');app.use(express.json({limit:'64kb'}));
app.get('/health',(_req,res)=>res.json({...db.prepare('SELECT * FROM metadata').get(),...publicBaseline(db)}));
app.post('/login',(req,res)=>{
  const user=db.prepare('SELECT * FROM users WHERE username=?').get(String(req.body.username??''));
  if(!user||typeof req.body.password!=='string'||!timingSafeEqual(scryptSync(req.body.password,String(user.salt),32),Buffer.from(String(user.passwordHash),'hex'))){res.status(401).json({error:'invalid login'});return;}
  const token=randomUUID();tokens.set(token,String(user.id));res.json({token});
});
app.use((req,res,next)=>{const actor=tokens.get(req.headers.authorization?.replace(/^Bearer /,'')??'');if(!actor){res.status(401).json({error:'authentication required'});return;}res.locals.actor=actor;next();});
app.get('/me',(_req,res)=>res.json({id:res.locals.actor}));
app.post('/tickets',(req,res)=>{
  const actor=String(res.locals.actor),attemptId=req.header('x-verification-attempt')??'',intentId=String(req.body.intentId??req.header('x-verification-intent')??'');
  if(!attemptId||!intentId||typeof req.body.title!=='string'){res.status(400).json({error:'required data'});return;}
  let row=mode==='duplicate'?undefined:records.find(r=>r.ownerId===actor&&r.attemptId===attemptId&&r.intentId===intentId);
  if(!row){row={id:randomUUID(),ownerId:actor,title:mode==='save-drop'?'incorrect persisted title':req.body.title,priority:control.initialPriority??'high',intentId,attemptId};records.push(row);}
  res.status(201).json({...row,status:200});
});
app.patch('/tickets/:id',(req,res)=>{
  const row=records.find(r=>r.id===req.params.id&&r.ownerId===res.locals.actor&&r.attemptId===req.header('x-verification-attempt'));
  if(!row){res.status(404).json({error:'not found'});return;}if(typeof req.body.title!=='string'){res.status(400).json({error:'title required'});return;}
  row.title=req.body.title;
  if(mode==='priority-reset')row.priority='low';
  if(mode==='owner-change')row.ownerId=control.otherId??'user-b';
  res.json({...row,status:200});
});
app.get('/tickets',(req,res)=>{
  if(mode==='crash'){process.exit(17);}
  if(mode==='timeout'){return;}
  const items=records.filter(r=>r.attemptId===req.query.attemptId&&(!req.query.id||r.id===req.query.id)&&(!req.query.intentId||r.intentId===req.query.intentId)&&(mode==='permission-leak'||mode==='owner-change'||r.ownerId===res.locals.actor)).map(r=>({...r,status:200}));
  const output=items.map(row=>{const value:Partial<Row>&{status:number}={...row};if(mode==='missing'){delete value.title;delete value.priority;}if(mode==='wrong-object')value.id='unrelated-object';return value;});
  res.json({items:mode==='partial'?[]:output,total:items.length,hasMore:mode==='partial',complete:mode!=='partial',status:200});
});
const port=Number(process.env.PORT);if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Explicit port required');
const server=app.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({ready:true,instanceId:process.env.TEST_INSTANCE})));
function stop(){tokens.clear();server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),500).unref();}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
