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
export function publicBaseline(db:DatabaseSync) {
  const users=db.prepare('SELECT id,account,role FROM participants ORDER BY id').all();
  const records=db.prepare('SELECT * FROM enrollments ORDER BY id').all();
  return {users:users.length,records:records.length,hash:createHash('sha256').update(JSON.stringify({users,records})).digest('hex')};
}
