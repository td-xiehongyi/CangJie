export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type RuleRef = { id: string; version: number };
export type FieldExpr = { op: 'field'; var: string; path: string[] };
export type Expr =
  | FieldExpr
  | { op: 'const'; value: Json }
  | { op: 'exists'; arg: FieldExpr }
  | { op: 'count' | 'not'; arg: Expr }
  | { op: 'eq' | 'neq' | 'contains' | 'all' | 'any'; args: Expr[] };
export interface RuleContract extends RuleRef {
  confirmation: 'confirmed' | 'pending'; source: string;
  preconditions: string[]; expectedChanges: string[]; invariants: string[];
  completionDeadline: number;
}
export interface CapabilitySet { operations: string[]; actorRefs: string[]; expressions: Expr['op'][] }
export interface TemplateSpec {
  id: string; revision: number; ruleRef: RuleRef;
  parameters: { [key: string]: Json }; requiredCapabilities: string[]; checks: string[];
  steps: { stepId: string; checkId: string; operationId: string; actorRef: string; bindings: Record<string, Expr>; output: string; expectedAcceptance?:'accepted'|'rejected' }[];
  assertions: { id: string; checkId: string; expr: Expr }[];
  evidenceRequirements: { identityVerified: true; queryComplete: true; acceptanceKnown: true; evidenceRefs: true };
  limits: { maxActions: number; actionTimeoutMs: number; runTimeoutMs: number };
}
export interface MappingSpec {
  id: string; version: number; authMode: 'token';
  operations: { operationId: string; method: 'GET'|'POST'|'PATCH'|'PUT'|'DELETE'; path: string;bodyBindings?:Record<string,string>;queryBindings?:Record<string,string> }[];
  actorRefs: string[]; targetRef: string;
  auth:{loginPath:string;usernameField:string;passwordField:string;tokenPath:string[];identityPath:string;idPath:string[]};
  resultBindings: Record<string,Record<string,string[]>>;
  queryCompleteness: Record<string,{itemsPath:string[];totalPath:string[];hasMorePath:string[];completePath:string[]}>;
}
export interface ToolAction {
  actionId: string; operationId: string; actorRef: string; intentId: string; attemptId: string;
  checkId: string; stepId: string; bindings: Record<string, Json>;
  /** Relative milliseconds from dispatch, enforced against a monotonic core clock. */
  deadline: number; isolationKey: string; requiresBaseline: boolean;
}
export interface Observation {
  actionId: string; intentId: string; attemptId: string;
  transportStatus: 'ok'|'timeout'|'error'; identityVerified: boolean;
  acceptance: 'accepted'|'rejected'|'unknown'; result: Json; queryComplete: boolean; evidenceRefs: string[];
}
export interface Verdict {
  status: 'pass'|'fail'|'inconclusive'; reasonCode: string; ruleRef: RuleRef;
  assertionRef: string; checkId: string; evidenceRefs: string[]; unknownReasons: string[]; scope: 'observation_validation'|'published_template';
}
export type RunStatus = 'draft'|'awaiting_confirmation'|'ready'|'running'|'paused'|'blocked'|'completed'|'cancelled';
export type CandidateStatus = 'draft'|'needs_rule'|'needs_capability'|'validating'|'rejected'|'ready_for_review'|'published'|'disabled';
export interface Transition { runId: string; state: RunStatus; code: string; actions: ToolAction[]; verdicts: Verdict[] }
export interface ValidationResult { valid: boolean; issues: {code: string}[]; interpreterVersion: string }
export interface RunStart { operation: 'runTemplate'; spec: TemplateSpec; capabilities: CapabilitySet; rule: RuleContract; scope: {kind:'observation_validation';confirmed:true;validationRef:string} }
export interface ValidationRecord {
  scope:'template_validation'|'project_trial'; candidateHash:string; ruleHash:string; interpreterVersion:string;
  suiteHash:string; mappingHash:string; gateResults:Record<string, boolean>; evidenceRefs:string[]; projectId?:string;
  mappingDefinitionHash?:string; cases?:ValidationCaseResult[]; issues?:string[]; recordRef?:string;
  copyId?:string; completed?:boolean; verdicts?:Verdict[];
}
export interface ValidationCaseResult {
  caseId:string;phase:'observation'|'http';completed:boolean;matched:boolean;verdicts:Verdict[];evidenceRefs:string[];
  reason?:string;copyId?:string;mappingHash?:string;effectiveCandidateHash?:string;
}
export interface ReviewRecord { validationRef:string; businessConfirmation:string; technicalReviewer:string; decision:'approve'|'reject';time:string;scope:string }
export interface TargetLoadPlan {flowRef:string;targetRate:number;duration:number;operationMix:Record<string,number>;dataScale:number;latencyThreshold:number;errorThreshold:number;window:number;maxOperations:number;settlementDeadline:number}
