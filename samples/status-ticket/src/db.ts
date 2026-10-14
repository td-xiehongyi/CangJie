import {DatabaseSync} from 'node:sqlite';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';

export function openTestDatabase():DatabaseSync {
  const root=process.env.TEST_DATA_ROOT,path=process.env.TEST_DATABASE;
  if(!root||!path||!process.env.TEST_INSTANCE)throw new Error('Explicit test target required');
  const rel=relative(resolve(root),resolve(path));
  if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('Test database outside target');
  return new DatabaseSync(path);
}
export function publicBaseline(db:DatabaseSync):{users:number;tickets:number;hash:string} {
  const users=db.prepare('SELECT id,username,role FROM users ORDER BY id').all();
  const tickets=db.prepare('SELECT id,ownerId,title,status,intentId,attemptId FROM tickets ORDER BY id').all();
  return {users:users.length,tickets:tickets.length,hash:createHash('sha256').update(JSON.stringify({users,tickets})).digest('hex')};
}
