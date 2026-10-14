import express from 'express';
import {readFileSync} from 'node:fs';
import {randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {openTestDatabase,publicBaseline} from './db.ts';
import {behavior} from './behaviors.ts';

const control=JSON.parse(readFileSync(new URL('./control.json',import.meta.url),'utf8')),mode=behavior(control.behavior);
const db=openTestDatabase(),app=express(),tokens=new Map<string,string>();
type Row={id:string;ownerId:string;title:string;status:'open'|'closed';intentId:string;attemptId:string};
// Business transitions are independently implemented in memory, never by importing
// the target implementation. SQLite is used only for the established synthetic baseline.
const records=new Map<string,{accessActor:string;original:{title:string;ownerId:string};row:Row}>();
const publicRow=(row:Row)=>({...row});
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
  if(!attemptId||!intentId||typeof req.body.title!=='string'||req.body.status!=='open'||Object.keys(req.body).some(k=>!['title','status','intentId'].includes(k))){res.status(400).json({error:'required data'});return;}
  let existing=[...records.values()].find(x=>x.accessActor===actor&&x.row.attemptId===attemptId&&x.row.intentId===intentId);
  if(!existing){const row:Row={id:randomUUID(),title:req.body.title,status:'open',ownerId:actor,attemptId,intentId};existing={accessActor:actor,original:{title:row.title,ownerId:row.ownerId},row};records.set(row.id,existing);}
  res.status(201).json(publicRow(existing.row));
});
app.patch('/tickets/:id',(req,res)=>{
  const record=records.get(String(req.params.id));
  if(!record||record.accessActor!==res.locals.actor||record.row.attemptId!==req.header('x-verification-attempt')){res.status(404).json({error:'not found'});return;}
  if(!['open','closed'].includes(req.body.status)||Object.keys(req.body).some(k=>k!=='status')){res.status(400).json({error:'status required'});return;}
  const row=record.row;
  if(row.status==='closed'&&req.body.status==='open'&&mode!=='reopen-defect'){
    if(mode==='temporary-mutation'){row.title=record.original.title;row.ownerId=record.original.ownerId;}
    res.status(409).json({...publicRow(row),error:'closed ticket cannot reopen'});return;
  }
  row.status=req.body.status;
  if(mode==='owner-defect'&&row.status==='closed')row.ownerId=control.otherId??'user-b';
  if(mode==='temporary-mutation'&&row.status==='closed'){row.title=record.original.title+' [temporary close mutation]';row.ownerId=control.otherId??'user-b';}
  res.json(publicRow(row));
});
app.get('/tickets',(req,res)=>{
  if(Object.keys(req.query).some(k=>!['id','intentId','attemptId','limit'].includes(k))){res.status(400).json({error:'unsupported query field'});return;}
  const selected=[...records.values()].filter(x=>x.accessActor===res.locals.actor&&x.row.attemptId===req.query.attemptId&&(!req.query.id||x.row.id===req.query.id)&&(!req.query.intentId||x.row.intentId===req.query.intentId));
  const limit=Math.max(1,Math.min(1000,Number(req.query.limit)||1000)),items=selected.slice(0,limit).map(x=>publicRow(x.row));
  // Keep real rows visible while explicitly marking insufficient enumeration evidence.
  res.json({items,total:selected.length,hasMore:mode==='incomplete-query'||selected.length>limit,complete:mode!=='incomplete-query'});
});
app.use((_error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(500).json({error:'request could not complete'}));
const port=Number(process.env.PORT);if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Explicit test port required');
const server=app.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({ready:true,instanceId:process.env.TEST_INSTANCE})));
function stop(){tokens.clear();server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),500).unref();}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
