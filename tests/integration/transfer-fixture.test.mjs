import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('T7 frozen publications restore in an empty directory without republishing',async()=>{
  assert.ok(existsSync('scripts/t7-fixture.mjs'),'portable frozen fixture restore must exist');
  const {restoreFixture}=await import('../../scripts/t7-fixture.mjs');
  const directory=await mkdtemp(join(tmpdir(),'verification-t7-fixture-'));
  const first=await restoreFixture(directory),second=await restoreFixture(directory);
  assert.equal(first.registry,second.registry);assert.equal(first.publications,4);
  assert.equal(first.restored,119);assert.equal(second.restored,0);
  const bundle=JSON.parse(await readFile('tests/fixtures/t7-frozen-evidence.json','utf8'));
  for(const file of bundle.files)assert.equal(await readFile(join(directory,file.path),'utf8'),file.content);
  const frozen=JSON.parse(await readFile('docs/evidence/t7-freeze.json','utf8'));
  for(const p of frozen.publications){const saved=JSON.parse(await readFile(join(first.registry,'published',`${p.ref.id}@${p.ref.version}.json`),'utf8'));assert.deepEqual(saved.record,p);}
  const path=join(first.registry,'published',`${frozen.publications[0].ref.id}@1.0.0.json`);
  await writeFile(path,'existing unrelated data');
  await assert.rejects(restoreFixture(directory),/FIXTURE_CONFLICT/);
  assert.equal(await readFile(path,'utf8'),'existing unrelated data');
});

test('T7 fixture rejects tampered bytes and escaping paths before any restore',async()=>{
  const {restoreFixture}=await import('../../scripts/t7-fixture.mjs');
  const original=JSON.parse(await readFile('tests/fixtures/t7-frozen-evidence.json','utf8'));
  const directory=await mkdtemp(join(tmpdir(),'verification-t7-invalid-'));
  const tampered=structuredClone(original);tampered.files.at(-1).content+='x';
  await assert.rejects(restoreFixture(directory,tampered),/FIXTURE_HASH_MISMATCH/);
  assert.equal(existsSync(join(directory,'.local-data')),false);
  const escaped=structuredClone(original);escaped.files.at(-1).path='../outside.json';
  await assert.rejects(restoreFixture(directory,escaped),/INVALID_FIXTURE_PATH/);
  assert.equal(existsSync(join(directory,'.local-data')),false);
});
