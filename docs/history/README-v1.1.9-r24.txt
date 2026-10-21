Visual QA Browser v1.1.9 — LIGHTHOUSE TEST ISOLATION FIX r24

r24 retains r22 startup self-heal, r21 Lighthouse isolation, and the r23 strict TypeScript fixes. It corrects the real-Lighthouse integration test so deterministic browser/network spies execute in the same process as the Lighthouse core while production continues to use the isolated worker. START.bat remains a valid first-run entry point and automatically delegates to the verified RUN.bat pipeline when the build is absent. Compare captures on the same URL/OS/Chromium/viewport, inspect red difference maps manually, and never turn a pixel change into an automatic BUG. Scenario steps check visibility/text, safe state switches, checkboxes and test text. Network is blocked after the page loads, and unsafe actions are skipped. Screenshots and traces stay local and can contain visible personal data.

See docs/R24_LIGHTHOUSE_TEST_BOUNDARY.md for the current regression fix, docs/R23_WINDOWS_TYPECHECK_FIX.md for the strict-TypeScript baseline, docs/R22_STARTUP_SELF_HEAL.md for startup self-heal, docs/R21_LIGHTHOUSE_ISOLATION.md for Lighthouse isolation, and AGENT_AUDIT_HANDOFF_R24.md for the current independent verification scope.

Fix Bridge safety lineage retained from r14 (still part of r21): source export, privacy, ZIP binding and rollback hardening from the independent r13 audit remain active.

Key retained safety rules:
- external Fix Pack metadata/text evidence removes URL query/hash values and secret-like JSON fields before export;
- project scripts/source code are NEVER auto-executed by Fix Bridge;
- precheck is non-executing and fail-closed for structural errors such as invalid JSON;
- source fingerprint + installation/project-path binding + per-file SHA-256 + source-membership checks are mandatory (returned manifest schemaVersion 2);
- integrity-guarded backup, persistent/resumable rollback and atomic replace/create remain enabled;
- delete/rename/shell operations remain forbidden.

Workflow:
1. Run an audit.
2. Choose the local project folder and build one ChatGPT Fix Pack.
3. Send that ZIP to ChatGPT and receive VQB-FIX-*.zip.
4. Import the returned ZIP. The current r21 Fix Bridge keeps the r14 manifest/fingerprint/binding/hash validation and runs only non-executing precheck before mutation.
5. The current Fix Bridge creates an installation-sealed backup and applies only replace/create.
6. Runtime/type/lint/test/build verification is a separate trusted gate; Fix Bridge does not execute project code automatically.
7. After deployment, run the live re-check.

Old r13 returned Fix ZIPs and backups are not compatible with the current integrity binding. Export a new Fix Pack and start with a fresh installation folder.
Windows r24 first-run verification must complete on your Windows machine by launching START.bat or RUN.bat from a fresh extraction. See docs/R24_LIGHTHOUSE_TEST_BOUNDARY.md.

Current audit handoff: AGENT_AUDIT_HANDOFF_R24.md. Current changes: docs/R24_LIGHTHOUSE_TEST_BOUNDARY.md.
