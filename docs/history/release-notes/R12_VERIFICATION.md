> **Historical / superseded by r13.** Current behavior and acceptance evidence: `R13_FIX_BRIDGE.md` and `R13_VERIFICATION.md`.

# r12 — Verification Status

Date: 2026-10-02

## Confirmed in this build environment
- archive/source static sanity: PASS;
- targeted strict TypeScript check for `fix-workflow.ts`: PASS;
- runtime adversarial suite: 12/12 PASS after the r12 hardening;
- source-pack secret filtering: PASS for `.env`, credential-named config, literal password and cleartext credential-bearing DB URL cases used in the regression suite;
- source-manifest membership lock: PASS (`replace` cannot target a secret/excluded file that was not exported);
- create source allowlist: PASS;
- isolated verification side-effect containment: PASS;
- changed `package.json` does not auto-execute its new scripts: PASS;
- backup payload corruption rejection: PASS;
- backup-manifest SHA-256 rejection: PASS;
- persistent/resumable rollback: PASS;
- nested created-directory cleanup on rollback: PASS;
- stale source/workspace, path traversal, symlink-routed target and Windows-unsafe path rejection: PASS;
- Windows package invocation contract uses `cmd.exe /d /s /c <manager>.cmd run <script>`: PASS by direct invocation-contract test;
- ZIP64 rejection and ordinary STORE/DEFLATE compatibility: PASS;
- simulated post-commit old-file cleanup failure: PASS — warning only, committed file remains hash-confirmed, normal rollback succeeds;
- simulated partial apply + concurrent external edit: PASS — external edit preserved and `EMERGENCY_ROLLBACK_INCOMPLETE` reported instead of destructive/false rollback;
- extended secret matrix: PASS — 8 credential/literal formats excluded while 3 environment/placeholder forms remained exportable.

## Re-audit verdict in this environment
No reproduced r11 P1/P2 Fix Bridge defect remains after the r12 changes and the same adversarial scenarios were rerun.

## Not claimed here
- full `npm ci` could not complete because dependency retrieval stalled in this container;
- therefore full `npm test`, production Vite/tsup build and complete `npm run selftest` remain **NOT VERIFIED in this container**;
- this container uses Node.js 22.16.0 while the package correctly requires Node.js 22.19+ because of Lighthouse 13.5.0;
- native Windows runtime/process-tree behavior remains **NOT VERIFIED on Windows** until `RUN.bat` / `VERIFY.bat` succeeds on the target Windows machine.

No missing execution is represented as PASS.

Detailed adversarial re-audit: `R12_REAUDIT.md`.
