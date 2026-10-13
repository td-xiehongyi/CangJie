import {readFileSync} from 'node:fs';
import {randomBytes,scryptSync} from 'node:crypto';
import {openTestDatabase,publicBaseline} from './db.ts';

const input=JSON.parse(readFileSync(0,'utf8'));
if(input.databasePath!==process.env.TEST_DATABASE||input.instanceId!==process.env.TEST_INSTANCE||input.seedVersion!=='registration-seed-v1'||!Number.isSafeInteger(input.count)||input.count<0||input.count>1000||!Array.isArray(input.accounts)||input.accounts.length!==2)throw new Error('Unconfirmed test data target');
const db=openTestDatabase();
db.exec('BEGIN IMMEDIATE; DROP TABLE IF EXISTS enrollments; DROP TABLE IF EXISTS participants; DROP TABLE IF EXISTS metadata; CREATE TABLE participants(id TEXT PRIMARY KEY,account TEXT UNIQUE,passwordHash TEXT,salt TEXT,role TEXT); CREATE TABLE enrollments(id TEXT PRIMARY KEY,creatorId TEXT,ownerId TEXT,displayName TEXT,track TEXT,intentId TEXT,attemptId TEXT,UNIQUE(creatorId,intentId,attemptId)); CREATE TABLE metadata(seedVersion TEXT,instanceId TEXT);');
try {
  for(const user of input.accounts){if(typeof user.password!=='string'||!user.password||user.role!=='user')throw new Error('Test credentials required');const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO participants VALUES(?,?,?,?,?)').run(user.userId,user.username,scryptSync(user.password,salt,32).toString('hex'),salt,user.role);}
  for(let i=0;i<input.count;i++)db.prepare('INSERT INTO enrollments VALUES(?,?,?,?,?,?,?)').run(`baseline-${i}`,input.accounts[0].userId,input.accounts[0].userId,`合成报名 ${i}`,'advanced',`baseline-${i}`,'baseline');
  db.prepare('INSERT INTO metadata VALUES(?,?)').run(input.seedVersion,input.instanceId);db.exec('COMMIT');
  console.log(JSON.stringify({...publicBaseline(db),instanceId:input.instanceId,seedVersion:input.seedVersion}));
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
