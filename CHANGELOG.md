# Changelog

All notable changes are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

## [1.2.0] — first public open-source release (unreleased)

Prepared from the private Windows source package `v1.1.9-r24`.

### Added
- MIT `LICENSE`, `README.md` (English) and `README_RU.md`, `CONTRIBUTING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, `ROADMAP.md`.
- GitHub infrastructure: CI workflow (Windows + Ubuntu, Node 22), issue/PR
  templates, Dependabot configuration.
- `docs/GOOD_FIRST_ISSUES.md` starter-task list; UI and report screenshots.
- Historical release/audit notes preserved under `docs/history/`.

### Changed
- Package is no longer `"private"`; npm metadata (license, repository, issues,
  keywords) added. Version bumped 1.1.9 → **1.2.0**.
- The UI now starts with `https://example.com` instead of the maintainer's
  production site. The bundled brand profile is labelled explicitly as a
  worked example; dynamic profile loading is on the roadmap.
- `npm run verify` / `INSTALL.bat` now report the release-integrity gate as
  `[NOT_RUN]` in a plain source checkout (no generated
  `PACKAGE_MANIFEST.sha256` / `PACKAGE_PROVENANCE.json`) instead of failing.
  Release packages that carry the artifacts still enforce it fail-closed.
- Older internal audit handoffs/release notes moved from the repository root
  into `docs/history/`.

### Security
- Dev-only dependency bumps for advisories published after the r24 package:
  `vite` 7.3.6 → 7.3.7 (launch-editor, Windows), `concurrently` 9.2.4 → 9.2.5
  (`shell-quote` command injection). Production dependencies reported
  0 known vulnerabilities at audit time.

### Fixed
- Fix Bridge binding now canonicalizes project paths before HMAC signing, so
  Windows 8.3 short names (for example `RUNNER~1`) or alias paths cannot make
  a same-directory package fail with `SOURCE_PROJECT_MISMATCH`. Directory seals
  signed before the target directory is created remain stable. The r14
  regression fixtures canonicalize their temp root for the same reason, so
  their concurrency injections match production paths on Windows runners.
- `scripts/runtime-smoke.mjs` used selectors that never matched the shipped
  UI (a heading named `Visual QA Browser`, although the product name is brand
  text and the H1 is «Проверка сайта без ложного PASS.»; and an exact
  `Deep Visual` button name, although the workflow card's accessible name
  includes its badge and description). The pre-existing r24 smoke failures are
  fixed to assert the real heading/brand and to select the workflow card by
  content.

### Notes
- Windows end-to-end verification of the public tree
  (`INSTALL.bat` → `START.bat` → full audit) is required before tagging.
  During preparation, the complete `npm run verify` gate passed on Linux with
  Node 22.19 — static contracts, strict typecheck, all 163 tests, production
  build and the Chromium runtime smoke — with the release-integrity step
  honestly reported as `[NOT_RUN]` for a source checkout. A Linux result is
  never presented as a Windows PASS.

## [1.1.9] — private Windows packages r1–r24 (summary)

- Evidence-driven audit engine: visual, responsive, forms, interactions,
  runtime, accessibility (axe-core), technical SEO, passive security,
  performance (Lighthouse, isolated worker since r21).
- AI Art Director advisory layer kept strictly separate from technical verdicts.
- Visual regression against approved local baselines; safe user scenarios.
- ChatGPT Fix Bridge (r14): fail-closed fix-package import with fingerprint,
  per-file SHA-256, installation-sealed backup and resumable rollback.
- Runtime hardening: scheduler/watchdog, crash-recovery `NOT_VERIFIED`,
  startup self-heal (r22), strict-TypeScript baseline (r23),
  Lighthouse test-boundary fix (r24).

Details: `docs/history/README-v1.1.9-r24.md` and `docs/history/`.
