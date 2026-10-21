# Visual QA Browser v1.1.6 r18 — Independent Audit Handoff

## Target
Audit the extracted package as untrusted code. Primary target: Windows 10/11 x64, Node.js >=22.19.0. Do not inherit prior PASS claims.

## r18 changes that require adversarial verification

- Mobile Fix Bridge header no longer collapses into a narrow column at 320–390 px.
- Readability pass raises low-contrast muted text and key descriptive microcopy without changing audit semantics.
1. Scenario assertions: hidden/opacity-zero elements must never PASS; a selector that is initially absent may appear within the bounded 3-second window; visibility/text assertions wait up to 3 seconds; selectors must ultimately resolve to exactly one element.
2. Visual regression: only complete PASS/ISSUE audits may become baselines. PARTIAL/NOT_VERIFIED must be rejected by UI and backend.
3. Long-page comparison: screenshot comparison is chunked up to the explicit safety ceiling; very large captures may omit a monolithic diff image but must still produce a truthful ratio/status rather than a false NOT_COMPARABLE caused by the old 20M limit.
4. Package integrity: VERIFY must never mutate PACKAGE_PROVENANCE.json or invalidate PACKAGE_MANIFEST.sha256. Integrity is checked before and after selftest/runtime smoke.
5. Frontend publishing: /FUNCTIONS_RU.txt must be a real text asset in dist/frontend, not the SPA fallback HTML.
6. Capabilities API must advertise visual regression/safe journeys as supported and must not list VISUAL_REGRESSION under unsupported.
7. Premium UI: main setup, Command Center, history, visual regression, safe scenarios and Fix Bridge must form one coherent responsive design system. Russian tooltips must explain major modules without requiring external documentation. Microcopy must remain readable; decorative 7–8 px UI text is not accepted.
8. Windows preflight failures must be written to final-verification.log.

## Non-negotiable truth rules
- NO EVIDENCE -> NO PASS.
- NOT RUN != PASS.
- PARTIAL != baseline-worthy complete evidence.
- Pixel difference is REVIEW candidate, never automatic BUG.
- Art Direction is advisory and cannot change technical verdict.
- Fix Bridge must not execute project scripts/source automatically.

## Required audit passes
A. Archive/package integrity and provenance.
B. npm lock/install determinism.
C. TypeScript strict typecheck and build.
D. Full test suite, including new regression tests.
E. Production backend + rendered Chromium smoke.
F. Scenario false-PASS adversarial cases.
G. Long-page visual-regression cases.
H. Windows BAT ownership/preflight/logging behavior.
I. UI responsive review at desktop 1440, tablet 834/768, mobile 430/390/320.
J. Documentation/API/UI contradiction scan.

## Verdict
Use PASS only for reproduced evidence. Otherwise use ISSUE / PARTIAL / NOT_VERIFIED with the exact unverified surface.
