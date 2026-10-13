export const MODEL_PRESET=Object.freeze({version:'model-v1',maxCalls:8,maxTokens:120000,maxOutputTokens:6000,maxInputBytes:98304,timeoutMs:90000,deadlineMs:600000,maxAutoRevisions:2});
export type ModelPreset=typeof MODEL_PRESET;
export interface BudgetUsage {calls:number;tokens:number;startedAt:number}
export class ModelBudget {
  readonly usage:BudgetUsage;
  constructor(readonly preset:ModelPreset=MODEL_PRESET,usage:BudgetUsage={calls:0,tokens:0,startedAt:Date.now()}){
    for(const key of ['maxCalls','maxTokens','maxOutputTokens','maxInputBytes','timeoutMs','deadlineMs'] as const)if(!Number.isSafeInteger(preset[key])||preset[key]<1||preset[key]>MODEL_PRESET[key])throw new Error('INVALID_BUDGET');
    if(preset.version!==MODEL_PRESET.version||preset.maxAutoRevisions!==2||!Number.isSafeInteger(usage.calls)||usage.calls<0||!Number.isSafeInteger(usage.tokens)||usage.tokens<0||!Number.isFinite(usage.startedAt)||usage.startedAt>Date.now())throw new Error('INVALID_BUDGET');this.preset=Object.freeze({...preset});this.usage={...usage};
  }
  reserve(bytes:number):number{
    const reservation=bytes+this.preset.maxOutputTokens;
    if(!Number.isSafeInteger(bytes)||bytes<1||bytes>this.preset.maxInputBytes||this.usage.calls>=this.preset.maxCalls||this.usage.tokens+reservation>this.preset.maxTokens||Date.now()-this.usage.startedAt>=this.preset.deadlineMs)throw new Error('BUDGET_EXHAUSTED');
    this.usage.calls++;this.usage.tokens+=reservation;return reservation;
  }
  settle(reservation:number,actual:number):void{if(!Number.isSafeInteger(actual)||actual<0)throw new Error('INCOMPATIBLE_USAGE');this.usage.tokens+=actual-reservation;}
}
