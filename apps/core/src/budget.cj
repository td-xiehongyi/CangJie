package verification_core
import stdx.encoding.json.*

func checkBudget(limits: JsonObject): Unit {
    let actions=number(limits,"maxActions")
    let actionMs=number(limits,"actionTimeoutMs")
    let runMs=number(limits,"runTimeoutMs")
    if (actions < 1 || actions > 64 || actionMs < 1 || actionMs > 30000 || runMs < actionMs || runMs > 300000) { throw Exception("INVALID_BUDGET") }
}
