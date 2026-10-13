package verification_core

import std.collection.*
import stdx.encoding.json.*

func obj(pairs: Array<(String, JsonValue)>): JsonObject { return JsonObject(HashMap<String, JsonValue>(pairs)) }
func arr(values: ArrayList<JsonValue>): JsonArray { return JsonArray(values) }
func items(v: JsonValue): ArrayList<JsonValue> { return v.asArray().getItems() }
func get(o: JsonObject, k: String): JsonValue { return o.get(k).getOrThrow() }
func number(o: JsonObject, k: String): Int64 { return get(o,k).asInt().getValue() }
func flag(o: JsonObject, k: String): Bool { return get(o,k).asBool().getValue() }
func hasText(a: JsonValue, text: String): Bool {
    for (v in items(a)) { if (v.asString().getValue() == text) { return true } }
    return false
}
func fields(o: JsonObject, allowed: Array<String>, required: Array<String>): Unit {
    for ((k, _) in o.getFields()) {
        if (!allowed.contains(k)) { throw Exception("UNSUPPORTED_FIELD") }
    }
    for (k in required) { if (!o.containsKey(k)) { throw Exception("MISSING_FIELD") } }
}
func identifier(s: String): Unit {
    if (s.isEmpty() || s.size > 80) { throw Exception("INVALID_ID") }
    for (b in s.toArray()) {
        if (!((b >= 65 && b <= 90) || (b >= 97 && b <= 122) || (b >= 48 && b <= 57) || b == 45 || b == 95)) { throw Exception("UNSAFE_PATH") }
    }
    if (s == "__proto__" || s == "constructor" || s == "prototype") { throw Exception("UNSAFE_PATH") }
}
// These inputs never belong to an executable candidate or an observation result.
func rejectAnswers(v: JsonValue): Unit {
    let serialized = v.toString().toAsciiLower()
    for (word in ["evaluationlabel", "evaluation_label", "expectedanswer", "answers/", "answers\\", "answerfile", "defectswitch", "defect_switch", "answerdir", "groundtruth"]) {
        if (serialized.contains(word)) { throw Exception("ANSWER_ACCESS") }
    }
}

let expressionOps = ["field", "const", "exists", "eq", "neq", "count", "contains", "all", "any", "not"]

// Abstract boolean evaluation: -1 depends on evidence, 0/1 is statically fixed.
// This is deliberately a small constant/boolean check, not a proof of business correctness.
func staticBoolean(e: JsonObject): Int64 {
    let op=textField(e,"op")
    if (op=="const") { let v=get(e,"value");return if(v.kindText()=="bool") { if(v.asBool().getValue()) { 1 } else { 0 } } else { -1 } }
    if (op=="exists") { return if(items(get(get(e,"arg").asObject(),"path")).isEmpty()) { 1 } else { -1 } }
    if (op=="not") { let v=staticBoolean(get(e,"arg").asObject());return if(v<0) { -1 } else { 1-v } }
    if (op=="all" || op=="any") {
        var unknown=false
        for (arg in items(get(e,"args"))) {
            let v=staticBoolean(arg.asObject())
            if (op=="all" && v==0) { return 0 }
            if (op=="any" && v==1) { return 1 }
            if (v<0) { unknown=true }
        }
        return if(unknown) { -1 } else { if(op=="all") { 1 } else { 0 } }
    }
    if (op=="eq" || op=="neq") {
        let args=items(get(e,"args"));let a=staticBoolean(args[0].asObject());let b=staticBoolean(args[1].asObject())
        if (a>=0 && b>=0) { return if ((a==b)==(op=="eq")) { 1 } else { 0 } }
        if (textField(args[0].asObject(),"op")=="const" && textField(args[1].asObject(),"op")=="const") {
            let cmp=compareJson(get(args[0].asObject(),"value"),get(args[1].asObject(),"value"))
            if (cmp.reason.isEmpty()) { return if(cmp.value.asBool().getValue()==(op=="eq")) { 1 } else { 0 } }
        }
    }
    return -1
}

// Returns whether an expression reads an observation, rather than only parameters/constants.
func validateExpr(v: JsonValue, variables: HashSet<String>, caps: JsonObject, depth: Int64): Bool {
    if (depth > 16) { throw Exception("EXPRESSION_BUDGET") }
    let e = v.asObject()
    let op = textField(e, "op")
    if (!expressionOps.contains(op) || !hasText(get(caps,"expressions"),op)) { throw Exception("UNKNOWN_EXPRESSION") }
    if (op == "field") {
        fields(e,["op","var","path"],["op","var","path"])
        let name = textField(e,"var")
        if (!variables.contains(name)) { throw Exception("UNDEFINED_VARIABLE") }
        let path = items(get(e,"path"))
        if (path.size > 12) { throw Exception("UNSAFE_PATH") }
        for (p in path) { identifier(p.asString().getValue()) }
        return name != "params"
    }
    if (op == "const") {
        fields(e,["op","value"],["op","value"])
        return false
    }
    if (op == "exists" || op == "count" || op == "not") {
        fields(e,["op","arg"],["op","arg"])
        if (op=="exists" && textField(get(e,"arg").asObject(),"op")!="field") { throw Exception("INVALID_EXISTS_ARGUMENT") }
        return validateExpr(get(e,"arg"),variables,caps,depth+1)
    }
    fields(e,["op","args"],["op","args"])
    let args = items(get(e,"args"))
    if ((op == "all" || op == "any") && (args.size < 1 || args.size > 32)) { throw Exception("INVALID_ARITY") }
    if (op != "all" && op != "any" && args.size != 2) { throw Exception("INVALID_ARITY") }
    var observed = false
    for (a in args) { let reads = validateExpr(a,variables,caps,depth+1); observed = observed || reads }
    if ((op == "eq" || op == "neq") && args[0].toString() == args[1].toString()) { throw Exception("TAUTOLOGY") }
    return observed
}

func checkTemplate(spec: JsonObject, caps: JsonObject): Unit {
    fields(spec,["id","revision","ruleRef","parameters","requiredCapabilities","checks","steps","assertions","evidenceRequirements","limits"],["id","revision","ruleRef","parameters","requiredCapabilities","checks","steps","assertions","evidenceRequirements","limits"])
    rejectAnswers(spec)
    identifier(textField(spec,"id"))
    if (number(spec,"revision") < 1) { throw Exception("INVALID_VERSION") }
    let rule = get(spec,"ruleRef").asObject()
    fields(rule,["id","version"],["id","version"])
    identifier(textField(rule,"id"))
    if (number(rule,"version") < 1) { throw Exception("INVALID_VERSION") }
    get(spec,"parameters").asObject()
    fields(caps,["operations","actorRefs","expressions"],["operations","actorRefs","expressions"])
    for (key in ["operations","actorRefs","expressions"]) { for (v in items(get(caps,key))) { identifier(v.asString().getValue()) } }
    for (op in items(get(caps,"expressions"))) { if (!expressionOps.contains(op.asString().getValue())) { throw Exception("UNKNOWN_EXPRESSION") } }
    for (v in items(get(spec,"requiredCapabilities"))) {
        if (!hasText(get(caps,"operations"),v.asString().getValue())) { throw Exception("UNKNOWN_OPERATION") }
    }
    let evidence = get(spec,"evidenceRequirements").asObject()
    fields(evidence,["identityVerified","queryComplete","acceptanceKnown","evidenceRefs"],["identityVerified","queryComplete","acceptanceKnown","evidenceRefs"])
    for (k in ["identityVerified","queryComplete","acceptanceKnown","evidenceRefs"]) { if (!flag(evidence,k)) { throw Exception("WEAK_EVIDENCE_REQUIREMENT") } }
    let limits = get(spec,"limits").asObject()
    fields(limits,["maxActions","actionTimeoutMs","runTimeoutMs"],["maxActions","actionTimeoutMs","runTimeoutMs"])
    checkBudget(limits)
    let steps = items(get(spec,"steps"))
    let assertions = items(get(spec,"assertions"))
    let checks = items(get(spec,"checks"))
    if (steps.isEmpty() || assertions.isEmpty() || checks.isEmpty() || checks.size > 16 || assertions.size > 64 || steps.size > number(limits,"maxActions")) { throw Exception("BUDGET_EXCEEDED") }
    let ids = HashSet<String>()
    for (c in checks) { let id=c.asString().getValue(); identifier(id); if (!ids.add(id)) { throw Exception("DUPLICATE_ID") } }
    let stepIds = HashSet<String>()
    let assertionIds = HashSet<String>()
    // A fresh symbol table for every independent check; no cross-check output access.
    for (c in checks) {
        let checkId = c.asString().getValue()
        let vars = HashSet<String>(["params"])
        var stepCount: Int64 = 0
        var assertionCount: Int64 = 0
        for (s in steps) {
            let step = s.asObject()
            fields(step,["stepId","checkId","operationId","actorRef","bindings","output","expectedAcceptance"],["stepId","checkId","operationId","actorRef","bindings","output"])
            if (step.containsKey("expectedAcceptance")) { let expected=textField(step,"expectedAcceptance");if (expected!="accepted" && expected!="rejected") { throw Exception("INVALID_ACCEPTANCE") } }
            if (!ids.contains(textField(step,"checkId"))) { throw Exception("UNKNOWN_CHECK") }
            if (textField(step,"checkId") != checkId) { continue }
            stepCount++
            let id=textField(step,"stepId"); identifier(id)
            if (!stepIds.add(id)) { throw Exception("DUPLICATE_ID") }
            let operation = textField(step,"operationId")
            if (!hasText(get(caps,"operations"),operation) || !hasText(get(spec,"requiredCapabilities"),operation)) { throw Exception("UNKNOWN_OPERATION") }
            if (!hasText(get(caps,"actorRefs"),textField(step,"actorRef"))) { throw Exception("UNKNOWN_ACTOR") }
            for ((name, expr) in get(step,"bindings").asObject().getFields()) { identifier(name); validateExpr(expr,vars,caps,0) }
            let output = textField(step,"output"); identifier(output)
            if (!vars.add(output)) { throw Exception("DUPLICATE_VARIABLE") }
        }
        for (a in assertions) {
            let assertion = a.asObject()
            fields(assertion,["id","checkId","expr"],["id","checkId","expr"])
            if (!ids.contains(textField(assertion,"checkId"))) { throw Exception("UNKNOWN_CHECK") }
            if (textField(assertion,"checkId") != checkId) { continue }
            assertionCount++
            let id=textField(assertion,"id"); identifier(id)
            if (!assertionIds.add(id)) { throw Exception("DUPLICATE_ID") }
            if (!validateExpr(get(assertion,"expr"),vars,caps,0)) { throw Exception("CONSTANT_ASSERTION") }
            let fixed=staticBoolean(get(assertion,"expr").asObject())
            if (fixed>=0) { throw Exception(if(fixed==1) { "TAUTOLOGY" } else { "CONSTANT_ASSERTION" }) }
        }
        if (stepCount == 0 || assertionCount == 0) { throw Exception("EMPTY_CHECK") }
    }
}

func validateTemplate(spec: JsonObject, capabilities: JsonObject): JsonObject {
    let issues = ArrayList<JsonValue>()
    try { checkTemplate(spec,capabilities) } catch (e: Exception) {
        issues.add(obj([("code",JsonString(e.message))]))
    }
    return obj([("valid",JsonBool(issues.isEmpty())),("issues",arr(issues)),("interpreterVersion",JsonString("1.0.0"))])
}
