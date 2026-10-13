import { fileURLToPath } from 'node:url';
import { resolve, delimiter } from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const sdk = resolve(process.env.CANGJIE_SDK ?? resolve(root, '.local-tools/cangjie'));
export const stdx = resolve(process.env.CANGJIE_STDX ?? resolve(root, '.local-tools/stdx/windows_x86_64_cjnative'));
export function toolchainEnv() {
  const env = { ...process.env, CANGJIE_HOME: sdk };
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'Path';
  env[pathKey] = [resolve(sdk, 'tools/lib'), resolve(sdk, 'tools/bin'), resolve(sdk, 'bin'), resolve(sdk, 'lib/windows_x86_64_cjnative'), resolve(sdk, 'runtime/lib/windows_x86_64_cjnative'), resolve(stdx, 'dynamic/stdx'), env[pathKey] ?? ''].join(delimiter);
  return env;
}
export function coreCommand() {
  return { executable: resolve(root, 'apps/core/target/verification-core.exe'), args: [], cwd: root, env: toolchainEnv() };
}
