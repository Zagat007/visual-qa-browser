# r22 — first-run startup self-heal

Visual QA Browser v1.1.9 / r22 fixes a Windows first-launch UX defect found after r21 packaging: `START.bat` could stop with `Application is not built. Run VERIFY.bat or INSTALL.bat first.` on a clean extracted source package.

## Root cause

r21 treated `START.bat` as a fast path for an already verified/built installation, while users reasonably treated it as a normal application launcher. The release therefore exposed two different entry-point semantics.

## r22 behavior

- `START.bat` is now a valid first-run entry point.
- If `dist/server/index.js` is absent, `START.bat` delegates exactly once to the existing verified `RUN.bat` pipeline.
- `RUN.bat` remains the canonical install/verify/build path and still blocks launch on verification failure.
- A recursion guard (`VQB_START_BOOTSTRAP`) prevents an infinite START -> RUN -> START loop if preparation fails to create the build.
- After the first successful build, `START.bat` remains the fast startup path and does not repeat verification unnecessarily.
- r21 Lighthouse child-process isolation, cancellation, watchdog and owned process-tree cleanup are unchanged.

## Required Windows acceptance

1. Extract r22 into a brand-new folder with no `node_modules` and no `dist`.
2. Double-click `START.bat` directly.
3. It must print the first-launch bootstrap message, run the verified install/build pipeline, then open the UI without asking the user to manually choose `VERIFY.bat` or `INSTALL.bat`.
4. Close via `STOP.bat`, then double-click `START.bat` again. The second launch must use the fast path.
5. Repeat the r21 Lighthouse hang/cancel test to ensure startup changes did not regress isolation.

NOT RUN / NOT VERIFIED is never PASS.
