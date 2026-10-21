# r20 independent audit checklist

- [ ] Clean Windows extraction; Node >=22.19.0
- [ ] Package manifest/provenance exact-set integrity PASS
- [ ] `RUN.bat` / `VERIFY.bat` final PASS
- [ ] TypeScript PASS
- [ ] Vitest PASS
- [ ] Build PASS
- [ ] Production server + Chromium UI smoke PASS
- [ ] Safe Mode allows only GET/HEAD/OPTIONS
- [ ] Special-use IPv4/IPv6 blocked
- [ ] Destructive GET/HEAD routes blocked without false-blocking safe history/help pages
- [ ] Candidate findings cannot elevate target verdict
- [ ] Label touch-target semantics verified
- [ ] Dynamic lazy-load completeness verified
- [ ] Evidence manifest schema v3 verified
- [ ] External prompt/JSON URL redaction verified
- [ ] Visual regression compile/runtime verified
- [ ] Fix Bridge apply/rollback adversarial tests PASS
- [ ] No unexplained skipped checks; NOT RUN != PASS
