package verification_core

import stdx.encoding.json.*

// Host owns immutable evidence and digests; core owns the bounded admission
// decision. This operation has no publication branch (T5 supplies review).
func advanceAdmission(state: JsonObject, input: JsonObject): JsonObject {
    fields(state,["revisionIndex","status","phase","candidateHash","ruleHash","suiteHash","interpreterVersion","code"],["revisionIndex","status","phase","candidateHash","ruleHash","suiteHash","interpreterVersion","code"])
    let revision=number(state,"revisionIndex")
    if (revision<0 || revision>2 || textField(state,"status")=="published") { throw Exception("INVALID_ADMISSION_STATE") }
    let event=textField(input,"event")
    if (textField(state,"status")=="rejected" || textField(state,"status")=="ready_for_review") { return state }
    var status=textField(state,"status");var phase=textField(state,"phase");var code="";var next=revision
    if (event=="needs_rule") { status="needs_rule";phase="waiting";code="RULE_CONFIRMATION_REQUIRED" }
    else if (event=="capability_gap") { status="needs_capability";phase="waiting";code="CAPABILITY_OR_REFERENCE_GAP" }
    else if (event=="provider_fault" || event=="scope_fault") { status="validating";phase="paused";code=textField(input,"code") }
    else if (event=="budget_exhausted") { status="rejected";phase="stopped";code="BUDGET_EXHAUSTED" }
    else if (event=="validation_failed") {
        if (revision<2 && flag(input,"canRevise")) { next=revision+1;status="validating";phase="generating";code="REVISION_REQUIRED" }
        else { status="rejected";phase="stopped";code="REVISION_LIMIT_REACHED" }
    } else if (event=="validated" || event=="trial") {
        let record=get(input,"record").asObject()
        if (textField(state,"candidateHash").isEmpty() || textField(record,"candidateHash")!=textField(state,"candidateHash") || textField(record,"ruleHash")!=textField(state,"ruleHash")) { throw Exception("STALE_VALIDATION_RECORD") }
        let gates=get(record,"gateResults").asObject()
        if (event=="validated") {
            if (textField(record,"scope")!="template_validation" || textField(record,"suiteHash")!=textField(state,"suiteHash") || textField(state,"suiteHash").isEmpty() || textField(record,"interpreterVersion")!=textField(state,"interpreterVersion") || textField(state,"interpreterVersion").isEmpty()) { throw Exception("STALE_VALIDATION_RECORD") }
            for (key in ["static","coverage","observation","http","admitted"]) { if (!flag(gates,key)) { throw Exception("VALIDATION_NOT_PASSED") } }
            status="validating";phase="awaiting_trial";code="TARGET_TRIAL_REQUIRED"
        } else {
            if (phase!="awaiting_trial" || textField(record,"scope")!="project_trial" || textField(record,"projectId").isEmpty() || textField(record,"mappingHash").isEmpty() || !flag(gates,"completed") || !flag(gates,"conclusive")) { throw Exception("TRIAL_NOT_COMPLETED") }
            status="ready_for_review";phase="completed";code="REVIEW_REQUIRED"
        }
    } else { throw Exception("UNKNOWN_ADMISSION_EVENT") }
    return obj([("revisionIndex",JsonInt(next)),("status",JsonString(status)),("phase",JsonString(phase)),("candidateHash",get(state,"candidateHash")),("ruleHash",get(state,"ruleHash")),("suiteHash",get(state,"suiteHash")),("interpreterVersion",get(state,"interpreterVersion")),("code",JsonString(code))])
}
