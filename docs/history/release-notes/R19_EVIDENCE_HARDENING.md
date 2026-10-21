# r19 — Evidence hardening

Visual QA Browser v1.1.7 / r19 is a minimum-change hardening release over the verified r18 baseline. It addresses defects found by an independent review of a real `gpt-evidence.zip`.

## What changed

- GPT evidence manifest is schema v2. Screenshot associations use `issueIds`; BUG/CAND remain separate registries.
- Screenshots are associated only with visually inspectable issues. Security, runtime, SEO and performance use machine-readable evidence.
- `machine/` now carries provenance, delivery/security evidence, axe evidence, runtime/network evidence, site-technical evidence, performance summary and sanitized per-run Lighthouse core measurements.
- Pages taller than 16,000 CSS px retain section screenshots instead of putting an enormous full-page PNG into the GPT ZIP. Section manifest entries include selectors.
- Image crop candidates and typography role candidates are deduplicated across viewports and include selectors for localization.
- Checkbox/radio touch-target measurement uses the associated native `<label>` when it expands the activation surface. `small-control-target` remains a CAND, not an auto-fix BUG.
- Lighthouse runs have a sanity gate. Impossible timing relationships are `SUSPECT`, excluded from the performance verdict, and cannot become HIGH-confidence site regressions.
- Technical `root-causes.json` is renamed to `root-cause-hypotheses.json`; `HYP-*` explicitly means a clustering hypothesis, not a proven root cause.
- Premium GPT prompt is generated only when Art Direction actually ran.
- Provenance records app version and OS platform/release/architecture.

## Local verification performed during r19 construction

- `node scripts/static-sanity.mjs` — PASS.
- TypeScript syntax transpile across 85 TS/TSX source/test files — PASS.
- Strict targeted TypeScript checks for report/handoff/provenance, collectors and Lighthouse/performance changes — PASS using the available TypeScript runtime and local external-module contracts.
- Report/handoff smoke — PASS: 35,084 px page keeps section evidence, omits full-page image from GPT ZIP, manifest schema v2 is emitted, machine evidence is present, Premium prompt is absent without Art Direction, external token/query is redacted.
- Issue-association smoke — PASS: runtime HTTP error is not attached to a screenshot while the visual overflow BUG is.

## Not claimed here

The construction environment has Node.js 22.16.0 while the package requires Node.js >=22.19.0, and npm registry access failed with `EAI_AGAIN`. Therefore the full authoritative `npm ci -> typecheck -> vitest -> build -> runtime smoke` chain was not re-run in this Linux environment. This is **NOT_VERIFIED**, not PASS.

## Windows acceptance gate

Extract into a new folder and run `RUN.bat` (or `VERIFY.bat`) on Windows 10/11 with Node.js >=22.19.0. Accept r19 only if package integrity, static checks, TypeScript, tests, build, production API/server smoke and rendered Chromium UI smoke all complete with the verifier final PASS.
