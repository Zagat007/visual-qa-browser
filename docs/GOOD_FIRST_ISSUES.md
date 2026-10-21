# Good first issues

Maintainer: create these as GitHub issues with the `good first issue` label
(and `help wanted` where noted). Each is scoped to be reviewable in one PR.

| # | Title | Area | Acceptance sketch |
|---|-------|------|-------------------|
| 1 | Dynamic brand-profile loading from `configs/site-profiles/*.json` | backend + art-direction | New JSON profile selectable without recompiling; `AUTO` matches by `matchHosts`; tests for found / not-found / duplicate id |
| 2 | Externalize UI strings into a locale file (RU default) | frontend | All visible strings via one `strings.ts`; no visual change; groundwork for EN locale |
| 3 | English locale for the command-center UI | frontend, docs | `en` locale with full coverage of main flow; language switch persists locally |
| 4 | Headless CLI: `vqb audit <url>` | backend, engine | Runs one audit config, writes the same report set, exits 0/1/2; loopback server not required; covered by an integration test against a fixture |
| 5 | `scripts/create-package-manifest.mjs` generator | scripts | Deterministically writes `PACKAGE_MANIFEST.sha256` matching `verify-package-integrity.mjs`; round-trip test |
| 6 | Dockerfile + Compose for the local workstation | infra | `docker compose up` → UI on loopback; Chromium deps inside; docs in README; image runs as non-root |
| 7 | Passive check: CSP allows `'unsafe-inline'` in `script-src` | security/delivery | Fires only when CSP present but weak; silent when CSP missing (existing rule) or strict; unit tests both ways |
| 8 | Passive check: HSTS `max-age` below 30 days | security/delivery | Parses existing HSTS; P3 with observed value redacted-safe; tests for absent/short/long/invalid |
| 9 | Fixture page: horizontal overflow only between 391–767 px | tests/fixtures | Deterministic page reproducing a between-breakpoints overflow; responsive-sweep test proves detection |
| 10 | Fixture page: form labels present visually but not programmatically | tests/fixtures | axe + forms modules flag it; clean variant stays silent |
| 11 | Report: link each BUG to its exact screenshot anchor | reporting | `report.html` defects deep-link to evidence images; no layout regression in report test |
| 12 | Docs: 5-minute quickstart GIF/screenshots refresh | docs | Replace placeholder captures with current UI on `example.com`; alt text included |
| 13 | Split `App.tsx`: extract audit-form sections into components | frontend | Pure refactor, no behaviour change; bundle still builds; diff is mostly file moves |
| 14 | `.editorconfig` + Prettier config matching existing style | tooling | No mass reformat in the same PR; config only, so future diffs stay small |
| 15 | Windows: smoke-test `INSTALL.bat` in a clean VM and document timings | windows, docs | `help wanted`; evidence log attached to the issue; INSTALL docs updated with real timings |

Ground rules for every item: authorized targets only, add tests that fail
before / pass after, and keep `npm run typecheck && npm test && npm run static:check`
green (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
