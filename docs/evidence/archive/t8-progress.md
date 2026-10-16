# T8 execution ledger

Plan: docs/superpowers/plans/2026-10-11-website-verification.md, T8 only.

- Scope authorized by user: 完成T8. T9/T10 and T4 live-model acceptance remain outside this change.
- Preflight: Node 24.19.0; existing local Cangjie toolchain. k6 absent from PATH. Official k6 v2.3.0 Windows AMD64 asset identified; SHA256 112276d495e5741c968e2bc09ea6196099c1275bd6db9ee0875d173c7148ce43.
- Ruling: this folder is an existing non-Git project; preserve it in place, no git initialization/commit/worktree.
- Ruling: reuse published declarative checks through the existing Cangjie interpreter. k6 schedules fixed-rate business experiments through a loopback execution bridge, which measures and discloses host/core overhead. This is instrumented local capacity, not direct production endpoint benchmarking.
- Dependency check: T6 supplies source run + exact selected checks + mapping; T5 supplies current qualification; T2 supplies one isolated synthetic-data environment. Load iterations must not call per-experiment reset. T8 records separate immutable load reports with a source run link.
- Task T8: complete. Full suite 235/235; final scoped load suite 14/14; Edge existing 5 + new T8 1 passed; final API 6/6; full build and final host compilation passed.
- Ruling: R47 keeps five technical budgets in server-owned LOAD_PRESET, displayed together with business-target confirmation.
- Ruling: T7 historical protocol checksum remains verified after stripping only the exact independent loadDecision routing extension. No template/expression/private-answer changes.
- Review fixes: concurrent start race reproduced as two 202 responses; now exactly one starts. Browser polling shutdown fixed after settlement. Completed environment state and query execution time are retained.
- Evidence: docs/evidence/target-load.md and t8-summary.json. Open: T4 live model/formal review, T9/T10. No commit, push or publication.
