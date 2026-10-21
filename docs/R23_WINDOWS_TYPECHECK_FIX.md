# r23 — Windows strict TypeScript compile fix

Visual QA Browser v1.1.9 / r23 fixes two compile blockers reproduced by the real Windows `VERIFY` pipeline on Node 24.15.0 after r22 successfully completed package integrity, npm install and static sanity.

## Reproduced failures

1. `app/backend/src/lighthouse-worker-entry.ts`: the `process.send` callback parameter had implicit `any` under `strict` / `noImplicitAny`.
2. `app/frontend/src/App.tsx`: `fetch(..., { signal })` explicitly passed `undefined` while `exactOptionalPropertyTypes` requires an omitted property or `AbortSignal | null`.

## Fix

- The IPC completion callback is explicitly typed as `Error | null`.
- The optional fetch signal is normalized to `signal ?? null`, matching `RequestInit.signal`.
- Static guardrails pin both fixes, but they do not replace the authoritative `npm run typecheck`.

## Acceptance gate

A clean Windows extraction must run `START.bat` (or `RUN.bat`) through the full pipeline and pass, in order: package integrity, static sanity, TypeScript typecheck, Vitest, build, and runtime verification. If any later stage fails, r23 is not accepted and the exact log becomes the next evidence input.
