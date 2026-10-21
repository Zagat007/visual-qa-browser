> **HISTORICAL r14 RELEASE NOTES.** Retained for remediation lineage. Current release/acceptance: `docs/R21_LIGHTHOUSE_ISOLATION.md`.

# v1.1.2 / r14 — independent audit remediation

This source package supersedes the r13 Fix Bridge acceptance claims. The original r13 archive is unchanged. The r14 package is intended for a **new extraction directory** on Windows 10/11 x64 with Node.js >=22.19.0 and network access for npm and Playwright Chromium installation.

## Corrections

| r13 finding | r14 change | Verification |
| --- | --- | --- |
| F01, F11 — source credentials/service backups exported | expanded secret detection, narrow placeholder recognition, excluded service directories, text-only source validation | r14 security regression and existing Fix Bridge tests |
| F02, F07 — nested GPT evidence leak / malformed JSON | recursively sanitize parsed JSON before serialization; shared sanitizer for legacy and Fix Pack handoff | nested JSON and report tests |
| F03, F04, F05 — concurrent edits and symlinked parent during writes/rollback | recheck displaced bytes, exclusive same-volume link creation, verify parent path and report incomplete recovery | injected concurrent write, symlink, cleanup and rollback tests |
| F06 — copied project accepted | signed fingerprint bound to canonical project path and installation key; returned manifest schema 2 | identical-copy refusal test |
| F08, F09 — ambiguous ZIP entries/headers | reject case-only names and local/central method/flag contradictions | ZIP mutation tests |
| F10 — disguised binary/oversize replace | content and size validation for both replace and create | pre-mutation rejection test |
| F12 — reserved-ID regression assertion | test uses safe archive entry to reach actual manifest validation | full suite |
| F13 — stale acceptance claims | r13 acceptance page labelled historical; current scope recorded here | document inspection |

The Fix Bridge still **never automatically executes project scripts or source code**. A structural JSON precheck can PASS; executable source changes remain `NOT_VERIFIED` until a separately trusted runtime gate. The UI requires deployment before a live re-check. Screenshot pixels are not guaranteed to be redacted.

Newly exported Fix Packs use returned `fix-manifest.json` schemaVersion 2 and `sourcePackBinding`. Old r13 returned ZIPs are rejected; export a fresh pack. Old r13 backups lack the installation seal and cannot be rolled back by r14. Start in a fresh directory, and complete any old rollback in r13 **before** migrating.

## Verification and honest limits

In the remediation environment, Linux x64 / Node 24.19.0, `npm ci --ignore-scripts --offline`, `npm run static:check`, `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke:runtime`, `npm run benchmark:accuracy`, and `npm run verify` completed. The final fresh-extraction result and exact hashes are recorded in the external remediation report shipped alongside the ZIP.

Native Windows `RUN.bat`, `VERIFY.bat`, `npm.cmd` gates, process ownership, antivirus lock behavior, and an unrestricted real public-site audit are **NOT VERIFIED** here. Linux tests and fault injection cannot establish Windows acceptance. This is a source package: no `node_modules`, `dist`, report, checkpoint, or backup directory is included.

On the target Windows machine, extract to a fresh directory, install Node >=22.19.0, run `RUN.bat`, inspect `final-verification.log`, then run `VERIFY.bat` and independently:

```bat
npm.cmd run static:check
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run smoke:runtime
npm.cmd run benchmark:accuracy
npm.cmd run verify
```

If a command fails, retain the failing log and do not treat the Windows release gate as passed. The application must run from the extracted folder; `STOP.bat` targets only the installation-owned process.
