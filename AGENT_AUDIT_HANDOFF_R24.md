# Visual QA Browser v1.1.9 r24 — Independent Agent Audit Handoff

## Trigger

Windows r23 VERIFY reached Vitest after strict TypeScript passed. Exactly one test failed: `tests/performance-browser.test.ts`, because three Lighthouse runs completed but the parent-process fixture counter stayed at zero.

## Root cause to verify

Production Lighthouse isolation introduced in r21 creates a real process boundary. Parent Vitest spies cannot observe browser/network calls executed in that child process. The product isolation must remain intact; the integration test must execute the real Lighthouse core in-process through an explicit dependency seam.

## Required checks

1. Confirm `runAudit()` defaults to isolated `runPerformanceAudit` when no dependency is supplied.
2. Confirm the real-Lighthouse browser test injects `runPerformanceAuditInProcess` and retains `fixtureRequests >= 3`, three cold runs, PASS/valid-run assertions, report files, progress assertions, and cancellation coverage.
3. Confirm `tests/performance-isolation.test.ts` still tests the production child-process wrapper and hard-wedged-worker reaping.
4. Run `npm run typecheck` and full `npm test`; do not substitute AST parsing.
5. Run build and runtime verification on Windows.
6. Re-run the original Lighthouse hang/cancel scenario from r21.

Do not weaken assertions, skip the real Lighthouse test, disable Safe Mode, or route production through the in-process test runner.
