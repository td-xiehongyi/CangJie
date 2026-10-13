// Reviewed reference behavior v1. This is a verification facility, not a target website.
// These choices are supplied by the host; HTTP responses never expose a choice or label.
export const behaviors=['normal','save-drop','duplicate','permission-leak','priority-reset','owner-change','missing','partial','wrong-object','crash','timeout'] as const;
export type Behavior=typeof behaviors[number];
export function behavior(value:unknown):Behavior {
  if(!behaviors.includes(value as Behavior))throw new Error('UNSUPPORTED_REFERENCE_BEHAVIOR');
  return value as Behavior;
}
