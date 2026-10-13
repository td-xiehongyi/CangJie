import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import os from 'node:os';
import { root, sdk, stdx, toolchainEnv } from './toolchain.mjs';

function probe(executable, args) {
  const result = spawnSync(executable, args, { env: toolchainEnv(), encoding: 'utf8', windowsHide: true, timeout: 10000 });
  return { executable, available: result.status === 0, status: result.status, error: result.error?.code, version: (result.stdout ?? '').trim().slice(0,500) };
}
const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].map(path => ({ path, found: existsSync(path), automationVerified: false }));
const report = {
  recordedAt: new Date().toISOString(), os: { type: os.type(), release: os.release(), arch: os.arch() },
  node: { executable: process.execPath, version: process.version },
  cjc: probe(resolve(sdk, 'bin/cjc.exe'), ['-v']),
  cjpm: probe(resolve(sdk, 'tools/bin/cjpm.exe'), ['-v']),
  stdx: { version: '1.0.5.1', path: stdx, found: existsSync(resolve(stdx, 'static/stdx/stdx.encoding.json.cjo')) },
  k6: probe(existsSync(resolve(root,'.local-tools/k6-v2.3.0-windows-amd64/k6.exe'))?resolve(root,'.local-tools/k6-v2.3.0-windows-amd64/k6.exe'):'k6', ['version']), browsers,
  playwrightInstalled: existsSync(resolve(root, 'node_modules/@playwright/test/package.json')),
  previewUnmodifiedRequired: true
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--record')) {
  mkdirSync(resolve(root, 'docs/evidence'), { recursive: true });
  writeFileSync(resolve(root, 'docs/evidence/environment.json'), JSON.stringify(report, null, 2) + '\n');
}
if (!report.cjc.available || !report.cjpm.available || !report.stdx.found || !/^v24\./.test(process.version)) process.exitCode = 1;
