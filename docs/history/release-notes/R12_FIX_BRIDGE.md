> **Historical / superseded by r13.** Current behavior and acceptance evidence: `R13_FIX_BRIDGE.md` and `R13_VERIFICATION.md`.

# r12 — ChatGPT Fix Bridge Hardened

## Goal
Preserve the simple workflow **audit → one ZIP to ChatGPT → one ZIP back → safe local apply → post-deploy re-check** without granting a local AI autonomous write access.

## r11 root causes closed
- credential/secret config files and high-confidence literal passwords/DB credentials are excluded from the source-aware Fix Pack;
- `replace` is restricted to files that actually existed in the exported workspace manifest; a hidden/excluded file cannot be targeted by guessing its hash;
- `create` is restricted to supported source files and bounded sizes;
- package scripts no longer execute after source mutation: verification runs first in a disposable project copy;
- a Fix Package touching `package.json` or package-manager lock metadata is `NOT_VERIFIED` automatically; its modified scripts are not executed;
- Windows `.cmd` package-manager execution uses `cmd.exe`, and timeout cleanup attempts to terminate the process tree;
- backup directories are created exclusively with collision resistance;
- backup manifest and original replace payloads are SHA-256 guarded;
- emergency rollback is claimed only after hash-confirmed restoration; incomplete restoration is explicit;
- rollback is persistent across UI/app restart, resumable after partial restoration, and removes only empty directories created by the fix.

## Trust boundary
The disposable verification copy is working-tree isolation, not a security sandbox. Existing trusted project scripts may execute arbitrary processes or access absolute/external resources. A returned Fix Package must still come from the trusted remediation workflow.

## Non-goals
- automatic upload to ChatGPT;
- autonomous local-AI edits;
- automatic deployment;
- delete/rename/shell operations supplied by a Fix Package;
- claiming that local edits fixed the live website before deployment/re-check.
