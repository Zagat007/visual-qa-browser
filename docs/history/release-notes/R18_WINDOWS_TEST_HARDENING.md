# r18 — Windows test hardening

r18 is a minimum-change reliability release on top of r17. Product behavior and the premium UI are unchanged.

## Root causes closed from the first real Windows VERIFY run

- Fixed a Windows-visible race in `tests/job-manager.test.ts`: the test could observe `progressPercent=37` before the runner had installed its release callback, call an undefined callback, and leave the runner blocked. The test now waits for both the progress state and the release callback.
- Increased the job-manager polling allowance from 2 seconds to 5 seconds so normal Windows filesystem/antivirus latency does not create machine-dependent false failures. Assertions and expected states are unchanged.
- Hardened `afterEach` fixture isolation: manager/root arrays are detached before waiting for cleanup, so one failed cleanup cannot poison every later test in the file. Cleanup failure is still reported.
- Clarified the production baseline rejection message to `Нужен завершённый аудит...`, matching the contract that RUNNING/PARTIAL/NOT_VERIFIED cannot become a baseline. No acceptance condition was relaxed.

## Evidence from the user Windows run that led to r18

- Windows 10/11 environment: Node.js 24.15.0.
- `npm ci`: 363 packages installed, 0 vulnerabilities.
- package integrity: PASS (151 manifest files / 150 provenance files).
- static sanity: PASS.
- TypeScript typecheck: PASS.
- 27 test files reached the failing area; all listed suites before the two affected test files passed. Accuracy benchmark reported TP=13 TN=22 FP=0 FN=0.
- The run exposed 1 visual-scenario assertion wording mismatch and one job-manager test race that cascaded into later cleanup failures.

## Acceptance

Run `VERIFY.bat` again on Windows. r18 is accepted only if the complete verification chain continues past tests through build/runtime smoke and ends in the verifier final PASS.
