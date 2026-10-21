# VISUAL QA BROWSER v1.1.1 — r13 HARDENED
## Independent Agent Audit Handoff

**Package under audit:** `Visual-QA-Browser-v1.1.1-CHATGPT-FIX-BRIDGE-r13-HARDENED`
**Date:** 2026-10-02
**Primary target OS:** Windows 10/11 x64
**Required runtime:** Node.js `>=22.19.0`
**Package manager:** npm, lockfile is authoritative
**Audit mode:** INDEPENDENT / EVIDENCE-FIRST / DO NOT TRUST PRIOR PASS CLAIMS

---

## 0. PURPOSE OF THIS HANDOFF

This document is the technical source of context for an independent audit agent.

The agent must **not** accept any statement in this package as proof. Existing reports, PASS labels, README text and provenance are hypotheses to reproduce or falsify.

The audit target is a local Windows application named **Visual QA Browser**. It performs evidence-driven website QA using Playwright/Chromium, deterministic collectors, responsive analysis, forms/interactions, accessibility, SEO, passive security, performance and an advisory AI Art Director layer.

r13 additionally contains **ChatGPT Fix Bridge**. This bridge is security-critical because it:

1. exports a source-aware evidence package for ChatGPT;
2. receives a returned ZIP containing bounded file changes;
3. validates it against the original source snapshot;
4. creates an integrity-protected local backup;
5. applies only allowed mutations;
6. supports persistent rollback;
7. deliberately does **not** auto-execute project source/package scripts.

The main goal of this audit is to decide whether the package is technically correct, internally consistent, secure enough for its stated local workflow, and actually runnable on Windows.

---

## 1. NON-NEGOTIABLE AUDIT RULES

Treat these as execution directives:

- **NO EVIDENCE → NO CLAIM.**
- **NOT RUN → NOT VERIFIED.**
- **NO RENDER → NO VISUAL PASS.**
- **ROOT CAUSE BEFORE FIX.**
- **SOURCE OF TRUTH = actual extracted package + runtime behavior.**
- **DO NOT inherit PASS from README, old audit files or prior agent output.**
- **Reproduce important security claims physically whenever possible.**
- **If a check is blocked by environment, report `NOT VERIFIED`, never PASS.**
- **Separate BUG / RISK / CANDIDATE / LIMITATION / EXPECTED BEHAVIOR.**
- **Do not repair during the first audit pass. Record all findings first.**
- **Do not weaken security controls to make tests pass.**
- **Do not delete or rewrite audit evidence.**
- **Any mutation test must use disposable temporary projects, never a real user project.**
- **Every P0/P1/P2 finding must include exact reproduction steps, affected file/function, root cause and expected correction.**

Severity model:

- **P0** — destructive/catastrophic: arbitrary host damage, uncontrolled code execution, unrecoverable project corruption, broad secret exfiltration.
- **P1** — serious: security boundary bypass, false rollback, false PASS, predictable project corruption, meaningful secret leakage, broken Windows primary workflow.
- **P2** — material: correctness/reliability/compatibility defect that can affect normal usage but is contained.
- **P3** — polish/low-risk issue.

---

## 2. WHAT r13 IS SUPPOSED TO DO

### 2.1 Core Visual QA Browser

Existing application scope includes:

- Chromium/Playwright deterministic capture;
- responsive viewport plans and breakpoint continuity checks;
- geometry/overflow/clipping/overlap candidates;
- runtime/network collection;
- safe interaction/form checks;
- axe-core accessibility;
- technical SEO;
- passive security headers/cookie checks;
- guarded Lighthouse performance workflow;
- Russian UI/reporting;
- job progress/cancellation/history;
- deterministic BUG vs CAND separation;
- AI Art Director advisory layer;
- Safe Mode for audited websites;
- local reports/evidence artifacts.

The r13 work must not regress these systems.

### 2.2 ChatGPT Fix Bridge workflow

Expected human workflow:

`website audit → Build Fix Pack for ChatGPT → send one ZIP to ChatGPT → receive VQB-FIX ZIP → Apply Fix → optional Rollback → deploy → live re-check`

Important: **ChatGPT Fix Bridge is not an autonomous coding agent.** Local AI does not receive source write authority.

---

## 3. r13 SECURITY / ARCHITECTURE CONTRACT

The agent must validate every item below independently.

### 3.1 Source export boundary

Fix Pack source export must:

- require an explicit user action;
- require completed audit evidence;
- exclude dependency/build/VCS/report directories;
- exclude `.env` and known key/certificate/private credential files;
- exclude credential/secret configuration names;
- reject or omit high-confidence hard-coded secrets;
- omit unsupported binary/oversized source files;
- record skipped content without leaking the secret itself.

High-confidence secret cases that should be tested:

- `.env`;
- `credentials.json`;
- `secrets.yaml` / `config.yaml`;
- INI/properties/TOML credentials;
- JSON `password`, `token`, `secret`, `apiKey` style keys;
- hard-coded DB URL with username/password;
- Basic Auth URL;
- `Authorization: Bearer ...` literals;
- `Cookie` / session literals;
- sensitive URL query tokens;
- AWS access key / secret patterns.

Safe placeholders must not be over-filtered blindly; e.g. `process.env.API_KEY`, `<TOKEN>`, `YOUR_API_KEY` should remain ordinary source when appropriate.

### 3.2 External evidence privacy boundary

External GPT artifacts must minimize textual secrets:

- audit job metadata is allowlisted, not dumped wholesale;
- URL query and fragment values are removed from external textual artifacts;
- secret-like JSON keys are redacted;
- nested `gpt-evidence.zip` text/JSON is re-sanitized;
- the legacy standalone GPT handoff must use the same privacy rules and must not bypass Fix Pack redaction.

Test at least:

- target URL with `?token=SECRET#fragment`;
- page URL with arbitrary query names, not only known `token` names;
- network URLs;
- nested JSON containing password/token/session;
- `gpt-fix-prompt.txt`;
- defects/candidates/root-cause JSON;
- nested `gpt-evidence.zip`.

**Known explicit limitation:** screenshot pixels are not guaranteed to be PII-redacted. This must be clearly represented as a limitation, not a PASS.

### 3.3 NO EVIDENCE → NO FIX PACK

Fix Pack must not be generated unless completed audit artifacts required by the bridge are present, including at minimum the GPT evidence package/prompt expected by implementation.

### 3.4 Returned Fix Package trust boundary

The returned ZIP must accept only bounded, declarative mutations.

Expected mutation vocabulary:

- `replace`
- `create`

Must reject:

- delete;
- rename;
- shell commands;
- arbitrary executable actions;
- malformed/unrecognized fields where strict schema is expected.

### 3.5 Source snapshot binding

Before any project write:

- full exported source snapshot fingerprint must match;
- `replace` target must have existed in exported snapshot;
- `replace` target current SHA-256 must equal expected `beforeSha256`;
- path must be within project root;
- target must not route through symlinks;
- protected/secret path cannot be targeted;
- new files must be restricted to supported source types/size rules;
- duplicate operation IDs and archive entries must be rejected case-insensitively for Windows safety.

Test stale source, unexported secret file replacement, target mismatch and same-content copy of a different project.

### 3.6 ZIP parser hardening

Inbound Fix ZIP must validate:

- entry count limits;
- entry compressed/uncompressed size limits;
- CRC;
- path normalization;
- central/local filename consistency;
- unsupported compression;
- encryption rejection;
- ZIP64 rejection where unsupported;
- multi-disk rejection;
- traversal (`../`, absolute paths, drive paths);
- Windows ADS/path tricks;
- safe empty directory entries should not break an otherwise valid standard ZIP.

Test ordinary DEFLATE ZIP from a standard archiver, not only the application's own writer.

### 3.7 Windows path safety

Reject unsafe path components including Windows reserved device names and ADS-like syntax.

Explicit cases:

- `CON`, `PRN`, `AUX`, `NUL`;
- `COM1..COM9`, `LPT1..LPT9`;
- trailing dot/space ambiguities where relevant;
- `file.txt:stream`;
- case-insensitive collisions;
- traversal with mixed slash direction.

### 3.8 No automatic project-code execution

This is a core r13 change.

Fix Bridge must **not automatically execute**:

- `npm test`;
- build scripts;
- linters;
- package scripts;
- config modules;
- TypeScript/JavaScript source;
- arbitrary code from a copied project.

A copied workspace is not an OS sandbox.

Precheck must be **non-executing**. Structural checks such as JSON parsing may run. Runtime/build semantics for executable source changes should remain `NOT_VERIFIED` until a separate trusted runtime gate is performed.

Test by putting an intentionally malicious side-effect script into a disposable project. Apply/precheck must never create its marker file anywhere on the host.

### 3.9 Structural precheck

Before backup/write, structural failures that can be checked without code execution must block mutation.

At minimum reproduce invalid JSON in a changed `.json` file and confirm:

- result = failed/blocking;
- no backup/project mutation has occurred;
- no partial target file exists.

### 3.10 Backup integrity

Before first project mutation:

- unique backup directory must be created safely;
- every replaced original payload must be backed up;
- original SHA-256 must be stored;
- backup payload SHA-256 must be confirmed;
- backup manifest must have an integrity sidecar/hash;
- corrupt manifest or corrupt backup payload must block rollback before writes.

### 3.11 Atomic apply / failure semantics

Test replacement behavior around staging/rename/cleanup.

Critical historical regression scenario:

1. new file has been committed successfully;
2. deletion/cleanup of temporary displaced `.vqb-old-*` fails as if Windows antivirus/file lock intervened.

Expected r13 behavior:

- do **not** falsely say emergency rollback succeeded;
- committed new file remains confirmed;
- user receives warning;
- normal persistent rollback remains available and restores the original.

### 3.12 Emergency rollback

On partial apply failure, emergency rollback may claim success **only** if every affected path is restored to expected hash/absence.

Critical concurrent-edit case:

1. first operation applies;
2. another process changes that target to third-party bytes;
3. a later operation fails;
4. emergency recovery runs.

Expected behavior:

- third-party concurrent bytes must not be silently overwritten;
- result must clearly report `EMERGENCY_ROLLBACK_INCOMPLETE` or equivalent failure state;
- no false rollback PASS.

### 3.13 Persistent/resumable rollback

Rollback must remain discoverable after UI/app restart.

Validate:

- backend can list backups for project;
- UI surfaces latest available non-rolled-back backup;
- refresh/restart does not erase the ability to rollback;
- partially completed rollback can resume safely;
- already restored operations are tolerated appropriately;
- current-file hash protection prevents overwriting later edits;
- created files/directories are removed only when safe;
- only empty directories created by Fix Package are cleaned up;
- backup corruption fails closed.

### 3.14 Live re-check semantics

Local source mutation does **not** prove remote live site changed.

Any one-click live re-check must be presented as post-deploy verification, not as proof immediately after local source apply.

---

## 4. CRITICAL IMPLEMENTATION SURFACES

Prioritize manual review of these files:

### Fix Bridge backend

- `app/backend/src/fix-workflow.ts`
- `app/backend/src/index.ts`

Relevant HTTP surfaces include:

- `POST /api/audits/:id/fix-pack`
- `POST /api/fixes/apply?projectRoot=...` (raw ZIP body, request limit 64 MiB)
- `POST /api/fixes/backups`
- `POST /api/fixes/rollback`

Review all schemas, path handling, archive parsing, secret filtering, backup state and exception semantics around these endpoints.

### Fix Bridge frontend

- `app/frontend/src/App.tsx`
- `app/frontend/src/types.ts`
- `app/frontend/src/help.ts`
- `app/frontend/src/styles.css`

Validate actual UI state transitions, not only types.

### Privacy / external handoff

- `audit-engine/privacy/redaction.ts`
- `audit-engine/reporting/handoff.ts`
- `audit-engine/reporting/report.ts`
- `audit-engine/reporting/zip.ts`

### Windows/bootstrap/provenance

- `RUN.bat`
- `INSTALL.bat`
- `VERIFY.bat`
- `START.bat`
- `STOP.bat`
- `DIAGNOSE.bat`
- `scripts/check-runtime.mjs`
- `scripts/verify.mjs`
- `scripts/runtime-smoke.mjs`
- `scripts/static-sanity.mjs`
- `scripts/create-package-provenance.mjs`
- `PACKAGE_PROVENANCE.json`
- `PACKAGE_MANIFEST.sha256`

### Regression-sensitive existing engine

Do not assume untouched systems are correct. At minimum smoke/regression review:

- `audit-engine/orchestrator/run-audit.ts`
- `audit-engine/geometry/geometry.ts`
- `audit-engine/responsive/sweep.ts`
- `audit-engine/interactions/*`
- `audit-engine/performance/*`
- `audit-engine/art-direction/*`
- reporting output generation.

---

## 5. REQUIRED WINDOWS ACCEPTANCE RUN

Use a **fresh extracted directory**, not an old folder with existing `node_modules` or `dist`.

### Preconditions

- Windows 10/11 x64;
- Node.js `>=22.19.0`;
- npm available;
- internet for `npm ci` and Playwright Chromium install on first run;
- no reuse of stale `node_modules`.

### First launch

Run:

```bat
RUN.bat
```

Expected flow:

`STOP owned instance → INSTALL if dependencies absent → runtime floor check → npm ci --ignore-scripts → Playwright Chromium install → VERIFY → selftest → build → runtime smoke/provenance → START`

If any step fails, overall runtime status is FAIL/NOT VERIFIED. Do not bypass `VERIFY.bat` to obtain a green UI.

### Direct verification

Also run independently:

```bat
VERIFY.bat
```

Then inspect:

```text
final-verification.log
```

### Direct npm gates

Run and preserve outputs:

```bat
npm.cmd run static:check
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run smoke:runtime
npm.cmd run benchmark:accuracy
npm.cmd run verify
```

Do not claim all PASS if a later command reruns and fails an earlier phase.

### Runtime smoke

After a successful build/start:

- verify `http://127.0.0.1:4210` loads;
- confirm health/instance identity behavior;
- verify START/STOP only manage owned application process;
- test stale PID/occupied port/another Node process scenarios;
- verify STOP does not kill unrelated Node processes;
- verify stale RUNNING job recovery and watchdog behavior if practical.

---

## 6. REQUIRED FIX BRIDGE ADVERSARIAL MATRIX

Use disposable temp projects only.

Minimum matrix:

| ID | Test | Expected |
|---|---|---|
| FB-01 | `.env` in source | excluded |
| FB-02 | `credentials.json` with password + DB URL | excluded |
| FB-03 | YAML/INI/properties/TOML literal secrets | excluded |
| FB-04 | URL token/basic auth/Authorization/Cookie literal | excluded/redacted |
| FB-05 | placeholder `process.env.*` | not falsely leaked; should not be treated as actual secret |
| FB-06 | audit URL `?token=SECRET#x` | external textual artifacts contain no secret/query/hash |
| FB-07 | nested evidence JSON secret | redacted |
| FB-08 | standalone GPT handoff | same privacy boundary as Fix Pack |
| FB-09 | no evidence files | Fix Pack refused |
| FB-10 | valid replace | applies + exact after hash |
| FB-11 | stale source | blocked before backup/write |
| FB-12 | replace unexported secret file | blocked |
| FB-13 | create unsupported binary/executable | blocked |
| FB-14 | duplicate ID case-insensitive | blocked |
| FB-15 | duplicate archive entry case-insensitive | blocked |
| FB-16 | traversal/absolute/drive/ADS path | blocked |
| FB-17 | symlink-routed target | blocked |
| FB-18 | Windows reserved component | blocked |
| FB-19 | ZIP64/multi-disk/encrypted | blocked |
| FB-20 | CRC corruption | blocked |
| FB-21 | normal standard DEFLATE ZIP | accepted |
| FB-22 | invalid JSON replacement | FAILED before mutation |
| FB-23 | malicious package script/source side effect | never automatically executed |
| FB-24 | backup payload corrupted | rollback blocked before write |
| FB-25 | backup manifest corrupted | rollback blocked before write |
| FB-26 | app/UI restart after apply | backup still discoverable |
| FB-27 | interrupted rollback | resumable |
| FB-28 | post-commit cleanup failure | warning, committed state retained, later rollback works |
| FB-29 | partial apply + concurrent external edit | external edit preserved; recovery marked incomplete |
| FB-30 | changed target after apply before rollback | rollback must not overwrite silently |
| FB-31 | create nested dirs then rollback | created file removed; only safe empty created dirs removed |
| FB-32 | large local evidence PNG ~13 MiB | Fix Pack export remains functional |
| FB-33 | inbound oversized untrusted entry > strict returned-package limit | rejected |

For each test capture:

- exact test input;
- exit/status/result;
- hashes before/after;
- filesystem tree before/after;
- error/warning text;
- whether project mutation occurred;
- whether backup exists and is valid.

---

## 7. UI / API CONTRACT AUDIT

Validate actual frontend behavior against backend semantics.

Required checks:

- project root is explicit and visible;
- changing project root clears previously selected returned Fix ZIP;
- Fix Pack button cannot silently send/upload source by itself;
- generated Fix Pack is a local download/export action;
- Apply button uses selected project + selected ZIP coherently;
- blocked precheck never renders as “applied”;
- `NOT_VERIFIED` is visually distinct from PASS;
- warning after confirmed commit is not shown as rollback success;
- persistent backup is rediscovered after page/app restart;
- Rollback action uses correct backup/project pairing;
- rollback success/failure text matches backend state;
- re-check wording makes deploy dependency clear;
- UI does not imply screenshot PII redaction exists when it does not.

Use browser/devtools and inspect actual network/API responses.

---

## 8. CORE APPLICATION REGRESSION AUDIT

The independent agent should not limit itself to Fix Bridge.

Run at least one real site audit and verify:

- application launches without stale frontend/server mismatch;
- progress moves 0–100 without impossible jumps or permanent stalls;
- cancellation works;
- resulting report opens;
- `defects.json` contains BUGs only as designed;
- candidates remain separate;
- screenshots/evidence paths resolve;
- report filters/search do not crash;
- GPT handoff files exist only when appropriate;
- Safe Mode blocks mutation requests to audited site;
- page console/network errors are captured without obvious duplicate explosion;
- common carousel/slider horizontal movement is not automatically misclassified as page overflow;
- hidden controls/tabindex=-1 do not create known false zero-size defects;
- benign aborted MP3 loads do not become fake asset errors;
- typography variants are not created from `text-align` alone.

Responsive minimum:

- test mobile, tablet, desktop;
- test at least one breakpoint triad `x-1 / x / x+1`;
- compare full-page and section evidence;
- look for overflow, clipping, fixed/sticky overlap, crop/focal issues and mode discontinuities.

AI Art Director:

- advisory findings must stay separate from technical defects;
- disabled rubric dimensions must not silently score as zero;
- no whole-site claim from single-page evidence;
- missing provider/config must degrade honestly to manual/not-verified state;
- no automatic source mutation.

---

## 9. PROVENANCE / PACKAGE INTEGRITY AUDIT

Independently verify:

1. ZIP can be extracted cleanly.
2. No `node_modules`, `dist`, reports, checkpoints, backups or accidental secrets are shipped unless explicitly intended.
3. Every line in `PACKAGE_MANIFEST.sha256` matches the file bytes.
4. Recompute `PACKAGE_PROVENANCE.json` algorithm independently; do not merely rerun the same script and trust it.
5. Verify `package-lock.json` hash matches provenance.
6. Verify release archive SHA-256 supplied externally if available.
7. Confirm sourceFileCount is consistent with provenance algorithm/exclusions.
8. Confirm added agent-audit documents are included in the new package manifest/provenance for this audit edition.

---

## 10. CLAIM / DOCUMENTATION CONSISTENCY AUDIT

Cross-check:

- `README.md`
- `README.txt`
- `docs/ARCHITECTURE_LOCK.md`
- `docs/PHASE_STATUS.md`
- `docs/R13_FIX_BRIDGE.md`
- `docs/R13_REAUDIT.md`
- `docs/R13_VERIFICATION.md`
- `docs/FUNCTIONS_RU.txt`
- `app/frontend/public/FUNCTIONS_RU.txt`
- UI labels/help text

Look for:

- stale r11/r12 behavior described as current;
- claims of automatic test/build execution inside Fix Bridge;
- claims of screenshot PII redaction;
- false Windows PASS;
- contradiction about `dist` being included vs built on target;
- contradiction between docs and actual API/implementation;
- historical reports presented as current acceptance.

Historical r11/r12 documents may remain for traceability but must be clearly interpreted as historical/superseded where relevant.

---

## 11. EXPECTED CURRENT BASELINE — DO NOT TREAT AS PROOF

The package was previously reported to have these observations before this independent audit:

- `STATIC_SANITY`: 91/91;
- TS/TSX syntax transpilation: 80/80;
- targeted Fix Bridge adversarial runtime: 12/12;
- source secret/privacy regressions: pass in tested matrix;
- DEFLATE/traversal/CRC/ZIP64 tests: pass/reject as intended;
- backup/rollback/fault injection: pass in tested scope;
- native Windows full install/build/runtime: **NOT VERIFIED in the originating container** because its Node version was 22.16.0 and dependency install had transport issues.

Your task is to reproduce or falsify these results.

---

## 12. OUTPUT REQUIRED FROM THE AGENT

Return a single audit report with this structure:

### A. FINAL VERDICT
One of:

- `ACCEPTED`
- `ACCEPTED WITH P3 ONLY`
- `NOT ACCEPTED`
- `NOT VERIFIED` — only if the environment genuinely prevents decisive testing.

Do not use vague “looks good”.

### B. COVERAGE
Exact OS, Node/npm versions, commands run, tests executed, pages/runtime paths checked.

### C. FINDINGS TABLE
For every finding:

`ID | Severity | Surface | Evidence | Reproduction | Root Cause | Consequence | Required Fix | Regression Test`

### D. PASSED GATES
Only gates physically executed or independently verified.

### E. NOT VERIFIED
Anything not executed.

### F. CLAIM-EVIDENCE MATRIX
Map major release claims to concrete evidence.

### G. REGRESSION RESULT
State whether r13 introduced regressions in existing Visual QA Browser functions.

### H. SECURITY RESULT
Explicit verdict for:

- secret export;
- external GPT privacy;
- ZIP parser;
- filesystem escape;
- source hash binding;
- auto-exec boundary;
- backup integrity;
- rollback integrity;
- Windows-specific path/process behavior.

### I. RELEASE DECISION
Do not approve if any reproducible P0/P1 remains. P2 requires explicit justification and scope.

---

## 13. PROHIBITED SHORTCUTS

The audit is invalid if the agent:

- only reads existing reports;
- runs only `npm test` and calls the product secure;
- audits only Fix Bridge and ignores Windows startup/regression;
- audits source without runtime where runtime is available;
- edits failing tests instead of fixing product code;
- disables guards to force PASS;
- treats timeout/missing dependencies as PASS;
- tests security against a real user project;
- uses one happy-path Fix ZIP only;
- skips rollback/fault injection;
- skips privacy tests because filenames “look safe”;
- accepts hash/provenance claims without independent recomputation.

---

## 14. FIRST ACTIONS FOR THE AGENT

1. Compute SHA-256 of received ZIP.
2. Extract into a new directory.
3. Inventory all files before executing anything.
4. Verify package manifest/provenance independently.
5. Inspect `package.json`, bootstrap BAT files and critical Fix Bridge files.
6. On Windows, run `RUN.bat` from the fresh directory.
7. Preserve `final-verification.log` and all command outputs.
8. Run the adversarial matrix in disposable temporary workspaces.
9. Run one end-to-end real audit through the UI.
10. Produce the report defined above.

**Do not modify the package before completing the first independent evidence pass.**
