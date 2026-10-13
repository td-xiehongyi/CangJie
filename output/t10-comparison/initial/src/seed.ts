import {readFileSync} from 'node:fs';
import {randomBytes,scryptSync} from 'node:crypto';
import {openTestDatabase,publicBaseline} from './db.ts';

// Existing, project-owned initialization. The verifier never generates this for an imported project.
const input=JSON.parse(readFileSync(0,'utf8'));
if(input.databasePath!==process.env.TEST_DATABASE||input.instanceId!==process.env.TEST_INSTANCE||input.seedVersion!=='ticket-seed-v1'||!Number.isSafeInteger(input.count)||input.count<0||input.count>1000||!Array.isArray(input.accounts)||input.accounts.length!==2)throw new Error('Unconfirmed test data target');
const db=openTestDatabase();
db.exec('BEGIN IMMEDIATE; DROP TABLE IF EXISTS tickets; DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS metadata; CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT UNIQUE,passwordHash TEXT,salt TEXT,role TEXT); CREATE TABLE tickets(id TEXT PRIMARY KEY,ownerId TEXT,title TEXT,priority TEXT,intentId TEXT,attemptId TEXT,UNIQUE(ownerId,intentId,attemptId)); CREATE TABLE metadata(seedVersion TEXT,instanceId TEXT);');
try {
  for(const user of input.accounts){if(typeof user.password!=='string'||!user.password||user.role!=='user')throw new Error('Test credentials required');const salt=randomBytes(16).toString('hex');const hash=scryptSync(user.password,salt,32).toString('hex');db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user.userId,user.username,hash,salt,user.role);}
  for(let i=0;i<input.count;i++)db.prepare('INSERT INTO tickets VALUES(?,?,?,?,?,?)').run(`baseline-${i}`,input.accounts[0].userId,`合成基线 ${i}`,'high',`baseline-${i}`,'baseline');
  db.prepare('INSERT INTO metadata VALUES(?,?)').run(input.seedVersion,input.instanceId);db.exec('COMMIT');
  console.log(JSON.stringify({...publicBaseline(db),instanceId:input.instanceId,seedVersion:input.seedVersion}));
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
