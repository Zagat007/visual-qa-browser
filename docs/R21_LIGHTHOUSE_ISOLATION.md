# r21 — Lighthouse isolation and cancellation hardening

Visual QA Browser v1.1.9 / r21 fixes a reproduced Windows failure mode from r20: the audit could remain at `Lighthouse performance` for many minutes and the UI cancellation request could fail because Lighthouse executed inside the same Node.js process that served the control-plane HTTP API.

## Root cause

`runPerformanceAudit()` executed the Lighthouse library directly in the backend process. In-process `AbortSignal` and Chrome cleanup are useful but cannot guarantee control-plane responsiveness if Lighthouse or a dependency wedges the backend event loop. In that state `/api/audits/:id/cancel` can become unreachable, so the user cannot recover from the UI.

## r21 architecture

- Public `runPerformanceAudit()` now runs Lighthouse in an isolated Node child process.
- Production builds create `dist/server/lighthouse-worker-entry.js` as a separate server entry.
- The worker owns Lighthouse, its temporary Chrome and the Safe Mode measurement lifecycle.
- Progress/result messages cross a bounded IPC protocol; the target URL is never written to public checkpoint state.
- The cancel API acknowledges the user immediately, while the audit runner waits for the owned Lighthouse worker to exit or be hard-killed before releasing the scheduler slot.
- On Windows the parent uses PID-scoped `taskkill /T /F`; it never kills arbitrary `node.exe` or Chrome instances.
- The parent has an independent 45-second worker-heartbeat watchdog plus a total external deadline. These timers live outside the Lighthouse process, so they still fire if the worker event loop is wedged.
- A hard per-run Lighthouse timeout fails fast after the first timeout. Three trustworthy cold runs are then impossible, so two more identical long timeouts are not performed.
- Weighted progress explicitly accounts for intentionally skipped Lighthouse runs and continues to report generation instead of remaining near 96%.
- Job cancellation publishes `cancelling` immediately before runner cleanup. The frontend retries the bounded cancel request once and reports when the backend itself is unreachable. `STOP.bat` also validates PID + installation instanceId before terminating that owned backend process tree, so an emergency stop cannot leave its Lighthouse/Chrome descendants running.

## Regression coverage added

- `tests/performance-isolation.test.ts`: a fixture intentionally infinite-loops inside the child worker; cancellation must remain bounded and the recorded worker PID must actually disappear after process-tree reap.
- Existing Lighthouse lifecycle tests continue against `runPerformanceAuditInProcess()` to verify Safe Mode, cold-run correctness, cleanup and sanity logic independently of the process boundary.
- Timeout lifecycle expectation is updated for fail-fast behavior: one timed-out run is sufficient to make the 3/3 release verdict impossible.
- `tests/job-manager.test.ts` verifies the cancel command is acknowledged before a deliberately slow runner finishes cleanup, while scheduler release waits for terminal cancellation.
- Static sanity requires the worker entry, dual-entry server build, process isolation, heartbeat watchdog, PID-scoped tree termination, emergency STOP tree cleanup and current cancellation UI behavior.

## Verification boundary

This environment cannot claim Windows runtime PASS unless the clean extracted package completes `RUN.bat` / `VERIFY.bat` on Windows with Node.js >=22.19.0. In particular, verify a real cancellation during Lighthouse and verify there are no orphaned Node/Chrome processes afterwards.
