> **HISTORICAL r13 SNAPSHOT.** Security lineage is retained, but current acceptance is defined by `docs/R21_LIGHTHOUSE_ISOLATION.md`.

# r13 — ChatGPT Fix Bridge: privacy + no-auto-exec hardening

Date: 2026-10-02

## Goal
Preserve the simple workflow **audit → one ZIP to ChatGPT → one ZIP back → safe local apply → post-deploy re-check** while removing two residual trust-boundary risks found after r12.

## r13 root causes closed
1. `audit-job.json` and textual audit artifacts could retain URL query/hash values that were not recognized as named secret parameters. r13 allowlists exported job metadata, strips all query/hash values from external text URLs, redacts secret-like JSON keys, and re-sanitizes text/JSON inside nested `gpt-evidence.zip` before Fix Pack export.
2. A disposable copied project is not an OS sandbox. Existing project `typecheck/lint/test/build` scripts could still execute arbitrary code or write outside the copied tree. r13 removes automatic project-script/source execution from Fix Bridge entirely.
3. The nested evidence sanitizer previously reused the 12 MiB untrusted Fix Package entry limit. r13 gives locally generated evidence a separate bounded 48 MiB per-entry limit so legitimate large PNG evidence is not rejected while inbound Fix Package limits remain strict.
4. Source secret scanning was extended to hard-coded sensitive URL query values, `Authorization` / `Cookie` / session values and basic-auth URLs.
5. The legacy standalone GPT handoff from `report.html` now uses the same conservative external-evidence redaction, so downloading/copying `gpt-fix-prompt.txt`, JSON evidence or `gpt-evidence.zip` cannot bypass the Fix Pack privacy boundary.

## New verification contract
- Before mutation: manifest schema, source snapshot fingerprint, source membership, per-file SHA-256, path/symlink rules and structural non-executing checks.
- Invalid JSON in a changed JSON file returns `FAILED` and blocks all writes.
- Executable/source-code changes return `NOT_VERIFIED` for runtime/build semantics; this is intentional and does not block a trusted minimal fix.
- Fix Bridge never auto-runs package scripts, build tools, tests, linters, config modules or source code.
- Full type/lint/test/build remains a separate trusted verification gate after the fix, not a pretend sandbox.

## Unchanged safety controls
- only `replace` / `create`;
- no delete/rename/shell operations;
- source-membership + fingerprint + before/after SHA-256 locks;
- protected secret paths cannot be targeted;
- ZIP CRC/bounds/path validation;
- symlink and Windows unsafe-name rejection;
- integrity-protected backup;
- persistent/resumable rollback;
- concurrent-edit protection during rollback;
- post-deploy live re-check remains separate from local apply.
