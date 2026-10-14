// Explicit test-only scheduler model. It proves host orchestration, not native
// Cangjie execution. It reads no suite, fixture traces, or expected verdicts.
import {isDeepStrictEqual} from 'node:util';
import {validateContract} from '../../packages/contracts/dist/validate.js';
export const modelRuns=[];
const missing=()=>({reason:'MISSING_VALUE'});
function evaluate(expr,variables){
  if(expr.op==='const')return {value:expr.value};
  if(expr.op==='field'){
    let value=variables[expr.var];for(const key of expr.path){if(value===null||typeof value!=='object'||!Object.hasOwn(value,key))return missing();value=value[key]}
    return value===undefined?missing():{value};
  }
  if(expr.op==='eq'||expr.op==='neq'){
    const a=evaluate(expr.args[0],variables),b=evaluate(expr.args[1],variables);if(a.reason||b.reason)return {reason:a.reason??b.reason};
    if(typeof a.value!==typeof b.value)return {reason:'TYPE_MISMATCH'};
    const equal=isDeepStrictEqual(a.value,b.value);return {value:expr.op==='eq'?equal:!equal};
  }
  throw new Error('TEST_MODEL_EXPRESSION_UNSUPPORTED');
}
export class StatusTransitionCoreModel {
  runs=new Map();
  async close(){}
  async send(envelope){
    const {runId,payload,kind}=envelope;let data;
    if(kind==='start'&&payload.operation==='validateTemplate'){
      const valid=validateContract('TemplateSpec',payload.spec).valid;
      data={valid,issues:valid?[]:[{code:'SCHEMA_REJECTED'}],interpreterVersion:'test-only-model'};
    }else if(kind==='start'){
      const run={runId,spec:structuredClone(payload.spec),check:0,step:0,dispatched:0,variables:{params:payload.spec.parameters},verdicts:[],refs:[],observations:[],state:'running'};
      this.runs.set(runId,run);modelRuns.push(run);data=this.dispatch(run);
    }else{
      const run=this.runs.get(runId);if(!run)throw new Error('TEST_MODEL_UNKNOWN_RUN');
      if(kind==='cancel'){run.state='cancelled';data=this.transition(run,[])}
      else if(kind==='observation'){
        const observation=payload.observation,action=run.pending;
        if(!action||['actionId','attemptId','intentId'].some(k=>observation[k]!==action[k]))throw new Error('UNKNOWN_ACTION');
        run.observations.push(structuredClone(observation));run.refs.push(...observation.evidenceRefs);
        let reason='';
        if(observation.transportStatus!=='ok'||!observation.identityVerified||!observation.queryComplete||observation.acceptance==='unknown'||!observation.evidenceRefs.length)reason='INSUFFICIENT_EVIDENCE';
        const step=run.spec.steps.filter(s=>s.checkId===run.spec.checks[run.check])[run.step];
        const expected=step.expectedAcceptance??'accepted';
        if(!reason&&observation.acceptance!==expected)reason=expected==='rejected'&&observation.acceptance==='accepted'?'EXPECTED_REJECTION_VIOLATED':'UNEXPECTED_ACCEPTANCE';
        if(reason)this.finish(run,reason);else{run.variables[step.output]=observation.result;run.step++}
        data=this.dispatch(run);
      }else throw new Error('TEST_MODEL_KIND_UNSUPPORTED');
    }
    return [{...envelope,kind:'event',payload:{status:'completed',data}}];
  }
  transition(run,actions){return {runId:run.runId,state:run.state,code:run.state==='running'?'ACTION_READY':'COMPLETED',actions,verdicts:structuredClone(run.verdicts)}}
  finish(run,reason=''){
    for(const assertion of run.spec.assertions.filter(a=>a.checkId===run.spec.checks[run.check])){
      const value=reason?{reason}:evaluate(assertion.expr,run.variables);
      const status=value.reason==='EXPECTED_REJECTION_VIOLATED'?'fail':value.reason?'inconclusive':value.value===true?'pass':value.value===false?'fail':'inconclusive';
      const reasonCode=value.reason??(status==='pass'?'ASSERTION_TRUE':status==='fail'?'ASSERTION_FALSE':'TYPE_MISMATCH');
      run.verdicts.push({status,reasonCode,ruleRef:run.spec.ruleRef,assertionRef:assertion.id,checkId:assertion.checkId,evidenceRefs:[...run.refs],unknownReasons:value.reason?[value.reason]:[],scope:'observation_validation'});
    }
    run.check++;run.step=0;run.variables={params:run.spec.parameters};run.refs=[];
  }
  dispatch(run){
    while(run.check<run.spec.checks.length){
      const steps=run.spec.steps.filter(s=>s.checkId===run.spec.checks[run.check]);
      if(run.step===steps.length){this.finish(run);continue}
      const step=steps[run.step],bindings={};let reason;
      for(const [key,expr]of Object.entries(step.bindings)){const value=evaluate(expr,run.variables);if(value.reason)reason=value.reason;else bindings[key]=value.value}
      if(reason){this.finish(run,reason);continue}
      const action={actionId:`${run.runId}:a${++run.dispatched}`,operationId:step.operationId,actorRef:step.actorRef,intentId:`${run.runId}:${step.checkId}`,attemptId:`${run.runId}:${step.checkId}:attempt-1`,checkId:step.checkId,stepId:step.stepId,bindings,deadline:run.spec.limits.actionTimeoutMs,isolationKey:`${run.runId}:${step.checkId}`,requiresBaseline:run.step===0};
      run.pending=action;return this.transition(run,[action]);
    }
    run.state='completed';return this.transition(run,[]);
  }
}
