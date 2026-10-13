import save from './fixtures/save-result.json' with { type: 'json' };
import duplicate from './fixtures/duplicate-submit.json' with { type: 'json' };
import permission from './fixtures/permission-isolation.json' with { type: 'json' };
import type { TemplateSpec } from './types.js';

// JSON imports widen string literals. The independent runtime schema check is mandatory;
// this assignment also verifies the stable structural fields consumed by TypeScript.
const structure: Omit<TemplateSpec, 'steps'|'assertions'|'evidenceRequirements'> = save;
const duplicateStructure: typeof structure = duplicate;
const permissionStructure: typeof structure = permission;
export const fixtures: unknown[] = [structure,duplicateStructure,permissionStructure];
