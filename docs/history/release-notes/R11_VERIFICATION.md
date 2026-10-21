# HISTORICAL — r11 verification, superseded by r12

These results describe the rejected r11 checkpoint and must not be used as current-package acceptance evidence. Current status: `R12_VERIFICATION.md`.

# r11 — Verification Status

## Confirmed in the current build environment
- `STATIC_SANITY PASS` after the Fix Bridge changes.
- Backend Fix Bridge module: targeted strict TypeScript check PASS.
- Changed TS/TSX files: syntax/transpile checks PASS.
- Source-aware pack runtime: secret/dependency exclusion PASS.
- Apply runtime: full-workspace fingerprint lock + per-file SHA-256 PASS.
- Backup and hash-guarded rollback runtime PASS.
- Stale workspace rejection before writes PASS.
- Standard STORE ZIP PASS.
- Standard DEFLATE ZIP with an ordinary `files/` directory entry PASS.
- ZIP64 sentinel rejection PASS.
- Duplicate operation-id rejection PASS.
- Symlink-routed target rejection PASS.
- Windows-unsafe target-name rejection is covered by the strict path validator and test suite.

## Not claimed in this environment
- Full `npm ci` did not complete because dependency download stalled in this container.
- Full `npm test`, production Vite/tsup build and full `npm run selftest` are therefore **NOT VERIFIED here**.
- This container has Node.js 22.16.0 while the application correctly requires Node.js 22.19+ because of Lighthouse 13.5.0.
- Windows runtime is **NOT VERIFIED here**. `RUN.bat` / `VERIFY.bat` on the target Windows machine remain the final runtime gate.

No missing execution is represented as PASS.
