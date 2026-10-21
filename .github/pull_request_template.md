## What & why
<!-- Problem, change, linked issue (e.g. Closes #12). One logical change per PR. -->

## Evidence
<!-- This project is evidence-driven: what proves the change works?
     Failing-before / passing-after test, screenshot, log excerpt, or a
     fixture that reproduces the bug. -->

## Checklist
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run static:check` passes
- [ ] `npm run build` passes
- [ ] No generated release artifacts committed (`PACKAGE_MANIFEST.sha256`, `PACKAGE_PROVENANCE.json`, `dist/`, `reports/`)
- [ ] Safe Mode / URL policy / redaction behaviour unchanged — or the change was discussed in an issue first
- [ ] Docs updated where user-visible behaviour changed
