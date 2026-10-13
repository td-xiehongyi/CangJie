package verification_core

import std.collection.*
import std.env.*
import stdx.encoding.json.*

func textField(value: JsonObject, key: String): String {
    return value.get(key).getOrThrow().asString().getValue()
}

func emit(messageId: String, runId: String, status: String, code: String, data: JsonValue): Unit {
    let payload = JsonObject(HashMap<String, JsonValue>([
        ("status", JsonString(status)), ("code", JsonString(code)), ("data", data)
    ]))
    let response = JsonObject(HashMap<String, JsonValue>([
        ("schemaVersion", JsonInt(1)), ("messageId", JsonString(messageId)),
        ("runId", JsonString(runId)), ("kind", JsonString("event")), ("payload", payload)
    ]))
    getStdOut().writeln(response.toString())
    getStdOut().flush()
}

// Preserve T0's waiting transport probe separately from the T1 experiment state.
class Protocol {
    var experiment: Option<RunState> = None
    let replies = HashMap<String,JsonObject>()
    let requests = HashMap<String,String>()
    let usedRuns = HashSet<String>()
    var waitingMessage: String = ""
    var waitingRun: String = ""

    func handle(line: String): Unit {
        var messageId = ""
        var runId = ""
        try {
            let message = JsonValue.fromStr(line).asObject()
            messageId = textField(message, "messageId")
            runId = textField(message, "runId")
            if (messageId.isEmpty() || runId.isEmpty()) { throw Exception("empty identity") }
            if (message.get("schemaVersion").getOrThrow().asInt().getValue() != 1) {
                emit(messageId, runId, "error", "UNSUPPORTED_VERSION", JsonNull())
                return
            }
            let kind = textField(message, "kind")
            let payload = message.get("payload").getOrThrow().asObject()
            let key = "${runId}/${messageId}"
            if (requests.contains(key)) {
                if (requests.get(key).getOrThrow()!=line) { emit(messageId,runId,"error","MESSAGE_ID_CONFLICT",JsonNull());return }
                if (experiment.isSome() && experiment.getOrThrow().runId==runId && experiment.getOrThrow().state!="running") {
                    emit(messageId,runId,"completed","OK",experiment.getOrThrow().transition(ArrayList<JsonValue>(),"TERMINAL"));return
                }
                let cached=replies.get(key).getOrThrow()
                if (experiment.isSome() && experiment.getOrThrow().runId==runId) {
                    for (action in items(get(cached,"actions"))) {
                        if (experiment.getOrThrow().consumed.contains(textField(action.asObject(),"actionId"))) {
                            emit(messageId,runId,"completed","OK",experiment.getOrThrow().transition(ArrayList<JsonValue>(),"DUPLICATE_MESSAGE"));return
                        }
                    }
                }
                emit(messageId,runId,"completed","OK",replies.get(key).getOrThrow());return
            }
            if (kind=="start" && payload.containsKey("operation") && textField(payload,"operation")=="tick") {
                if (experiment.isNone() || experiment.getOrThrow().runId!=runId) { emit(messageId,runId,"error","UNKNOWN_RUN",JsonNull());return }
                emit(messageId,runId,"completed","OK",experiment.getOrThrow().tick());return
            }
            if (kind=="observation" || (kind=="cancel" && experiment.isSome() && experiment.getOrThrow().runId==runId)) {
                if (experiment.isNone() || experiment.getOrThrow().runId!=runId) { emit(messageId,runId,"error","UNKNOWN_RUN",JsonNull());return }
                try {
                    let wasRunning=experiment.getOrThrow().state=="running"
                    let result=if (kind=="cancel") { experiment.getOrThrow().cancel() } else { experiment.getOrThrow().advance(get(payload,"observation").asObject()) }
                    if (wasRunning && textField(result,"code")!="DUPLICATE_OBSERVATION") { requests.add(key,line);replies.add(key,result) }
                    emit(messageId,runId,"completed","OK",result)
                } catch (e: Exception) { emit(messageId,runId,"error",e.message,JsonNull()) }
                return
            }
            if (kind == "cancel") {
                if (waitingRun == runId && !waitingMessage.isEmpty()) {
                    emit(waitingMessage, waitingRun, "cancelled", "CANCELLED", JsonNull())
                    waitingMessage = ""
                    waitingRun = ""
                }
                emit(messageId, runId, "cancelled", "CANCELLED", JsonNull())
            } else if (kind == "start") {
                if (!waitingMessage.isEmpty()) {
                    emit(messageId, runId, "error", "CORE_BUSY", JsonNull())
                    return
                }
                let operation = if (payload.containsKey("operation")) { textField(payload, "operation") } else { "echo" }
                if (operation=="loadDecision") {
                    try { emit(messageId,runId,"completed","OK",loadDecision(payload)) }
                    catch (e: Exception) { emit(messageId,runId,"error",e.message,JsonNull()) }
                } else if (operation=="publishCandidate" || operation=="checkQualification" || operation=="matchTemplate") {
                    try { emit(messageId,runId,"completed","OK",registryOperation(operation,payload)) }
                    catch (e: Exception) { emit(messageId,runId,"error",e.message,JsonNull()) }
                } else if (operation=="advanceAdmission") {
                    try { emit(messageId,runId,"completed","OK",advanceAdmission(get(payload,"candidate").asObject(),get(payload,"record").asObject())) }
                    catch (e: Exception) { emit(messageId,runId,"error",e.message,JsonNull()) }
                } else if (operation=="validateTemplate" || operation=="runTemplate") {
                    try {
                        let spec=get(payload,"spec").asObject();let caps=get(payload,"capabilities").asObject()
                        let validation=validateTemplate(spec,caps)
                        if (operation=="validateTemplate") { emit(messageId,runId,"completed","OK",validation);return }
                        if (!flag(validation,"valid")) { emit(messageId,runId,"error","INVALID_TEMPLATE",validation);return }
                        if (usedRuns.contains(runId)) { emit(messageId,runId,"error","RUN_ID_REUSED",JsonNull());return }
                        if (usedRuns.size>=256) { emit(messageId,runId,"error","RUN_BUDGET_EXCEEDED",JsonNull());return }
                        if (experiment.isSome() && experiment.getOrThrow().state=="running") { emit(messageId,runId,"error","CORE_BUSY",JsonNull());return }
                        authorizeRun(payload)
                        let run=RunState(runId,spec,textField(get(payload,"scope").asObject(),"kind"));experiment=Some(run);usedRuns.add(runId)
                        let result=run.dispatch();requests.clear();replies.clear();requests.add(key,line);replies.add(key,result)
                        emit(messageId,runId,"completed","OK",result)
                    } catch (e: Exception) { emit(messageId,runId,"error",e.message,JsonNull()) }
                } else if (operation == "wait") {
                    waitingMessage = messageId
                    waitingRun = runId
                    emit(messageId, runId, "running", "WAITING", JsonNull())
                } else if (operation == "echo") {
                    emit(messageId, runId, "completed", "OK", payload)
                } else {
                    emit(messageId, runId, "error", "UNKNOWN_OPERATION", JsonNull())
                }
            } else {
                emit(messageId, runId, "error", "UNKNOWN_KIND", JsonNull())
            }
        } catch (_: Exception) {
            emit(messageId, runId, "error", "INVALID_MESSAGE", JsonNull())
        }
    }
}
