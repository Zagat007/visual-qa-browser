# Roadmap

Visual QA Browser is developed in the open by a solo maintainer with community
help. This roadmap is a direction, not a release-date promise: **planned ≠ shipped**,
and unverified ≠ done — the same honesty rules the auditor itself enforces.

## Now — first public release (v1.2.x)

- [x] MIT open-source packaging of the v1.1.9-r24 codebase
- [ ] Windows clean-machine verification of `INSTALL.bat` → `START.bat` → full audit
- [ ] GitHub Actions CI (Windows + Ubuntu, Node 22): typecheck, tests, static checks, build
- [ ] Release ZIP built from a tagged commit, with generated integrity manifest/provenance
- [ ] Demo assets: UI/report screenshots and a short walkthrough

## Next — adoption & contributor friendliness

- **Dynamic brand profiles**: load any `configs/site-profiles/*.json` by `id`/`matchHosts`
  (today `GENERIC` + one bundled worked example are compiled into the schema)
- **Headless CLI** (`vqb audit <url> --preset QUICK --out reports/`) reusing the
  engine without the UI, so the auditor can run in CI jobs
- **English UI (i18n)**: externalize the Russian UI strings; keep Russian as a locale
- **Docker image** for a one-command local workstation (still loopback-only)
- Split the largest files (`App.tsx`, `fix-workflow.ts`, `run-audit.ts`)
  into reviewable modules without behaviour changes
- Manifest generator script so release packaging is reproducible from the repo alone

## Later — depth

- Sitemap-driven multi-page crawl with per-page budgets and cross-page evidence
  (today: one URL per audit; cross-page checks honestly report PARTIAL)
- Additional passive checks (e.g. CSP quality analysis, HSTS preload pitfalls)
- SARIF export for code-scanning dashboards
- Firefox/WebKit evidence *without* claiming real-Safari PASS
- Screenshot PII masking before any optional external AI review of private pages

## Explicit non-goals

- Active exploitation, credential attacks, brute force, or "pentest automation"
- A hosted multi-user public scanner service
- Automatic, unreviewed changes to audited projects
- Turning pixel differences or advisory art-direction scores into automatic BUGs
