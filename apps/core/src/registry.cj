package verification_core

import stdx.encoding.json.*

// The host re-reads immutable evidence and computes digests. Core independently
// enforces both validation stages and the two explicit, version-bound approvals.
func publishCandidate(draft: JsonObject, review: JsonObject): JsonObject {
    let spec=get(draft,"spec").asObject();let rule=get(draft,"rule").asObject()
    if (textField(rule,"confirmation")!="confirmed" || !flag(validateTemplate(spec,get(draft,"capabilities").asObject()),"valid")) { throw Exception("INVALID_TEMPLATE_OR_RULE") }
    let ruleRef=get(spec,"ruleRef").asObject()
    if (textField(ruleRef,"id")!=textField(rule,"id") || number(ruleRef,"version")!=number(rule,"version")) { throw Exception("STALE_RULE") }
    let record=get(draft,"validation").asObject();let trial=get(draft,"trial").asObject()
    if (textField(record,"interpreterVersion")!="1.0.0" || textField(trial,"interpreterVersion")!="1.0.0") { throw Exception("STALE_INTERPRETER") }
    let state=obj([("revisionIndex",JsonInt(0)),("status",JsonString("validating")),("phase",JsonString("validating_draft")),("candidateHash",get(draft,"candidateHash")),("ruleHash",get(draft,"ruleHash")),("suiteHash",get(record,"suiteHash")),("interpreterVersion",JsonString("1.0.0")),("code",JsonString(""))])
    let validated=advanceAdmission(state,obj([("event",JsonString("validated")),("record",record)]))
    let ready=advanceAdmission(validated,obj([("event",JsonString("trial")),("record",trial)]))
    if (textField(ready,"status")!="ready_for_review") { throw Exception("CANDIDATE_NOT_READY") }
    if (items(get(record,"evidenceRefs")).isEmpty() || items(get(trial,"evidenceRefs")).isEmpty()) { throw Exception("MISSING_EVIDENCE") }
    if (textField(review,"decision")!="approve" || textField(review,"scope")!=textField(draft,"draftHash") || textField(review,"validationRef")!=textField(record,"recordRef")) { throw Exception("REVIEW_REQUIRED_OR_STALE") }
    for (key in ["businessConfirmation","technicalReviewer","time"]) { if (textField(review,key).trimAscii().isEmpty()) { throw Exception("REVIEW_REQUIRED") } }
    return obj([("status",JsonString("published")),("candidateHash",get(draft,"candidateHash")),("draftHash",get(draft,"draftHash"))])
}

func registryOperation(operation: String, payload: JsonObject): JsonObject {
    if (operation=="matchTemplate") {
        let valid=validateTemplate(get(payload,"spec").asObject(),get(payload,"capabilities").asObject())
        return obj([("matched",JsonBool(flag(valid,"valid") && hasText(get(payload,"ruleHashes"),textField(payload,"ruleHash"))))])
    }
    if (operation=="checkQualification" && flag(payload,"disabled")) { throw Exception("VERSION_DISABLED") }
    return publishCandidate(get(payload,"draft").asObject(),get(payload,"review").asObject())
}
