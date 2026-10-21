# r24 — Lighthouse integration-test process-boundary fix

Visual QA Browser v1.1.9 / r24 fixes the next failure reproduced by the real Windows `VERIFY` pipeline after r23 passed strict TypeScript compilation.

## Reproduced failure

`tests/performance-browser.test.ts` completed the FULL STANDARD audit and produced three Lighthouse runs, but `fixtureRequests` remained `0`, causing the test to fail.

## Root cause

Since r21, production Lighthouse runs in an isolated child process so a wedged Lighthouse/Chrome cannot block the HTTP control plane or cancellation endpoint. Vitest spies and mocked Playwright/CDP transport live in the parent test process and do not cross a process boundary. The old real-Lighthouse integration test still expected those parent-process spies to observe the isolated child's network traffic.

The product isolation was correct; the test architecture was stale.

## Fix

The audit orchestrator now has a narrow dependency-injection seam for its performance runner. Production callers omit it and therefore still use the isolated `runPerformanceAudit` wrapper. The real-Lighthouse integration test injects `runPerformanceAuditInProcess`, which is the same real Lighthouse core, so its deterministic Chrome/network spies remain observable.

The assertion `fixtureRequests >= 3` is retained. The test is not weakened or skipped.

`tests/performance-isolation.test.ts` remains responsible for the separate production concern: IPC progress relay, responsive cancellation, hard-kill of a wedged worker, and process reaping.

## Acceptance

A clean Windows extraction must run `START.bat` or `RUN.bat` and complete the full pipeline: package integrity, static sanity, strict TypeScript typecheck, all Vitest tests including the real Lighthouse and isolation suites, build, and runtime smoke. NOT RUN / NOT VERIFIED is never PASS.
