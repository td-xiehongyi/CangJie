package verification_core
import std.collection.*
import stdx.encoding.json.*

func verdict(spec: JsonObject, assertion: JsonObject, value: EvalValue, refs: ArrayList<JsonValue>, scopeKind: String): JsonObject {
    var status="inconclusive"
    var reason=value.reason
    if (reason=="EXPECTED_REJECTION_VIOLATED") { status="fail" }
    else if (reason.isEmpty()) {
        if (value.value.kindText()!="bool") { reason="TYPE_MISMATCH" }
        else if (value.value.asBool().getValue() && !value.unknownReasons.isEmpty()) { reason=value.unknownReasons[0].asString().getValue() }
        else if (value.value.asBool().getValue()) { status="pass";reason="ASSERTION_TRUE" }
        else { status="fail";reason="ASSERTION_FALSE" }
    }
    return obj([("status",JsonString(status)),("reasonCode",JsonString(reason)),("ruleRef",get(spec,"ruleRef")),("assertionRef",get(assertion,"id")),("checkId",get(assertion,"checkId")),("evidenceRefs",arr(refs)),("unknownReasons",arr(value.unknownReasons)),("scope",JsonString(scopeKind))])
}
