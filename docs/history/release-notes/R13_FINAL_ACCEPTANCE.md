# Historical r13 acceptance claim (superseded)

This document records the originating r13 claims only. An independent r13 audit subsequently reproduced P1/P2 defects. Current release acceptance is defined by [R21_LIGHTHOUSE_ISOLATION.md](R21_LIGHTHOUSE_ISOLATION.md) and `AGENT_AUDIT_HANDOFF_R21.md`.

# Visual QA Browser v1.1.1 — r13 HARDENED Final Acceptance

Date: 2026-10-02

## Verdict
Within the executable/static scope available in this container, all defects reproduced during the r12/r13 remediation cycles are closed. No remaining P1/P2 Fix Bridge defect was reproduced by the final repeated adversarial audit.

Native Windows runtime acceptance remains NOT VERIFIED until `RUN.bat` / `VERIFY.bat` succeeds on the target Windows machine with Node.js >=22.19.0 and a complete dependency installation.

## Newly closed in the second remediation cycle
- Arbitrary URL query/hash values in `audit-job.json` and external textual evidence are removed before external export.
- Secret-like external JSON fields are redacted.
- Nested `gpt-evidence.zip` text/JSON is re-sanitized before source-aware Fix Pack export.
- Legacy standalone `gpt-fix-prompt.txt`, `defects.json`, `candidates.json`, `root-causes.json` and `gpt-evidence.zip` use the same conservative external-evidence privacy boundary.
- Fix Bridge no longer auto-runs project scripts or source code. A copied project directory is not treated as an OS sandbox.
- Structural non-executing precheck blocks invalid JSON before any backup/write.
- Large locally generated evidence has a separate bounded parser limit; strict returned Fix Package limits remain unchanged.
- High-confidence hard-coded URL token/basic-auth/Authorization/Cookie/session patterns are filtered from source export.

## Final repeated evidence from the unpacked release ZIP
- ZIP integrity: PASS.
- Internal `PACKAGE_MANIFEST.sha256`: PASS.
- `STATIC_SANITY`: PASS — 91/91 required source files; 80 TS/TSX import checks.
- TS/TSX syntax transpilation: PASS — 80 files.
- JS/MJS syntax: PASS.
- Fix Bridge adversarial runtime suite: 12/12 PASS.
- Standard DEFLATE compatibility: PASS.
- ZIP traversal rejection: PASS.
- ZIP64 rejection: PASS.
- CRC corruption rejection: PASS.
- Post-commit Windows-like cleanup fault injection: PASS.
- Concurrent external edit during emergency recovery: PASS; external bytes preserved and incomplete recovery reported truthfully.
- Standalone GPT privacy runtime regression: PASS.
- Release hygiene: no `node_modules`, `dist`, reports, checkpoints, fix-backups or symlinks in the final release.
- Canonical provenance recomputation: PASS.
- Windows bootstrap/package contract (`RUN/INSTALL/VERIFY/START/STOP/DIAGNOSE`, package files): unchanged from the previously audited r12 base.

## Provenance
- Source file count: 134.
- Source tree SHA-256: `437bdd8983d29eef67cd3f0fb35efbfd213c5fb97199263bf4c01f4d9c2fe8f3`.
- Release ZIP SHA-256: `c31b64d07f0e5a1d22d3b54443cd3ea02b47b8fff6bdf4ca8d43b2271e878aab`.

## Change blast radius vs pristine r12
Application/test/script code changes are limited to the Fix Bridge/privacy/reporting/UI guardrail and their regression tests. No code files were removed. Windows bootstrap scripts and package/lock/TypeScript/Vitest configuration remain byte-identical to the r12 base.

## Explicitly NOT VERIFIED here
- fresh complete `npm ci` — dependency transport timed out in this environment;
- full strict project typecheck with installed package type definitions;
- full Vitest suite;
- production Vite/tsup build;
- browser/runtime smoke;
- native Windows execution.

The final target-machine gate is a clean-folder `RUN.bat` / `VERIFY.bat`. A failure there must remain a failure and must not be overridden by this source/adversarial acceptance evidence.
