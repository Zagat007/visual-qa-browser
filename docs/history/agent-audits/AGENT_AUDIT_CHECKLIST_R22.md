# r22 agent checklist

- [ ] Fresh extraction has no `dist` and no `node_modules`.
- [ ] `START.bat` directly triggers first-launch bootstrap.
- [ ] `START.bat` delegates to `RUN.bat` instead of telling the user to run VERIFY/INSTALL manually.
- [ ] Failed preparation cannot recurse START -> RUN -> START forever.
- [ ] Successful first launch reaches the UI.
- [ ] Second `START.bat` launch uses the fast path.
- [ ] `RUN.bat` still blocks launch after verification failure.
- [ ] `STOP.bat` still kills only the owned instance tree.
- [ ] Lighthouse isolation/cancel/reap behavior from r21 still passes.
- [ ] `PACKAGE_INTEGRITY PASS` before installation/build.
- [ ] Full Windows VERIFY passes.
