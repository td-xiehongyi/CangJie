import {samplePage,sampleStyles} from './ui.ts';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {openTestDatabase,publicBaseline} from './db.ts';

const db=openTestDatabase();
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'64kb'}));
const tokens=new Map<string,string>();
// Public presentation only; all business routes retain their authentication checks.
app.use((_req,res,next)=>{res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');next();});
app.get('/',(_req,res)=>res.type('html').send(samplePage));
app.get('/ui/style.css',(_req,res)=>res.type('css').send(sampleStyles));
app.get('/ui/app.js',(_req,res)=>res.sendFile(fileURLToPath(new URL('./public/app.js',import.meta.url))));
app.get('/health',(_req,res)=>{const meta=db.prepare('SELECT * FROM metadata').get();res.json({...meta,...publicBaseline(db)});});
app.post('/login',(req,res)=>{const user=db.prepare('SELECT * FROM users WHERE username=?').get(String(req.body.username??''));if(!user||typeof req.body.password!=='string'){res.status(401).json({error:'invalid login'});return;}const actual=scryptSync(req.body.password,String(user.salt),32);const expected=Buffer.from(String(user.passwordHash),'hex');if(!timingSafeEqual(actual,expected)){res.status(401).json({error:'invalid login'});return;}const token=randomUUID();tokens.set(token,String(user.id));res.json({token});});
app.use((req,res,next)=>{const userId=tokens.get(req.headers.authorization?.replace(/^Bearer /,'')??'');if(!userId){res.status(401).json({error:'authentication required'});return;}res.locals.userId=userId;next();});
app.post('/logout',(req,res)=>{tokens.delete(req.headers.authorization?.replace(/^Bearer /,'')??'');res.json({loggedOut:true});});
app.get('/me',(_req,res)=>{res.json({id:res.locals.userId});});
app.post('/tickets',async(req,res)=>{const ownerId=String(res.locals.userId),intentId=String(req.body.intentId??req.header('x-verification-intent')??''),attemptId=req.header('x-verification-attempt');if(!intentId||!attemptId){res.status(400).json({error:'business correlation required'});return;}let row=db.prepare('SELECT * FROM tickets WHERE ownerId=? AND intentId=? AND attemptId=?').get(ownerId,intentId,attemptId);if(!row){db.prepare('INSERT INTO tickets VALUES(?,?,?,?,?,?)').run(randomUUID(),ownerId,String(req.body.title??'无标题'),'high',intentId,attemptId);row=db.prepare('SELECT * FROM tickets WHERE ownerId=? AND intentId=? AND attemptId=?').get(ownerId,intentId,attemptId);}const delay=Math.max(0,Math.min(2000,Number(req.body.delayMs)||0));if(delay)await new Promise(r=>setTimeout(r,delay));res.status(201).json(row);});
app.get('/tickets',(req,res)=>{const rows=db.prepare('SELECT * FROM tickets WHERE ownerId=? AND attemptId=? ORDER BY id').all(String(res.locals.userId),String(req.query.attemptId??''));const filtered=rows.filter(row=>(!req.query.id||row.id===req.query.id)&&(!req.query.intentId||row.intentId===req.query.intentId));const limit=Math.max(1,Math.min(1000,Number(req.query.limit)||1000));res.json({items:filtered.slice(0,limit),total:filtered.length,hasMore:filtered.length>limit,complete:true});});
app.patch('/tickets/:id',(req,res)=>{const row=db.prepare('SELECT * FROM tickets WHERE id=? AND ownerId=? AND attemptId=?').get(String(req.params.id),String(res.locals.userId),String(req.header('x-verification-attempt')??''));if(!row){res.status(404).json({error:'not found'});return;}if(typeof req.body.title!=='string'){res.status(400).json({error:'title required'});return;}db.prepare('UPDATE tickets SET title=? WHERE id=?').run(req.body.title,String(req.params.id));res.json(db.prepare('SELECT * FROM tickets WHERE id=?').get(String(req.params.id)));});
app.use((_error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(500).json({error:'request could not complete'}));
const port=Number(process.env.PORT);if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Explicit test port required');
const server=app.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({ready:true,instanceId:process.env.TEST_INSTANCE})));
function stop(){tokens.clear();server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),500).unref();}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
