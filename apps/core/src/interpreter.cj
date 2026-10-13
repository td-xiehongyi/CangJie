package verification_core
import std.collection.*
import stdx.encoding.json.*

extend JsonValue {
    func kindText(): String {
        match (kind()) {
            case JsonKind.JsNull => "null"
            case JsonKind.JsBool => "bool"
            case JsonKind.JsInt => "int"
            case JsonKind.JsFloat => "float"
            case JsonKind.JsString => "string"
            case JsonKind.JsArray => "array"
            case JsonKind.JsObject => "object"
        }
    }
}

class EvalValue {
    let value: JsonValue
    let reason: String
    var unknownReasons = ArrayList<JsonValue>()
    init(v: JsonValue, r: String) { value=v; reason=r; if (!r.isEmpty()) { unknownReasons.add(JsonString(r)) } }
}
func unknown(reason: String): EvalValue { return EvalValue(JsonNull(),reason) }
func known(value: JsonValue): EvalValue { return EvalValue(value,"") }
func isNumber(v: JsonValue): Bool { return v.kindText() == "int" || v.kindText() == "float" }
func equalJson(a: JsonValue,b: JsonValue): Bool {
    if (isNumber(a) && isNumber(b)) {
        if (a.kindText() == "int" && b.kindText() == "int") { return a.asInt().getValue() == b.asInt().getValue() }
        let x = if (a.kindText()=="int") { Float64(a.asInt().getValue()) } else { a.asFloat().getValue() }
        let y = if (b.kindText()=="int") { Float64(b.asInt().getValue()) } else { b.asFloat().getValue() }
        return x==y
    }
    if (a.kindText()!=b.kindText()) { return false }
    if (a.kindText()=="object") {
        let x=a.asObject().getFields(); let y=b.asObject().getFields()
        if (x.size!=y.size) { return false }
        for ((k,v) in x) { if (!y.contains(k) || !equalJson(v,y.get(k).getOrThrow())) { return false } }
        return true
    }
    if (a.kindText()=="array") {
        let x=items(a); let y=items(b)
        if (x.size!=y.size) { return false }
        for (i in 0..x.size) { if (!equalJson(x[i],y[i])) { return false } }
        return true
    }
    return a.toString()==b.toString()
}

// Comparisons carry type/missing information through arrays and objects.
func compareJson(a: JsonValue,b: JsonValue): EvalValue {
    if (a.kindText()!=b.kindText() && !(isNumber(a) && isNumber(b))) { return unknown("TYPE_MISMATCH") }
    if (a.kindText()=="array") {
        let x=items(a);let y=items(b)
        if (x.size!=y.size) { return known(JsonBool(false)) }
        var equal=true
        for (i in 0..x.size) { let cmp=compareJson(x[i],y[i]);if (!cmp.reason.isEmpty()) { return cmp };equal=equal && cmp.value.asBool().getValue() }
        return known(JsonBool(equal))
    }
    if (a.kindText()=="object") {
        let x=a.asObject();let y=b.asObject()
        if (x.getFields().size!=y.getFields().size) { return unknown("MISSING_VALUE") }
        var equal=true
        for ((k,v) in x.getFields()) {
            if (!y.containsKey(k)) { return unknown("MISSING_VALUE") }
            let cmp=compareJson(v,get(y,k));if (!cmp.reason.isEmpty()) { return cmp };equal=equal && cmp.value.asBool().getValue()
        }
        return known(JsonBool(equal))
    }
    return known(JsonBool(equalJson(a,b)))
}

func evaluate(e: JsonObject,vars: HashMap<String,JsonValue>): EvalValue {
    let op=textField(e,"op")
    if (op=="const") { return known(get(e,"value")) }
    if (op=="field") {
        let name=textField(e,"var")
        if (!vars.contains(name)) { return unknown("MISSING_VALUE") }
        var value=vars.get(name).getOrThrow()
        for (part in items(get(e,"path"))) {
            if (value.kindText()!="object") { return unknown("MISSING_VALUE") }
            let key=part.asString().getValue()
            if (!value.asObject().containsKey(key)) { return unknown("MISSING_VALUE") }
            value=get(value.asObject(),key)
        }
        return known(value)
    }
    if (op=="exists" || op=="count" || op=="not") {
        let v=evaluate(get(e,"arg").asObject(),vars)
        if (op=="exists") {
            if (v.reason=="MISSING_VALUE") { return known(JsonBool(false)) }
            if (!v.reason.isEmpty()) { return v }
            if (!v.unknownReasons.isEmpty()) { return unknown(v.unknownReasons[0].asString().getValue()) }
            return known(JsonBool(true))
        }
        if (!v.reason.isEmpty()) { return v }
        if (!v.unknownReasons.isEmpty()) { return unknown(v.unknownReasons[0].asString().getValue()) }
        if (op=="count") {
            if (v.value.kindText()!="array") { return unknown("TYPE_MISMATCH") }
            return known(JsonInt(items(v.value).size))
        }
        if (v.value.kindText()!="bool") { return unknown("TYPE_MISMATCH") }
        return known(JsonBool(!v.value.asBool().getValue()))
    }
    let args=items(get(e,"args"))
    if (op=="all" || op=="any") {
        var anyTrue=false; var anyFalse=false; var reason=""
        let unknowns=ArrayList<JsonValue>()
        for (arg in args) {
            let v=evaluate(arg.asObject(),vars)
            for (r in v.unknownReasons) { unknowns.add(r) }
            if (!v.reason.isEmpty()) { reason=v.reason }
            else if (v.value.kindText()!="bool") { reason="TYPE_MISMATCH";unknowns.add(JsonString("TYPE_MISMATCH")) }
            else if (v.value.asBool().getValue()) { anyTrue=true }
            else { anyFalse=true }
        }
        // A proven violation of all is still a violation; otherwise unknown cannot pass.
        if (op=="all" && anyFalse) { let result=known(JsonBool(false));result.unknownReasons=unknowns;return result }
        if (reason.isEmpty() && !unknowns.isEmpty()) { reason=unknowns[0].asString().getValue() }
        if (!reason.isEmpty()) { return unknown(reason) }
        return known(JsonBool(if(op=="all") { !anyFalse } else { anyTrue }))
    }
    let a=evaluate(args[0].asObject(),vars); let b=evaluate(args[1].asObject(),vars)
    if (!a.reason.isEmpty()) { return a }; if (!b.reason.isEmpty()) { return b }
    if (!a.unknownReasons.isEmpty()) { return unknown(a.unknownReasons[0].asString().getValue()) }
    if (!b.unknownReasons.isEmpty()) { return unknown(b.unknownReasons[0].asString().getValue()) }
    if (op=="contains") {
        if (a.value.kindText()!="array") { return unknown("TYPE_MISMATCH") }
        var found=false
        for (v in items(a.value)) { let cmp=compareJson(v,b.value);if (!cmp.reason.isEmpty()) { return cmp };found=found || cmp.value.asBool().getValue() }
        return known(JsonBool(found))
    }
    if (a.value.kindText()!=b.value.kindText() && !(isNumber(a.value) && isNumber(b.value))) { return unknown("TYPE_MISMATCH") }
    let cmp=compareJson(a.value,b.value)
    if (!cmp.reason.isEmpty()) { return cmp }
    let equal=cmp.value.asBool().getValue()
    return known(JsonBool(if(op=="eq") { equal } else { !equal }))
}
