// Host-private independent controls. Choices and expected verdicts never appear in HTTP output.
export const behaviors=['normal','reopen-defect','owner-defect','incomplete-query','temporary-mutation'] as const;
export type Behavior=typeof behaviors[number];
export function behavior(value:unknown):Behavior {
  if(!behaviors.includes(value as Behavior))throw new Error('UNSUPPORTED_REFERENCE_BEHAVIOR');
  return value as Behavior;
}
