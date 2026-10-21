# Visual QA Browser v1.1.9 r21 — Independent Agent Audit Handoff

Audit the extracted package itself. Do not trust README, manifest, provenance or embedded PASS claims without reproducing them.

## Required target
- Windows 10/11 x64
- Node.js >=22.19.0
- clean extraction into a new folder
- network available for `npm ci` and Playwright Chromium installation

## Mandatory verification sequence
1. Verify ZIP/extracted exact-set integrity against `PACKAGE_MANIFEST.sha256` and `PACKAGE_PROVENANCE.json`.
2. Run `RUN.bat` from a clean extraction. It must install when needed, fully verify, then start.
3. Require PASS for TypeScript, Vitest, build, package integrity before/after tests, production server smoke and rendered Chromium UI smoke.
4. During a real PERFORMANCE run, cancel while Lighthouse is measuring. The cancel API/UI must remain responsive and the job must become CANCELLED without restarting Visual QA Browser.
5. Re-run a fresh audit immediately after cancellation to prove scheduler recovery.
6. Check Task Manager/process inventory: no orphaned Lighthouse worker/Chrome process tree may remain. Also exercise `STOP.bat` during an active Lighthouse run and verify it kills only the validated owned backend tree plus descendants.

## r21 priority targets
- Lighthouse must execute outside the control-plane Node process through `lighthouse-worker-entry`.
- Parent heartbeat watchdog must terminate an unresponsive worker even if the worker event loop is wedged.
- Cancel API acknowledgement must be prompt; scheduler release must wait for bounded worker reap. PID-scoped process-tree termination is required; generic `taskkill /IM node.exe` or Chrome killing is forbidden.
- A hard Lighthouse run timeout must fail fast rather than perform two additional doomed 120-second runs.
- Skipped timeout runs must be accounted for in weighted progress; the audit must proceed to report generation.
- Cancel UI uses a bounded request with one retry and distinguishes acknowledged cancellation from backend unavailability.
- Retain all r20 adversarial guarantees: Safe Mode read-only allowlist, special-use network blocking, destructive GET/HEAD filtering, CAND/verdict separation, dynamic lazy-load completeness, evidence schema v3 and external redaction.
- Fix Bridge must remain non-executing before mutation, hash/binding constrained, path-safe, rollback-safe and fail closed on concurrent edits.

## Acceptance
Accept only if all mandatory checks actually run and pass. Anything unexecuted is NOT VERIFIED. A cancellation that requires killing/restarting the whole application is a release blocker.
