import express from 'express';
import {randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {openTestDatabase,publicBaseline} from './db.ts';

const db=openTestDatabase(),app=express(),tokens=new Map<string,string>();
app.disable('x-powered-by');app.use(express.json({limit:'64kb'}));
app.get('/health',(_req,res)=>res.json({...db.prepare('SELECT * FROM metadata').get(),...publicBaseline(db)}));
app.post('/sessions',(req,res)=>{
  const user=db.prepare('SELECT * FROM participants WHERE account=?').get(String(req.body.account??''));
  if(!user||typeof req.body.passphrase!=='string'||!timingSafeEqual(scryptSync(req.body.passphrase,String(user.salt),32),Buffer.from(String(user.passwordHash),'hex'))){res.status(401).json({error:'invalid login'});return;}
  const token=randomUUID();tokens.set(token,String(user.id));res.json({session:{access:token}});
});
app.use((req,res,next)=>{const id=tokens.get(req.headers.authorization?.replace(/^Bearer /,'')??'');if(!id){res.status(401).json({error:'authentication required'});return;}res.locals.participant=id;next();});
app.get('/participant',(_req,res)=>res.json({participant:{key:res.locals.participant}}));
app.post('/enrollments',(req,res)=>{
  const creator=String(res.locals.participant),intent=String(req.body.submissionKey??req.header('x-verification-intent')??''),attempt=req.header('x-verification-attempt');
  if(!intent||!attempt||typeof req.body.displayName!=='string'){res.status(400).json({error:'name and correlation required'});return;}
  let row=db.prepare('SELECT * FROM enrollments WHERE creatorId=? AND intentId=? AND attemptId=?').get(creator,intent,attempt);
  if(!row){db.prepare('INSERT INTO enrollments VALUES(?,?,?,?,?,?,?)').run(randomUUID(),creator,creator,req.body.displayName,'advanced',intent,attempt);row=db.prepare('SELECT * FROM enrollments WHERE creatorId=? AND intentId=? AND attemptId=?').get(creator,intent,attempt);}
  res.status(201).json(row);
});
app.get('/enrollments',(req,res)=>{
  // The authenticated submitter retains access to their receipt; ownerId is the
  // business participant assignment whose preservation is checked separately.
  const rows=db.prepare('SELECT * FROM enrollments WHERE creatorId=? AND attemptId=? ORDER BY id').all(String(res.locals.participant),String(req.query.attemptId??''));
  const filtered=rows.filter(r=>(!req.query.recordKey||r.id===req.query.recordKey)&&(!req.query.submissionKey||r.intentId===req.query.submissionKey));
  const size=Math.max(1,Math.min(1000,Number(req.query.pageSize)||1000));
  res.json({entries:filtered.slice(0,size),page:{count:filtered.length,more:filtered.length>size,exhaustive:true}});
});
app.put('/enrollments/:id/profile',(req,res)=>{
  const id=String(req.params.id),row=db.prepare('SELECT * FROM enrollments WHERE id=? AND creatorId=? AND attemptId=?').get(id,String(res.locals.participant),String(req.header('x-verification-attempt')??''));
  if(!row){res.status(404).json({error:'not found'});return;}
  if(typeof req.body.displayName!=='string'){res.status(400).json({error:'displayName required'});return;}
  db.prepare('UPDATE enrollments SET displayName=? WHERE id=?').run(req.body.displayName,id);
  res.json(db.prepare('SELECT * FROM enrollments WHERE id=?').get(id));
});
app.use((_error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(500).json({error:'request could not complete'}));
const port=Number(process.env.PORT);if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Explicit test port required');
const server=app.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({ready:true,instanceId:process.env.TEST_INSTANCE})));
function stop(){tokens.clear();server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),500).unref();}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
