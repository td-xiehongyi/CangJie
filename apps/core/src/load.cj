package verification_core
import stdx.encoding.json.*

// Host supplies measured facts. Unknown/partial/stopped runs can never pass.
func loadDecision(p: JsonObject): JsonObject {
    var status = "unknown"
    if (number(p,"failed") > 0) { status = "fail" }
    else if (number(p,"unknown") == 0 && flag(p,"completed") && flag(p,"targetReached") && flag(p,"thresholdsConfirmed") && !flag(p,"generatorLimited")) {
        status = if (flag(p,"withinThresholds")) { "pass" } else { "fail" }
    }
    return JsonValue.fromStr("{\"status\":\"${status}\",\"higherLoadTested\":false}").asObject()
}
