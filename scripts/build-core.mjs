import { mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root, sdk, stdx, toolchainEnv } from './toolchain.mjs';

const executable = resolve(sdk, 'bin/cjc.exe');
if (!existsSync(executable)) throw new Error('Cangjie SDK missing; see docs/evidence/environment.md');
mkdirSync(resolve(root, 'apps/core/target'), { recursive: true });
const result = spawnSync(executable, ['-p', resolve(root, 'apps/core/src'), '-o', resolve(root, 'apps/core/target/verification-core.exe'), '--import-path', resolve(stdx, 'static'), '-L', resolve(stdx, 'static/stdx'), '-lstdx.encoding.json', '-lstdx.serialization.serialization'], { cwd: root, env: toolchainEnv(), stdio: 'inherit', windowsHide: true, timeout: 120000 });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
