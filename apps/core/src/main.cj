package verification_core

import std.env.*

main(): Int64 {
    getStdErr().writeln("protocol ready: schema v1; interpreter 1.0.0; observation validation")
    getStdErr().flush()
    let protocol = Protocol()
    while (true) {
        let line = getStdIn().readln()
        if (line.isNone()) { break }
        protocol.handle(line.getOrThrow())
    }
    return 0
}
