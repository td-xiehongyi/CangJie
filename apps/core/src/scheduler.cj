package verification_core
import std.collection.*
import std.time.*
import stdx.encoding.json.*

class RunState {
    let runId: String
    let spec: JsonObject
    var state = "running"
    var checkIndex: Int64 = 0
    var stepIndex: Int64 = 0
    var dispatched: Int64 = 0
    var pending: Option<JsonObject> = None
    let variables = HashMap<String,JsonValue>()
    let verdicts = ArrayList<JsonValue>()
    var evidence = ArrayList<JsonValue>()
    let consumed = HashSet<String>()
    let started = MonoTime.now()
    var actionStarted = MonoTime.now()
    var checkStarted: Bool = false
    let scopeKind: String
    init(id: String, template: JsonObject, kind: String) {
        runId=id; spec=template;scopeKind=kind
        variables.add("params",get(spec,"parameters"))
    }

    func checkId(): String { return items(get(spec,"checks"))[checkIndex].asString().getValue() }
    func transition(actions: ArrayList<JsonValue>,code: String): JsonObject {
        return obj([("runId",JsonString(runId)),("state",JsonString(state)),("code",JsonString(code)),("actions",arr(actions)),("verdicts",arr(verdicts))])
    }
    func finishCheck(reason: String): Unit {
        for (v in items(get(spec,"assertions"))) {
            let a=v.asObject()
            if (textField(a,"checkId")==checkId() && scopeKind!="observation_only") {
                let value=if (reason.isEmpty()) { evaluate(get(a,"expr").asObject(),variables) } else { unknown(reason) }
                verdicts.add(verdict(spec,a,value,evidence,scopeKind))
            }
        }
        checkIndex++;stepIndex=0;checkStarted=false;pending=None
        variables.clear();variables.add("params",get(spec,"parameters"))
        evidence=ArrayList<JsonValue>()
    }
    func dispatch(): JsonObject {
        let actions=ArrayList<JsonValue>()
        if (state!="running") { return transition(actions,"TERMINAL") }
        while (checkIndex < items(get(spec,"checks")).size) {
            if ((MonoTime.now()-started).toMilliseconds() >= number(get(spec,"limits").asObject(),"runTimeoutMs")) {
                finishCheck("RUN_DEADLINE");continue
            }
            let steps=ArrayList<JsonObject>()
            for (s in items(get(spec,"steps"))) { if (textField(s.asObject(),"checkId")==checkId()) { steps.add(s.asObject()) } }
            if (stepIndex >= steps.size) { finishCheck("");continue }
            let step=steps[stepIndex]
            let bindings=HashMap<String,JsonValue>()
            var reason=""
            for ((k,e) in get(step,"bindings").asObject().getFields()) {
                let value=evaluate(e.asObject(),variables)
                if (!value.reason.isEmpty()) { reason=value.reason } else { bindings.add(k,value.value) }
            }
            if (!reason.isEmpty()) { finishCheck(reason);continue }
            if (dispatched >= number(get(spec,"limits").asObject(),"maxActions")) { finishCheck("BUDGET_EXCEEDED");continue }
            let remaining=number(get(spec,"limits").asObject(),"runTimeoutMs")-(MonoTime.now()-started).toMilliseconds()
            if (remaining<1) { finishCheck("RUN_DEADLINE");continue }
            dispatched++
            let actionMs=number(get(spec,"limits").asObject(),"actionTimeoutMs")
            let action=obj([
                ("actionId",JsonString("${runId}:a${dispatched}")),("operationId",get(step,"operationId")),("actorRef",get(step,"actorRef")),
                ("intentId",JsonString("${runId}:${checkId()}")),("attemptId",JsonString("${runId}:${checkId()}:attempt-1")),
                ("checkId",JsonString(checkId())),("stepId",get(step,"stepId")),("bindings",JsonObject(bindings)),
                ("deadline",JsonInt(if (remaining<actionMs) { remaining } else { actionMs })),
                ("isolationKey",JsonString("${runId}:${checkId()}")),("requiresBaseline",JsonBool(!checkStarted))
            ])
            checkStarted=true;pending=Some(action);actionStarted=MonoTime.now();actions.add(action)
            return transition(actions,"ACTION_READY")
        }
        state="completed"
        return transition(actions,"COMPLETED")
    }
    // Host owns the timer/IO. Only the core's monotonic clock can expire a run.
    func tick(): JsonObject {
        if (state!="running") { return transition(ArrayList<JsonValue>(),"TERMINAL") }
        let limits=get(spec,"limits").asObject()
        if ((MonoTime.now()-started).toMilliseconds()>=number(limits,"runTimeoutMs")) { finishCheck("RUN_DEADLINE");return dispatch() }
        if (pending.isSome() && (MonoTime.now()-actionStarted).toMilliseconds()>=number(limits,"actionTimeoutMs")) { consumed.add(textField(pending.getOrThrow(),"actionId"));finishCheck("ACTION_DEADLINE");return dispatch() }
        return transition(ArrayList<JsonValue>(),"WAITING")
    }
    func advance(observation: JsonObject): JsonObject {
        if (state!="running") { return transition(ArrayList<JsonValue>(),"TERMINAL") }
        let actionId=textField(observation,"actionId")
        if (consumed.contains(actionId)) { return transition(ArrayList<JsonValue>(),"DUPLICATE_OBSERVATION") }
        if (pending.isNone() || textField(pending.getOrThrow(),"actionId")!=actionId) { throw Exception("UNKNOWN_ACTION") }
        let action=pending.getOrThrow()
        if (textField(observation,"attemptId")!=textField(action,"attemptId") || textField(observation,"intentId")!=textField(action,"intentId")) { throw Exception("UNKNOWN_ACTION") }
        fields(observation,["actionId","attemptId","intentId","transportStatus","identityVerified","acceptance","result","queryComplete","evidenceRefs"],["actionId","attemptId","intentId","transportStatus","identityVerified","acceptance","result","queryComplete","evidenceRefs"])
        let transport=textField(observation,"transportStatus")
        if (transport!="ok" && transport!="timeout" && transport!="error") { throw Exception("INVALID_TRANSPORT_STATUS") }
        let identity=flag(observation,"identityVerified")
        let complete=flag(observation,"queryComplete")
        var reason=""
        if ((MonoTime.now()-actionStarted).toMilliseconds()>=number(get(spec,"limits").asObject(),"actionTimeoutMs")) { reason="ACTION_DEADLINE" }
        if ((MonoTime.now()-started).toMilliseconds()>=number(get(spec,"limits").asObject(),"runTimeoutMs")) { reason="RUN_DEADLINE" }
        let refs=items(get(observation,"evidenceRefs"))
        for (ref in refs) { if (ref.asString().getValue().isEmpty()) { throw Exception("INVALID_EVIDENCE") } }
        let acceptance=textField(observation,"acceptance")
        if (acceptance!="accepted" && acceptance!="rejected" && acceptance!="unknown") { throw Exception("INVALID_ACCEPTANCE") }
        if (reason.isEmpty() && (transport!="ok" || !identity || !complete || acceptance=="unknown" || refs.isEmpty())) { reason="INSUFFICIENT_EVIDENCE" }
        rejectAnswers(get(observation,"result"))
        let steps=ArrayList<JsonObject>()
        for (s in items(get(spec,"steps"))) { if (textField(s.asObject(),"checkId")==checkId()) { steps.add(s.asObject()) } }
        let step=steps[stepIndex]
        let expected=if (step.containsKey("expectedAcceptance")) { textField(step,"expectedAcceptance") } else { "accepted" }
        if (reason.isEmpty() && acceptance!=expected) {
            reason=if (expected=="rejected" && acceptance=="accepted") { "EXPECTED_REJECTION_VIOLATED" } else { "UNEXPECTED_ACCEPTANCE" }
        }
        // Validate first; malformed frames never consume an outstanding action.
        consumed.add(actionId);pending=None
        for (ref in refs) { evidence.add(ref) }
        if (!reason.isEmpty()) { finishCheck(reason);return dispatch() }
        variables.add(textField(steps[stepIndex],"output"),get(observation,"result"))
        stepIndex++
        return dispatch()
    }
    func cancel(): JsonObject {
        if (state=="running") { state="cancelled";pending=None }
        return transition(ArrayList<JsonValue>(),"CANCELLED")
    }
}

func authorizeRun(payload: JsonObject): Unit {
    let scope=get(payload,"scope").asObject()
    let kind=textField(scope,"kind")
    if (!flag(scope,"confirmed")) { throw Exception("ADMISSION_REQUIRED") }
    if (kind=="observation_validation") {
        if (textField(scope,"validationRef").isEmpty()) { throw Exception("ADMISSION_REQUIRED") }
    } else if (kind=="published_template" || kind=="observation_only") {
        let qualification=get(scope,"qualification").asObject()
        if (textField(qualification,"status")!="published") { throw Exception("ADMISSION_REQUIRED") }
        publishCandidate(qualification,get(qualification,"review").asObject())
        if (get(payload,"spec").toString()!=get(qualification,"spec").toString()) { throw Exception("TEMPLATE_VERSION_MISMATCH") }
        let actualRule=get(payload,"rule").asObject();let qualifiedRule=get(qualification,"rule").asObject()
        for (key in ["id","version","source","preconditions","expectedChanges","invariants","completionDeadline"]) {
            if (get(actualRule,key).toString()!=get(qualifiedRule,key).toString()) { throw Exception("RULE_VERSION_MISMATCH") }
        }
    } else { throw Exception("ADMISSION_REQUIRED") }
    let rule=get(payload,"rule").asObject()
    fields(rule,["id","version","confirmation","source","preconditions","expectedChanges","invariants","completionDeadline"],["id","version","confirmation","source","preconditions","expectedChanges","invariants","completionDeadline"])
    let ref=get(get(payload,"spec").asObject(),"ruleRef").asObject()
    let confirmation=if(kind=="observation_only") { "pending" } else { "confirmed" }
    if (textField(rule,"confirmation")!=confirmation || textField(rule,"source").isEmpty() || textField(rule,"id")!=textField(ref,"id") || number(rule,"version")!=number(ref,"version")) { throw Exception("RULE_CONFIRMATION_REQUIRED") }
    for (key in ["preconditions","expectedChanges","invariants"]) { for (value in items(get(rule,key))) { value.asString().getValue() } }
    if (number(rule,"completionDeadline")<1 || number(rule,"completionDeadline")>300000) { throw Exception("INVALID_BUDGET") }
    if (number(rule,"completionDeadline") < number(get(get(payload,"spec").asObject(),"limits").asObject(),"runTimeoutMs")) { throw Exception("RULE_DEADLINE_EXCEEDED") }
}
