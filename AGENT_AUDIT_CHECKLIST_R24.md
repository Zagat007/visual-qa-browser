# r24 agent checklist

- [ ] Clean extraction; Node >=22.19.0.
- [ ] `npm run integrity:package` PASS.
- [ ] `npm run static:check` PASS.
- [ ] `npm run typecheck` PASS.
- [ ] `npm test` PASS with all test files.
- [ ] `tests/performance-browser.test.ts` records at least three deterministic fixture requests.
- [ ] Three real cold Lighthouse runs remain valid and report files exist.
- [ ] `tests/performance-isolation.test.ts` still proves cancellation and process reaping.
- [ ] Production `runAudit()` uses isolated `runPerformanceAudit` by default.
- [ ] `npm run build` PASS.
- [ ] runtime smoke PASS.
- [ ] Manual Windows Lighthouse audit can be cancelled while measuring.
- [ ] No orphan Lighthouse/Chrome process remains after cancel/STOP.
- [ ] Any unexecuted item is NOT VERIFIED, never PASS.
