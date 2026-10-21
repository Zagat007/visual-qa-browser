# Contributing to Visual QA Browser

Thank you for helping! This is a small, evidence-obsessed project. The house
rule is simple: **no evidence → no PASS**. Contributions that make audits more
honest, more reproducible, or easier to verify are the most valuable ones.

## Ground rules

- Use the tool — and any test target — **only where you are authorized**.
  PRs that add active/exploitative "scanning" will be declined; the security
  module stays passive by design.
- One logical change per pull request. Small and reviewable wins.
- By contributing, you agree your contribution is licensed under MIT.

## Development setup

Requirements: **Node.js ≥ 22.19** and npm.

```bash
git clone https://github.com/Zagat007/visual-qa-browser
cd visual-qa-browser
npm ci --ignore-scripts
npx playwright install chromium          # Linux: npx playwright install --with-deps chromium
npm run build
npm start                                  # http://127.0.0.1:4210
```

On Windows you can instead run `INSTALL.bat` once, then `START.bat`.

For a dev loop with hot reload: `npm run dev` (API + Vite UI).

## Before you open a PR

```bash
npm run typecheck
npm test
npm run static:check
npm run build
```

All four must pass. Notes:

- TypeScript is strict (`strict`, `exactOptionalPropertyTypes`). Do not weaken
  compiler settings to make a change compile.
- Tests use Vitest; browser tests launch a real headless Chromium against
  local fixtures (no live third-party sites).
- `npm run verify` additionally runs the runtime smoke test. In a **source
  checkout** the release-integrity step reports `[NOT_RUN]` by design — do
  **not** commit generated `PACKAGE_MANIFEST.sha256` /
  `PACKAGE_PROVENANCE.json`; they are release-package artifacts.
- Dependencies are pinned to exact versions intentionally. If you bump one,
  say why (advisory link if security-related) and update `package-lock.json`
  via `npm install`, never by hand-editing the lockfile.

## Where things live

| Area | Path |
|---|---|
| Audit engine (modules, orchestrator, reporting) | `audit-engine/` |
| Local API + job manager + Fix Bridge backend | `app/backend/` |
| React command-center UI (Russian; English i18n wanted!) | `app/frontend/` |
| Viewport matrix & brand profiles | `configs/` |
| Tests | `tests/` |

## Good contributions

- A new or better **passive check** with tests proving it fires *and* stays silent.
- Fixes with a failing-before / passing-after test.
- Documentation: English UI strings, translations, clearer install paths.
- Fixture pages that reproduce tricky layout/runtime bugs.

Starter tasks are listed in
[docs/GOOD_FIRST_ISSUES.md](docs/GOOD_FIRST_ISSUES.md) and labelled
`good first issue`. If a change touches Safe Mode, the URL policy, redaction,
or the Fix Bridge, please open an issue first so we can agree on the threat
model before code is written.

## Reporting bugs

Use the bug template. Include your OS, Node version, the audit configuration,
and — crucially — whether the verdict shown was PASS / ISSUE / PARTIAL /
NOT_VERIFIED. Screenshots or a public reproduction URL you control help a lot.
Remove personal data from evidence before attaching it.

## Maintainer commitments

- First response on new issues/PRs within 7 days whenever realistically possible.
- Review comments explain *what* to change and *why*.
- Every merged contributor is credited in the release notes.
