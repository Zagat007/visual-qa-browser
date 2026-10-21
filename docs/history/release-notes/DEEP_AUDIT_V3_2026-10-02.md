# UNIVERSAL DEEP AUDIT PROTOCOL v3.0 — Visual QA Browser (historical protocol, updated for r16 scope)

Historical source audit before FIXED r3/r4. Its convergence claims below describe
that earlier source review only and were superseded by later runtime failures.
Current verification: AUDIT_RU.txt, docs/FINAL_VERIFICATION.md and final-verification.log.
Windows r3 evidence: 85/85 tests passed; Vite output mkdir failed. r4 still requires
successful target-machine RUN.bat / VERIFY.bat for Windows runtime confirmation.

## Baseline lock
- Goal: reliable local Windows Visual QA workstation with evidence-first technical QA plus a strictly separate advisory AI Art Director.
- Preserve: Safe Mode, deterministic capture, technical verdict integrity, Russian report/GPT workflow, responsive/interaction/accessibility/SEO/security/performance modules.
- Runtime incident to eliminate: stuck RUNNING recovery, permanent 0% queue, ineffective Stop, false START ownership.
- Art Direction contract: advisory only, evidence-based, transparent rubric, privacy/cost controls, human decision; never mutates the audited site or technical verdict.

## 14 independent lenses
1. Goal/result — PASS in source scope; unified runtime hardening + Art Director.
2. Requirements — PASS with explicit residual unsupported scopes below.
3. Hidden assumptions — hardened install identity, recovery and AI provider configuration.
4. Technical correctness — source/static contracts pass except bootstrap lockfile generated during INSTALL.
5. Logic — interrupted RUNNING is terminal NOT_VERIFIED; queue activity derives from active IDs.
6. Structure/cohesion — technical QA and advisory AI remain separate modules and report sections.
7. Domain quality — evidence, severity/confidence, rubric, image/semantic/visual review and technical QA contracts preserved.
8. Stronger solutions — root-cause fixes used instead of timeout inflation/manual checkpoint cleanup.
9. Consistency — partial Art layers produce N/A/normalized scores; no P0-P3 on subjective art advice.
10. Dependency impact — provider failure/cancel cannot overwrite technical verdict; installer owns dependency bootstrap.
11. Edge/failure modes — watchdog, recovery, stale UI, port/process ownership, AI abort/timeouts/privacy firewall covered by source/tests.
12. Regression/preservation — existing technical modules and report/GPT outputs preserved; new XSS regression added for AI output.
13. Simplification — single scheduler active-ID source of truth; no duplicate running counter; AI model configured via env rather than hard-coded.
14. Final readiness — SOURCE SCOPE converged; WINDOWS RUNTIME remains NOT VERIFIED until target-machine VERIFY PASS.

## Significant root causes fixed
- Interrupted RUNNING jobs were re-entering work after restart and monopolizing the only worker.
- Scheduler state relied on fragile activity bookkeeping and non-atomic checkpoint writes.
- UI retained stale job state after server-side job loss.
- Windows START/STOP could not prove process ownership strongly enough across multiple local copies.
- START could discard the owned PID handle when the owned process existed but its health endpoint was hung; it now uses a distinct unhealthy-owned state and safely invokes STOP only after instance-marker verification.
- External AI work was not fully coupled to audit cancellation and had privacy/scoring truth-domain gaps.
- Runtime hardening and AI Art Director previously existed in separate package branches instead of one accepted product.

## Convergence
Two independent source-level convergence passes found no new P0/P1/significant P2 after fixes. A final negative/adversarial source pass found no new material issue.

## Residual / NOT VERIFIED
- Full typecheck/Vitest/build and real browser runtime require dependencies and Windows Node >=22.19; run INSTALL.bat then VERIFY.bat.
- Historical bootstrap limitation: no registry access. FIXED r4 includes an audited pinned package-lock.json and uses npm ci.
- External OpenAI Art Director needs a user-selected image-capable model in OPENAI_ART_DIRECTOR_MODEL and a valid OPENAI_API_KEY; real account/model execution is not verified here.
- Screenshot-level PII blur is not implemented; external AI is blocked for private/token-like targets and likely DOM email/phone PII, but visually embedded PII on a public screenshot remains a residual risk.
- Cross-page Art Direction is NOT VERIFIED when only one page URL is supplied; whole-site claims are not fabricated.
- Full source-code verdict and cross-browser RELEASE evidence remain outside the live single-target scope unless separately supplied/enabled. Local locked-baseline visual regression is implemented in r16 and remains a REVIEW mechanism, not an automatic BUG classifier.
