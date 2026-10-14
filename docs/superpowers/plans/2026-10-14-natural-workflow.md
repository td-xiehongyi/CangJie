# Natural Workflow Implementation Plan

> Execute inline using superpowers:executing-plans and test-driven-development. User authorized implementation on 2026-10-14. No commits or publication are authorized.

**Goal:** Implement the accepted natural workflow across the existing four pages.
**Architecture:** Host owns per-project workflow drafts and actual preparation history. UI restores version-bound selections, presents one shared journey, and returns from settings without triggering work automatically.
**Tech Stack:** Node24, Express/TypeScript, React/Vite, node:test, Edge/Playwright.
**Spec:** ../specs/2026-10-14-natural-workflow-design.md

## Constraints and rulings

- Preserve current dirty work. Work in the authorized current checkout; a clean HEAD worktree would omit the UI and host updates this change builds upon. Before-images are in output/natural-workflow/before.
- Do not change budgets, verdict semantics, candidate qualification or double-review requirements.
- Persist no secrets, double-review checkboxes or new outbound consent in workflow drafts.
- Draft writes use revision checks; stale rule/template/environment confirmations become unconfirmed.
- Keep old state readable. Preparation consent is not preparation success.
- Windows folder picker is host-authenticated, single-instance, cancellable; unavailable systems retain paste-path input.
- Tests use isolated data and deterministic providers. Original formal acceptance and live model checks remain open.

## Tasks

- [x] A. Host workflow: test draft persistence/restart, revision conflicts, stale binding reset, secret rejection, preparation success/failure persistence; implement projects/workflow.ts and API integration; verify node:test.
- [x] B. Navigation and task state: browser tests first for empty-library guidance, settings return, refresh/project/flow restoration, preparation state, completion CTA; implement shared journey and draft hook, project/settings/verify changes and folder picker; verify build and focused browser tests.
- [x] C. Review and results: test evidence order, role boundaries, changed-material invalidation, successful/failed/unknown/observe reports and percentage conversion; implement summaries, action hierarchy and load modes; verify focused suites.
- [x] D. Accessibility and delivery: manage focus/tabs, compress spacing, verify 1280/768/390 and zoom, full tests and build, fresh review and fix findings; update evidence and project archive. Native picker clicks and complete keyboard/screen-reader acceptance remain explicitly unverified.

## Review Focus

Multi-tab stale writes must preserve local input; polling must not replace edits. A stopped or incomplete run cannot appear passed. Retired template versions cannot be silently replaced. Run completion must not leave repeat-run CTA primary. Report plan evidence must remain tied to the historical run. Folder chooser must not launch an unseen orphan dialog or accept remote-origin commands.

## Verification

Targeted commands are recorded in output/natural-workflow/progress.md. Final: npm test, npm run check, all browser specs. Restore any legacy evidence files rewritten by existing tests from verified before-images, preserving new evidence separately.

Final evidence: npm test 259/259; npm run check passed; Edge/Playwright 15/15; git diff --check passed. See docs/evidence/natural-workflow.md. No commit, push, formal acceptance-copy replacement or ZIP publication.
