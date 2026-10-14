import { spawnSync } from 'node:child_process';
import { root } from './toolchain.mjs';
const group = process.argv[2];
if (!['protocol','interpreter','access','validation-harness','candidate','registry','replay','transfer','target-load','release','workbench','all'].includes(group)) throw new Error(`Unknown verification group: ${group ?? '(missing)'}`);
const suites={protocol:['tests/contracts/protocol.test.mjs'],interpreter:['tests/contracts/interpreter.test.mjs','tests/contracts/experiment-host.test.mjs','tests/contracts/schema.test.mjs'],access:['tests/integration/access.test.mjs','tests/integration/access-core.test.mjs'],'validation-harness':['tests/integration/validation-harness.test.mjs']};
// T4 deterministic provider/native credential tests; live DeepSeek acceptance is explicit.
suites.candidate=['tests/integration/candidate.test.mjs','tests/integration/target-trial-recovery.test.mjs'];
suites.registry=['tests/integration/registry.test.mjs'];
suites.replay=['tests/integration/workflow.test.mjs','tests/integration/report-presentation.test.mjs','tests/integration/automatic-accounts.test.mjs','tests/integration/replay.test.mjs','tests/integration/workbench-api.test.mjs','tests/integration/workbench-state.test.mjs'];
suites.transfer=['tests/integration/transfer-fixture.test.mjs','tests/integration/transfer.test.mjs'];
suites['target-load']=['tests/integration/target-load.test.mjs'];
suites.release=['tests/integration/main-entry.test.mjs','tests/integration/release.test.mjs','tests/integration/release-security.test.mjs'];
const files = group==='all'?Object.values(suites).flat():suites[group];
const uiBuild=[['node_modules/typescript/bin/tsc','-p','apps/ui/tsconfig.json'],['node_modules/vite/bin/vite.js','build','apps/ui']];
const last=group==='workbench'?[...uiBuild,['node_modules/@playwright/test/cli.js','test']]:[['--test', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=30000', ...files]];
for (const args of [['node_modules/typescript/bin/tsc', '-p', 'packages/contracts/tsconfig.json'], ['node_modules/typescript/bin/tsc', '-p', 'apps/host/tsconfig.json'], ['node_modules/typescript/bin/tsc','-p','samples/ticket/tsconfig.json'], ['node_modules/typescript/bin/tsc','-p','samples/registration/tsconfig.json'], ['node_modules/typescript/bin/tsc','-p','tests/reference/tsconfig.json'], ['scripts/build-core.mjs'], ...(group==='candidate'||group==='all'?uiBuild:[]), ...last]) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true, timeout: group==='all'&&args[0]==='--test'?900000:300000 });
  if (result.error) throw result.error;
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
