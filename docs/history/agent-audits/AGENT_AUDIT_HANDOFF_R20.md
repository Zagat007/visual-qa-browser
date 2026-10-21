# Visual QA Browser v1.1.8 r20 — Independent Agent Audit Handoff

Audit the extracted package itself. Do not trust README, manifest, provenance or embedded PASS claims without reproducing them.

## Required target
- Windows 10/11 x64
- Node.js >=22.19.0
- clean extraction into a new folder
- network available for `npm ci` and Playwright Chromium installation

## Mandatory verification sequence
1. Verify ZIP/extracted file integrity against `PACKAGE_MANIFEST.sha256` and `PACKAGE_PROVENANCE.json`.
2. Run `RUN.bat` from a clean extraction. It must perform install if needed, then full verification before startup.
3. Require PASS for TypeScript, Vitest, build, package integrity before/after tests, production server smoke and rendered Chromium UI smoke.
4. Run targeted adversarial checks below; do not weaken tests to obtain PASS.

## r20 adversarial targets
- Safe Mode must reject private/special-use IPv4/IPv6 and non-read-only HTTP methods such as PROPFIND/MOVE/MKCOL.
- GET/HEAD destructive URLs (`logout.php`, `delete-account`, action=cancel-order) must be blocked; safe history/help pages must remain allowed.
- `clipping-candidate` and `small-control-target` must remain candidates and must not create target ISSUE by themselves.
- checkbox/radio associated labels count only when they are actually clickable; `pointer-events:none` must not enlarge the effective target.
- dynamic/infinite lazy content must never receive successful warmup merely because the initial document height was finite.
- `gpt-evidence.zip` manifest schema must be v3 and distinguish exact responsive proof from full-page/section context.
- prompts/registries intended for external GPT upload must strip arbitrary URL query/hash values and known secrets.
- visual baseline comparison must compile and execute; there must be exactly one comparison page instance per comparison browser context.
- Fix Bridge must remain non-executing before mutation, hash/binding constrained, path-safe, rollback-safe and fail closed on concurrent edits.

## Acceptance
Accept only if all mandatory verification passes and no new reproducible P0/P1 or significant P2 defect is found. Any unexecuted check is NOT VERIFIED, never PASS.
