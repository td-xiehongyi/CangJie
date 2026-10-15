import { spawnSync } from 'node:child_process';
import { root } from './toolchain.mjs';
const group = process.argv[2];
if (!['protocol','interpreter','access','discovery','validation-harness','candidate','registry','replay','transfer','target-load','release','workbench','all'].includes(group)) throw new Error(`Unknown verification group: ${group ?? '(missing)'}`);
const suites={protocol:['tests/contracts/protocol.test.mjs'],interpreter:['tests/contracts/interpreter.test.mjs','tests/contracts/experiment-host.test.mjs','tests/contracts/schema.test.mjs'],access:['tests/integration/access.test.mjs','tests/integration/access-core.test.mjs'],'validation-harness':['tests/integration/validation-harness.test.mjs']};
suites.discovery=['tests/integration/discovery-live-source.test.mjs','tests/integration/model-key-validation.test.mjs','tests/unit/verify-reuse-delivery-runner.test.mjs','tests/integration/discovery-reuse.test.mjs','tests/integration/discovery-package.test.mjs','tests/integration/discovery-delivery-chain.test.mjs','tests/unit/verify-status-rule-runner.test.mjs','tests/unit/discovered-rule-ui.test.mjs','tests/integration/discovered-rule-api.test.mjs','tests/integration/discovered-rule-execution.test.mjs','tests/integration/status-ticket-fixture.test.mjs','tests/integration/status-transition-validation.test.mjs','tests/unit/project-rules-source-race.test.mjs','tests/unit/verify-project-rules-runner.test.mjs','tests/integration/project-rules.test.mjs','tests/integration/project-rules-api.test.mjs','tests/integration/rule-readiness.test.mjs','tests/unit/verify-discovery-runner.test.mjs','tests/unit/discovery-state-race.test.mjs','tests/integration/discovery-access.test.mjs','tests/integration/discovery-session.test.mjs','tests/integration/discovery-api.test.mjs'];
// T4 deterministic provider/native credential tests; live DeepSeek acceptance is explicit.
suites.candidate=['tests/integration/candidate.test.mjs','tests/integration/target-trial-recovery.test.mjs'];
suites.registry=['tests/integration/registry.test.mjs'];
suites.replay=['tests/integration/workflow.test.mjs','tests/integration/report-presentation.test.mjs','tests/integration/automatic-accounts.test.mjs','tests/integration/replay.test.mjs','tests/integration/workbench-api.test.mjs','tests/integration/workbench-state.test.mjs'];
suites.transfer=['tests/integration/transfer-fixture.test.mjs','tests/integration/transfer.test.mjs'];
suites['target-load']=['tests/integration/target-load.test.mjs'];
suites.release=['tests/integration/main-entry.test.mjs','tests/integration/release.test.mjs','tests/integration/release-security.test.mjs'];
const files = group==='all'?Object.values(suites).flat():suites[group];
const uiBuild=[['node_modules/typescript/bin/tsc','-p','apps/ui/tsconfig.json'],['node_modules/vite/bin/vite.js','build','apps/ui']];
const last=group==='workbench'?[...uiBuild,['node_modules/@playwright/test/cli.js','test']]:[[...(group==='discovery'||group==='all'?['--experimental-test-module-mocks']:[]),'--test', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=180000', ...files]];
for (const args of [['node_modules/typescript/bin/tsc', '-p', 'packages/contracts/tsconfig.json'], ['node_modules/typescript/bin/tsc', '-p', 'apps/host/tsconfig.json'], ['node_modules/typescript/bin/tsc','-p','samples/ticket/tsconfig.json'], ['node_modules/typescript/bin/tsc','-p','samples/registration/tsconfig.json'], ['node_modules/typescript/bin/tsc','-p','samples/status-ticket/tsconfig.json'], ['node_modules/typescript/bin/tsc','-p','tests/reference/status-transition/tsconfig.json'], ['node_modules/typescript/bin/tsc','-p','tests/reference/tsconfig.json'], ['scripts/build-core.mjs'], ...(group==='candidate'||group==='all'?uiBuild:[]), ...last]) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true, timeout: (group==='all'||group==='discovery')&&args.includes('--test')?900000:300000 });
  if (result.error) throw result.error;
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
