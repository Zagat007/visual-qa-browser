> **Architecture lineage document.** The locked v1.1.1/r13 rules below remain constraints where applicable; current release acceptance is in `docs/R21_LIGHTHOUSE_ISOLATION.md`.

# Architecture Lock v1.1.1

## Scope
Local, evidence-driven website QA workstation. The first target is `https://melody4you.ru`, but target-specific rules must remain profile data, not hard-coded engine logic.

## Locked decisions
1. **Local-only control plane**: Express binds to `127.0.0.1:4210`. It serves the production React bundle and `/api/*`.
2. **Outbound safety boundary**: Safe Mode applies to browser traffic generated while auditing targets. It does **not** block the workstation's own local API.
3. **Target URL policy**: only HTTP(S); loopback, link-local, RFC1918/private ranges and cloud metadata targets are denied by default. Local Development Mode is an explicit future/controlled override, not an implicit exception.
4. **Job model**: every audit is a durable job with immutable ID, status and evidence directory. API returns immediately and progress is polled.
5. **Evidence model**: raw screenshots/logs are stored under a timestamped audit directory. Report claims must reference generated evidence artifacts.
6. **Fault isolation**: subsystem status is independent. A runtime/log failure cannot erase a successful screenshot; partial audits remain reportable.
7. **Deterministic capture before visual claims**: fonts/images/lazy content/layout/animations are stabilized before capture where possible.
8. **No source/live equivalence claim** without provenance evidence. Source analysis is a separate future mode.
9. **Security posture**: the tool is passive/non-destructive by default. POST/PUT/PATCH/DELETE from the audited page are blocked in Safe Mode and recorded as `SKIPPED_SAFELY` candidates.
10. **HTML output is escaped**. Secrets are never intentionally persisted; network evidence stores redacted URL/query values and no request headers/cookies.
11. **Release gates are separated**:
   - Tool release gate: whether Visual QA Browser itself is validated.
   - Target quality gate: findings on the audited site.
   A target P0/P1 does not mean the QA application release failed.
12. **Windows claim law**: `.bat` files can be statically reviewed here, but Windows runtime remains `NOT VERIFIED` until executed on Windows or Windows CI/VM.
13. **Runtime floor**: Node.js `22.19+` is the minimum supported runtime because the pinned Lighthouse `13.5.0` performance engine requires it. Installer, package engine and backend build target must stay aligned.
14. **Performance isolation**: Lighthouse performance is a separate guarded lab subsystem. It uses three fresh-profile desktop cold runs and reports the median. Safe Mode blocks non-read methods, private/invalid targets and WebSockets; Service Worker network bypass is configured before guarded page traffic proceeds. Any firewall intervention invalidates that run for release verdicts. Guarded measurements are comparable only with baselines produced by the same pinned methodology.
15. **No premature RELEASE preset**: the public RELEASE mode remains unavailable until performance, visual regression, cross-browser, final regression and coverage gates exist together. A completed performance subsystem alone cannot imply release coverage.

## Data lifecycle
`URL -> validate -> job -> browser context -> policy interception -> deterministic capture -> runtime evidence -> artifact persistence -> report -> re-test`

## Explicit non-goals for v0.1 core
- No destructive interactions.
- No credential collection in ordinary UI.
- No penetration testing.
- No claim that Playwright WebKit equals Safari.
- No AI Art Direction advice may be represented as an objective technical defect or technical release verdict.

## Phase 0 adversarial corrections
- Resolved Safe Mode vs local API contradiction by separating control-plane and target-browser traffic.
- Resolved localhost deny vs Local Build Audit by making local-target auditing a separate explicit policy mode.
- Resolved release quality-gate ambiguity by separating tool gate from audited-target gate.
- Added durable async job boundary so long audits do not block the UI request lifecycle.
- Added SSRF-aware target policy for both initial URL and audited subrequests.
- Added report escaping/redaction requirements to prevent evidence/report injection and secret leakage.

## Known security boundary not falsely claimed
Application-level DNS/IP validation blocks obvious loopback/private/link-local/metadata targets and re-checks audited requests. It does **not** by itself prove immunity to DNS rebinding/TOCTOU between Node resolution and Chromium's network stack. A future hardened release must add network-layer isolation or validated proxy/IP pinning before claiming complete SSRF containment.

## AI Art Director architecture lock — v1.1

16. **Technical QA and Art Direction are separate truth domains.** Technical severity/verdict never consumes AI advisory score or recommendation priority.
17. **Provider abstraction is mandatory.** Manual/ChatGPT export works with no provider; OpenAI is optional and provider failure cannot fail technical QA.
18. **External AI is explicit opt-in.** `OPENAI_API_KEY` and `OPENAI_ART_DIRECTOR_MODEL` are read from local process environment only; the key is never accepted in the ordinary UI or written to reports.
19. **Private/authenticated external AI evidence is disabled in v1.1.** The API schema accepts only `privateEvidenceAllowed=false` until a proven session + screenshot-redaction workflow exists.
20. **Privacy firewall before external multimodal upload.** High-confidence email/phone PII detected in rendered DOM blocks the external upload rather than pretending screenshot redaction occurred.
21. **Score ownership is local.** Overall Art Direction score is computed by application code from fixed rubric weights; the model cannot choose its own overall weighting.
22. **Advice is filtered.** Disabled analysis layers, generic advice, evidence-free findings and unsafe LOW-confidence priorities are dropped before reporting.
23. **No false whole-site claims.** Cross-page/whole-site review is PARTIAL / NOT VERIFIED unless evidence actually contains multiple page URLs.
24. **No mutation.** Human recommendation lifecycle is local report state only; neither provider nor report can edit the audited site.
25. **External request bounds.** AI depth modes cap screenshot count, aggregate image bytes, output tokens and request timeout.

## Unified runtime hardening — v1.1.1

26. **Interrupted RUNNING is never auto-resumed.** Browser state is non-durable; post-crash RUNNING becomes `NOT_VERIFIED / recovery-interrupted`.
27. **Scheduler ownership is explicit.** Active capacity derives from `activeIds`; queue progress does not depend on a mutable counter.
28. **No-progress watchdog is mandatory.** A stalled audit must release the sole worker and cannot receive PASS.
29. **Checkpoint writes are atomic where practical.** State/secret files use temp → rename; persistence failure must not be silently treated as success.
30. **Stale UI jobs are disposable.** A 404 from job polling clears the displayed stale job rather than retrying forever.
31. **Windows installation identity is stronger than port ownership.** Health exposes deterministic `instanceId`; launched process carries `--vqb-instance=<id>`. START/STOP use PID + instance marker/health and never kill generic Node processes.
32. **External AI cancellation is subordinate to audit cancellation.** Provider timeout and parent AbortSignal are combined; Stop must not wait for an independent AI timeout.
33. **No hard-coded AI model ID.** Automatic provider is configured only when both `OPENAI_API_KEY` and `OPENAI_ART_DIRECTOR_MODEL` are present.
34. **Partial rubric cannot masquerade as full rubric.** Disabled score dimensions render `N/A`; overall is normalized only across enabled weighted dimensions.
35. **External evidence URL minimization.** AI/evidence URL fields preserve only needed origin/path and remove all query/hash/data/blob payloads.
36. **Screenshot PII limitation is explicit.** DOM PII/private-route guards do not equal screenshot-level redaction; private/auth external AI remains disabled until that capability is proven.

## ChatGPT Fix Bridge — r13

37. **ChatGPT remains the remediation authority.** Local AI providers may assist advisory analysis, but Fix Bridge does not grant them write access to project source.
38. **Explicit export only.** Local project source is bundled only after a user action. No source file is uploaded or sent by the application itself.
39. **Source export is allowlisted and secret-aware.** Dependencies, VCS/build/report directories, `.env`, key/certificate files, credential/secret configuration names and high-confidence literal secret material are excluded. Binary/oversized files are omitted and reported.
40. **External evidence is minimized again at Fix Pack creation.** Exported audit-job metadata is allowlisted; URL query/hash values are stripped from textual artifacts; secret-like JSON keys are redacted; nested `gpt-evidence.zip` text/JSON is repacked through the same sanitizer. Screenshot pixels are not auto-redacted and remain a documented user-review boundary.
41. **NO EVIDENCE → NO FIX PACK.** `gpt-evidence.zip` and `gpt-fix-prompt.txt` from a completed audit are mandatory before a source-aware Fix Pack can be created.
42. **No blind overwrite.** Every Fix Package is bound to the full exported source-snapshot fingerprint. `replace` is allowed only for a file that actually existed in that exported snapshot and must match its exact SHA-256. Any workspace/file mismatch aborts before project mutation.
43. **Minimal mutation vocabulary.** r13 accepts only `replace` and `create`. Delete, rename and shell-command operations are not accepted. `create` is restricted to supported source-file types/sizes.
44. **Archive trust boundary.** Fix ZIP entries are bounded by count/size, CRC-checked and path-normalized. Traversal, encryption, ZIP64, multi-disk archives, central/local name mismatch and unsupported compression are rejected; ordinary empty directory entries are tolerated.
45. **No automatic project-code execution.** Fix Bridge does not auto-run `typecheck`, `lint`, `test`, `build`, package scripts, config files or source code. A copied project tree is not an OS sandbox, so process execution is not treated as safe merely because the working tree is copied.
46. **Non-executing precheck precedes mutation.** Manifest/fingerprint/hash/source-membership validation always runs first. Structural checks such as JSON parsing may return `FAILED` and block mutation. Executable-code changes remain `NOT_VERIFIED` until a separate trusted runtime/build gate.
47. **Backup before mutation with integrity proof.** A unique installation-local backup directory is created exclusively before the first project write. Replace payloads carry their original SHA-256; the backup manifest has its own SHA-256 sidecar. Corruption blocks rollback before writes.
48. **Atomic local replacement.** Replacement uses same-directory staging, displaced-file restoration and post-write hash confirmation. A cleanup failure after a confirmed commit is reported as a warning, not misreported as a successful emergency rollback.
49. **Emergency rollback is evidence-based.** A partial apply failure may claim emergency rollback only after every affected path has been restored/removed and its expected hash state is confirmed. A third-party concurrent edit is preserved and surfaced as `EMERGENCY_ROLLBACK_INCOMPLETE`.
50. **Persistent, resumable rollback.** Backups are discoverable after UI/app restart. Rollback accepts already-restored operations so an interrupted rollback can resume, checks target hashes to avoid overwriting later edits, validates backup payload hashes, and removes only empty directories created by the Fix Package.
51. **Live re-check is post-deploy only.** Local source changes do not prove a remote live fix. The one-click re-check repeats the prior live audit only after the user has deployed the changes.
52. **Filesystem escape is fail-closed.** Target paths reject traversal, Windows reserved/ADS-style components and symlink-routed project paths. Operation IDs/archive entries are case-insensitively unique to remain safe on Windows.
