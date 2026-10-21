# HISTORICAL — r11, superseded by r12

This document describes the rejected r11 Fix Bridge and is retained only for audit traceability. Current contract: `R12_FIX_BRIDGE.md`.

# r11 — ChatGPT Fix Bridge

## Goal
Reduce the user's manual workflow to: **audit → export one ZIP → ChatGPT → import one ZIP → local verification → post-deploy re-check**.

## Added
- persistent local project-root setting;
- source-aware ChatGPT Fix Pack;
- allowlisted source collection with secret/build/dependency exclusions;
- mandatory full-workspace source-pack fingerprint plus per-file SHA-256;
- strict `fix-manifest.json` contract;
- STORE/DEFLATE ZIP reader with CRC, size, traversal, ZIP64/multi-disk and central/local-name guards;
- replace/create-only application model;
- pre-write stale-source rejection;
- installation-local backups and guarded rollback;
- automatic package-script verification (`typecheck`, `lint`, `test`, `build`) when available;
- one-click repeat live audit after deployment.

## Deliberately not added
- autonomous source edits by Ollama/local AI;
- automatic upload to ChatGPT;
- automatic deployment to hosting;
- delete/rename/shell operations in returned fix packages;
- false claim that local source mutation fixes the live site before deployment.

## Trust boundary
The returned Fix Package is trusted remediation input. The manifest itself cannot request shell commands, but optional post-apply `lint`/`test`/`build` scripts are the target project's own executable workflow and are not sandboxed by r11.
