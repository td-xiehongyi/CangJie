import {samplePage,sampleStyles} from './ui.ts';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {openTestDatabase,publicBaseline} from './db.ts';

// Controlled synthetic example: only these request fields are supported.
const createFields=['title','status','intentId'] as const;
const updateFields=['status'] as const;
const queryFields=['id','intentId','attemptId','limit'] as const;
const db=openTestDatabase(),app=express(),tokens=new Map<string,string>();
app.disable('x-powered-by');app.use(express.json({limit:'64kb'}));
// Public presentation only; all business routes retain their authentication checks.
app.use((_req,res,next)=>{res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');next();});
app.get('/',(_req,res)=>res.type('html').send(samplePage));
app.get('/ui/style.css',(_req,res)=>res.type('css').send(sampleStyles));
app.get('/ui/app.js',(_req,res)=>res.sendFile(fileURLToPath(new URL('./public/app.js',import.meta.url))));
app.get('/health',(_req,res)=>res.json({...db.prepare('SELECT * FROM metadata').get(),...publicBaseline(db)}));
app.post('/login',(req,res)=>{
  const user=db.prepare('SELECT * FROM users WHERE username=?').get(String(req.body.username??''));
  if(!user||typeof req.body.password!=='string'||!timingSafeEqual(scryptSync(req.body.password,String(user.salt),32),Buffer.from(String(user.passwordHash),'hex'))){res.status(401).json({error:'invalid login'});return;}
  const token=randomUUID();tokens.set(token,String(user.id));res.json({token});
});
app.use((req,res,next)=>{const owner=tokens.get(req.headers.authorization?.replace(/^Bearer /,'')??'');if(!owner){res.status(401).json({error:'authentication required'});return;}res.locals.owner=owner;next();});
app.post('/logout',(req,res)=>{tokens.delete(req.headers.authorization?.replace(/^Bearer /,'')??'');res.json({loggedOut:true});});
app.get('/me',(_req,res)=>res.json({id:res.locals.owner}));
app.post('/tickets',(req,res)=>{
  const ownerId=String(res.locals.owner),attemptId=req.header('x-verification-attempt')??'',intentId=String(req.body.intentId??req.header('x-verification-intent')??'');
  if(!attemptId||!intentId||typeof req.body.title!=='string'||req.body.status!=='open'||Object.keys(req.body).some(k=>!createFields.includes(k as typeof createFields[number]))){res.status(400).json({error:'title and open status with business correlation required'});return;}
  let row=db.prepare('SELECT * FROM tickets WHERE ownerId=? AND intentId=? AND attemptId=?').get(ownerId,intentId,attemptId);
  if(!row){db.prepare('INSERT INTO tickets VALUES(?,?,?,?,?,?)').run(randomUUID(),ownerId,req.body.title,'open',intentId,attemptId);row=db.prepare('SELECT * FROM tickets WHERE ownerId=? AND intentId=? AND attemptId=?').get(ownerId,intentId,attemptId);}
  res.status(201).json(row);
});
app.get('/tickets',(req,res)=>{
  if(Object.keys(req.query).some(k=>!queryFields.includes(k as typeof queryFields[number]))){res.status(400).json({error:'unsupported query field'});return;}
  const rows=db.prepare('SELECT * FROM tickets WHERE ownerId=? AND attemptId=? ORDER BY id').all(String(res.locals.owner),String(req.query.attemptId??''));
  const selected=rows.filter(row=>(!req.query.id||row.id===req.query.id)&&(!req.query.intentId||row.intentId===req.query.intentId));const limit=Math.max(1,Math.min(1000,Number(req.query.limit)||1000));
  res.json({items:selected.slice(0,limit),total:selected.length,hasMore:selected.length>limit,complete:true});
});
app.patch('/tickets/:id',(req,res)=>{
  const row=db.prepare('SELECT * FROM tickets WHERE id=? AND ownerId=? AND attemptId=?').get(String(req.params.id),String(res.locals.owner),String(req.header('x-verification-attempt')??''));
  if(!row){res.status(404).json({error:'not found'});return;}
  if(!['open','closed'].includes(req.body.status)||Object.keys(req.body).some(k=>!updateFields.includes(k as typeof updateFields[number]))){res.status(400).json({error:'only open or closed status is supported'});return;}
  // Closure is irreversible; rejected updates do not change title, status or owner.
  if(row.status==='closed'&&req.body.status==='open'){res.status(409).json({...row,error:'closed ticket cannot reopen'});return;}
  db.prepare('UPDATE tickets SET status=? WHERE id=?').run(req.body.status,String(req.params.id));res.json(db.prepare('SELECT * FROM tickets WHERE id=?').get(String(req.params.id)));
});
app.use((_error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(500).json({error:'request could not complete'}));
const port=Number(process.env.PORT);if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Explicit test port required');
const server=app.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({ready:true,instanceId:process.env.TEST_INSTANCE})));
function stop(){tokens.clear();server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),500).unref();}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
