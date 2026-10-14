// Test-only admission/registry adapter. It does not run Cangjie and never reads
// private expected labels. Its publications live only in each test's registry.
import {StatusTransitionCoreModel} from './status-transition-core-model.mjs';
import {isDeepStrictEqual} from 'node:util';
export class StatusTransitionAdmissionModel extends StatusTransitionCoreModel {
  async send(envelope){const p=envelope.payload;let data;
    if(envelope.kind==='start'&&p.operation==='advanceAdmission'){
      const s=structuredClone(p.candidate),e=p.record.event,r=p.record.record;
      if(e==='validated'){
        if(['candidateHash','ruleHash','suiteHash','interpreterVersion'].some(k=>s[k]!==r[k]))throw new Error('STALE_VALIDATION_RECORD');
        if(r.scope!=='template_validation'||!['static','coverage','observation','http','admitted'].every(k=>r.gateResults[k]))throw new Error('VALIDATION_NOT_PASSED');
        Object.assign(s,{status:'validating',phase:'awaiting_trial',code:'TARGET_TRIAL_REQUIRED'});
      }else if(e==='trial'){
        if(s.phase!=='awaiting_trial'||s.candidateHash!==r.candidateHash||s.ruleHash!==r.ruleHash||!r.gateResults.completed||!r.gateResults.conclusive)throw new Error('TRIAL_NOT_COMPLETED');
        Object.assign(s,{status:'ready_for_review',phase:'completed',code:'REVIEW_REQUIRED'});
      }else if(e==='validation_failed')Object.assign(s,s.revisionIndex<2?{revisionIndex:s.revisionIndex+1,status:'validating',phase:'generating'}:{status:'rejected',phase:'stopped',code:'REVISION_LIMIT_REACHED'});
      else if(e==='capability_gap')Object.assign(s,{status:'needs_capability',phase:'waiting'});
      else if(e==='needs_rule')Object.assign(s,{status:'needs_rule',phase:'waiting'});
      else Object.assign(s,{status:'validating',phase:'paused',code:p.record.code});data=s;
    }else if(envelope.kind==='start'&&['publishCandidate','checkQualification'].includes(p.operation)){
      if(p.disabled)throw new Error('VERSION_DISABLED');const d=p.draft,r=p.review;
      if(r.decision!=='approve'||r.scope!==d.draftHash||r.validationRef!==d.validation.recordRef||![r.businessConfirmation,r.technicalReviewer,r.time].every(Boolean))throw new Error('REVIEW_REQUIRED_OR_STALE');
      if(!Object.values(d.validation.gateResults).every(Boolean)||!d.trial.gateResults.conclusive||d.validation.interpreterVersion!=='test-only-model'||d.trial.interpreterVersion!=='test-only-model')throw new Error('TEST_MODEL_QUALIFICATION_REJECTED');
      data={status:'published'};
    }else if(envelope.kind==='start'&&p.operation==='matchTemplate')data={matched:p.ruleHashes.includes(p.ruleHash)};
    else return super.send(envelope);
    return [{...envelope,kind:'event',payload:{status:'completed',data}}];
  }
}
