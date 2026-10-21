> **HISTORICAL r13 SNAPSHOT.** Superseded by later remediation. Current acceptance scope: `docs/R21_LIGHTHOUSE_ISOLATION.md`.

# r13 — Deep Re-Audit / Acceptance Gate

Date: 2026-10-02

## Scope
Independent repeat audit after r12. Coverage: Fix Pack external-data minimization, source-secret filtering, nested evidence ZIP handling, manifest/fingerprint/hash locking, mutation vocabulary, path/symlink/Windows filename defenses, non-executing precheck, atomic apply, backup integrity, persistent rollback, ZIP corruption/ZIP64/DEFLATE handling, UI/documentation claims, package provenance and final archive integrity.

## Newly reproduced r12 defects and r13 outcome
1. **P1 privacy — audit-job / URL query leakage:** CLOSED. Exported job metadata is allowlisted; all external textual URLs lose query/hash; secret-like JSON keys are redacted; nested evidence text/JSON is sanitized again.
2. **P1 trust boundary — copied-workspace verification executed project code:** CLOSED architecturally. Fix Bridge no longer runs project scripts or source code automatically.
3. **P2 compatibility — evidence PNG >12 MiB could be rejected by the Fix Package parser limit:** CLOSED with a separate bounded local-evidence parsing limit (48 MiB/entry, 60 MiB uncompressed total). Inbound returned Fix Packages keep strict 12 MiB/entry limits.
4. **P2 privacy depth — hard-coded token/basic-auth/authorization patterns in source snapshot:** CLOSED for the added high-confidence patterns.
5. **P1 privacy bypass — legacy standalone GPT handoff could bypass Fix Pack redaction:** CLOSED. The report writer now applies the same conservative external-evidence URL/text redaction before writing copyable prompts, defect/candidate/root-cause JSON and `gpt-evidence.zip`.

## Repeat executable/static evidence in this environment
- `STATIC_SANITY`: PASS (91/91 required source files; 80 TS/TSX import checks).
- TypeScript/TSX syntax transpilation using TypeScript 5.8.3: PASS for 80 files.
- Fix Bridge adversarial runtime suite after final privacy hardening: **12/12 PASS**.
- External export query/hash + nested JSON secret redaction: PASS.
- Source secret matrix (URL token, basic auth URL, Authorization literal): PASS.
- Large 13 MiB local evidence export: PASS.
- Project scripts do not auto-execute: PASS.
- Invalid JSON structural precheck blocks before backup/write: PASS.
- Stale/traversal/protected/unexported/binary-create defenses: PASS.
- Case-insensitive operation-ID collision and Windows reserved target defenses: PASS.
- Symlink escape: PASS.
- Corrupt backup rejection: PASS.
- Persistent rollback discovery/marker: PASS.
- ZIP64 rejection: PASS.
- CRC corruption rejection: PASS.
- Standard DEFLATE ZIP parsing: PASS.
- ZIP traversal rejection: PASS.
- Standalone GPT artifact runtime privacy regression (target/page/network query + hash secrets): PASS.
- Windows-like post-commit cleanup fault injection: PASS — commit remains valid with warning and normal rollback restores the original.
- Emergency rollback with a concurrent external edit: PASS — external bytes are preserved and incomplete recovery is reported truthfully.

## Not claimed
- Full `npm ci` / complete strict project typecheck / Vitest / Vite+tsup build could not be completed in this container because dependency installation hit a transport timeout and this container is Node 22.16.0 while the package runtime floor is Node >=22.19.0.
- Native Windows runtime remains NOT VERIFIED here. `RUN.bat` / `VERIFY.bat` on the target Windows machine remains the final runtime gate.
- Screenshot pixels are not automatically PII-redacted. The user-visible evidence review warning remains applicable.

## Verdict
Within the executable/static scope available here, the newly reproduced r12 P1/P2 defects are closed and the repeat Fix Bridge adversarial suite is clean. Overall product runtime acceptance remains **NOT VERIFIED on Windows** until target-machine `RUN.bat` / `VERIFY.bat` completes.
