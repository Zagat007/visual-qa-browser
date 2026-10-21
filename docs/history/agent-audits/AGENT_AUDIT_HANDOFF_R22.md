# Visual QA Browser v1.1.9 r22 — Independent Agent Audit Handoff

## Scope
r22 is a startup-wrapper hardening release on top of r21 Lighthouse isolation.

## Reproduced defect to verify
On a clean extracted r21 package, launching `START.bat` before `RUN.bat` could stop with:
`Application is not built. Run VERIFY.bat or INSTALL.bat first.`

## Required verification
1. Use a brand-new extracted folder with no `dist` and no `node_modules`.
2. Launch `START.bat` directly.
3. Verify it delegates once to `RUN.bat`, installs/builds/verifies, and opens the app.
4. Verify the recursion guard prevents START/RUN loops if build output is absent after bootstrap.
5. Verify a second `START.bat` launch takes the fast path.
6. Re-run r21 cancellation/Lighthouse isolation tests.
7. Verify package integrity before and after build; derived `dist`, logs, checkpoints and node_modules are excluded from immutable source provenance by design.

Do not count static inspection as Windows runtime PASS. Anything not executed is NOT VERIFIED.
