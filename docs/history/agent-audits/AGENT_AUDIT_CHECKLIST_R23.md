# r23 agent checklist

- [ ] Fresh extraction has no `dist` and no `node_modules`.
- [ ] `START.bat` directly triggers the verified first-launch pipeline.
- [ ] `PACKAGE_INTEGRITY PASS` before dependency installation.
- [ ] `STATIC_SANITY PASS`.
- [ ] `npm run typecheck` completes with zero TypeScript errors.
- [ ] Lighthouse worker IPC callback is explicitly typed (`Error | null`).
- [ ] Optional fetch AbortSignal is never passed as explicit `undefined`.
- [ ] Vitest completes successfully.
- [ ] Production build completes successfully.
- [ ] Runtime smoke completes successfully.
- [ ] r21 Lighthouse cancel/reap behavior still passes.
- [ ] `STOP.bat` kills only the owned instance tree.
- [ ] Final Windows VERIFY reports PASS.
