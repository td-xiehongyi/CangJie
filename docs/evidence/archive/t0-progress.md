# T0 ledger — plan: docs/superpowers/plans/2026-10-11-website-verification.md

Scope: user authorized T0 only, 2026-10-12. No T1 implementation, commits or publishing.

- Ruling: the current directory is not a Git repository (verified with discovery ceiling at Desktop); implement the planned new paths in place, preserve existing files, and do not initialize Git merely to support skill helper scripts. This ledger substitutes for Git-dependent task helpers.
- Pre-flight: T0 produces the versioned Envelope/CoreClient transport consumed by T1; T0 does not implement business verdicts. JSON schema/business semantics remain T1.
- Ruling: use the official Windows x64 1.0.5 ZIP in .local-tools with a verified SHA-256 and child-process environment; no global PATH modification. Node 24 is already present. k6 and Playwright are discovery-only in T0, runtime acceptance remains T8/T6.
- Latest UI baseline: output/ui-preview-final, six sources bound to qa/defect-fixes/source-verification.json; no preview modifications authorized or needed in T0.
- Initial network checks: Windows TLS failed inside the sandbox; Node direct official-site fetch was blocked by EACCES. Approved escalation can read the official SDK endpoint. npm uses project-local cache because the global cache is not writable.
- RED: six protocol tests failed with the explicit missing compiled CoreClient assertion, before implementation.
- SDK: official ZIP checksum matched; cjc/cjpm 1.0.5 both ran. stdx 1.0.5.1 fetched from the official release, checksum pinned locally. Real compile initially hit sandbox opt.exe execution denial; approved build succeeded. A later linker output permission failure was transient; no target process remained during inspection and subsequent sequential builds passed. Exact transient cause unconfirmed.
- GREEN: real core passed original six tests; additional path/exit/framing/unknown-operation checks passed. Updated deprecated Console APIs to std.env and rebuilt without warnings.
- Fresh review (t0_review): found request/response size asymmetry. Reproduced with a near-limit request failing Protocol output exceeds 1 MiB; fixed request 1 MiB vs response-frame 8 MiB, with per-frame rather than aggregate-chunk checking. Added near-limit, oversized input/output and multiple large event checks; full suite passed.
- Ruling: T0 only establishes npm package entry and explicitly rejects packaging until T9; it does not produce a misleading product release artifact. UI workspace and business contracts remain their planned stages.
- Task T0: complete — npm run check, npm run verify -- protocol, and npm test passed; final complete suite 14 pass / 0 fail / 0 skipped. Logs in docs/evidence/t0-check.log and t0-tests.log. Real request/event transcript and unchanged preview hashes saved. No commit; no Git repository.
- Next: T1 remains unstarted and outside this turn's authorization. k6 runtime is T8, Playwright UI runtime is T6. Stop at T0 as requested.
