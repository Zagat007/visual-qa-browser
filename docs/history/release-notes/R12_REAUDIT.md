> **Historical / superseded by r13.** Current behavior and acceptance evidence: `R13_FIX_BRIDGE.md` and `R13_VERIFICATION.md`.

# r12 — Deep Re-Audit / Fix Bridge Acceptance Gate

Date: 2026-10-02

## Scope
Independent re-audit after remediation of the rejected r11 ChatGPT Fix Bridge. The audit targeted package integrity, source-export privacy, manifest/ZIP parsing, filesystem escape, stale-source protection, isolated verification, Windows invocation contracts, atomic apply, backup integrity, emergency rollback, persistent rollback, UI/API consistency, regression blast radius, documentation claims and package provenance.

## r11 defects re-tested after remediation
1. Credential/secret leakage through generic config files — CLOSED in the tested matrix.
2. False emergency-rollback claim after post-commit cleanup failure — CLOSED; committed content stays hash-confirmed and the cleanup failure is only a warning.
3. Windows `.cmd` invocation with `shell:false` — CLOSED; npm/pnpm/yarn route through `cmd.exe`, Bun uses `bun.exe` through `cmd.exe`.
4. Modified `package.json` injecting a verification script — CLOSED; package metadata changes are `NOT_VERIFIED` and their new scripts are never auto-executed.
5. Verification side effects contaminating the working project — CLOSED for ordinary working-tree side effects; scripts run in a disposable project copy before mutation.
6. Corrupted backup payload accepted by rollback — CLOSED; original payload SHA-256 is mandatory and verified before rollback writes.
7. Rollback unavailable after UI/app restart — CLOSED; backups are discovered persistently by project root.
8. Created empty directories left after rollback — CLOSED for directories recorded as created by the fix and still empty.
9. Documentation claiming the old post-apply verification flow — CLOSED; r11 documents are explicitly historical and r12 docs are authoritative.

## Additional defects found and closed during the r12 re-audit
- `FAILED` isolated precheck still allowed mutation — CLOSED; `PRECHECK_FAILED` aborts before backup/write.
- A returned package could target a secret/excluded file if its hash was guessed — CLOSED; `replace` is restricted to files present in the exported workspace manifest.
- Arbitrary binary creation was possible through `create` — CLOSED; create is restricted to supported source files and size limits.
- Emergency rollback could overwrite a concurrent external edit — CLOSED; a third hash is preserved and reported as `EMERGENCY_ROLLBACK_INCOMPLETE`.
- Generic unquoted YAML/INI/properties credentials were not detected — CLOSED in the tested high-confidence key/value matrix, including AWS credential keys.
- Case-only operation IDs could collide in Windows backup filenames — CLOSED; operation IDs and archive entries are unique case-insensitively.
- Windows reserved operation IDs such as `CON` could create invalid backup names — CLOSED at manifest validation.
- Bun Windows verification incorrectly assumed `bun.cmd` — CLOSED; `bun.exe` is used.
- Changing the selected project did not clear the previously selected Fix Package — CLOSED in the UI state guardrail.
- Backup-ID collision handling now uses exclusive directory creation with retry; partial directory creation is cleaned before failure.

## Runtime / fault-injection evidence in this environment
- Core adversarial runtime suite: **12/12 PASS**.
- Extended secret matrix: **PASS** — 8 literal/credential cases excluded, 3 environment/placeholder forms retained.
- Simulated post-commit `.vqb-old-*` cleanup failure: **PASS** — warning + confirmed new hash + normal rollback.
- Simulated partial apply + concurrent external edit: **PASS** — external edit preserved, incomplete emergency rollback reported truthfully.
- Case-insensitive operation-ID collision: **PASS**.
- Standard DEFLATE ZIP + directory entry: **PASS**.
- ZIP traversal: **REJECTED as expected**.
- ZIP CRC corruption: **REJECTED as expected**.
- ZIP64 sentinel: **REJECTED as expected**.
- Windows npm and Bun invocation construction: **PASS by direct contract test**.

## Static / type evidence
- `STATIC_SANITY PASS` — 91/91 required source files; 80 TS/TSX source imports checked and declared.
- `fix-workflow.ts` targeted strict TypeScript compilation: **PASS**.
- Changed TS/TSX syntax/transpile checks: **PASS** for backend Fix Bridge, backend API integration, frontend App/types and Fix Bridge regression test source.
- Regression comparison to r10 code scope: 84 code files unchanged, 7 changed, 2 added, 0 removed. The changes remain localized to Fix Bridge integration, supporting static/provenance checks and their UI/docs.

## Explicit non-claims
- Full `npm ci` could not complete in this container because dependency retrieval stalled.
- Consequently full repository `npm run typecheck`, Vitest suite, production Vite/tsup build and `npm run selftest` are **NOT VERIFIED in this container**.
- This container has Node.js 22.16.0; the project correctly requires Node.js >=22.19.0 because Lighthouse 13.5.0.
- Native Windows process/runtime behavior is **NOT VERIFIED here**. `RUN.bat` / `VERIFY.bat` on the user's Windows machine remains the final runtime gate.
- The disposable verification copy protects the working tree from ordinary test/build side effects; it is **not an OS sandbox**. Trusted Fix Packages only.

## Verdict
Within the executable/static scope available in this environment, the previously reproduced r11 Fix Bridge P1/P2 defects and the additional r12 defects found during the re-audit are closed. No reproduced P1/P2 Fix Bridge defect remains in this scope. Overall Windows runtime acceptance remains **NOT VERIFIED** until the target Windows `RUN.bat` / `VERIFY.bat` gate completes successfully.
