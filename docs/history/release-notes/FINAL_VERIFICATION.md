> **HISTORICAL v1.1.1 SNAPSHOT.** This file is retained for audit history. Current release status is defined by `docs/R21_LIGHTHOUSE_ISOLATION.md` and `AGENT_AUDIT_HANDOFF_R21.md`.

# HISTORICAL — pre-r12 verification evidence

This document records the older FIXED r5 package. It is not current acceptance evidence. r13 verification is also historical; current acceptance is defined by `R21_LIGHTHOUSE_ISOLATION.md`.

# FINAL VERIFICATION — Visual QA Browser v1.1.1

Дата: 2026-10-02

## Проверенный пакет FIXED r5

Linux, Node 24.19.0, Playwright 1.55.1 / Chromium 140.0.7339.186.

- Static sanity: 89/89 required files, 75 TS/TSX import checks — PASS.
- Strict TypeScript — PASS.
- Vitest 4.1.11: 27 files / 107 tests — PASS, без skip/todo.
- Vite 7.3.6 in-memory bundle + sequential writer + frontend publish + tsup — PASS.
- Production backend/API/recovery/Safe Mode rejection + rendered UI on four viewports — PASS.
- Fresh npm ci from included package-lock.json — PASS; npm audit — 0 known vulnerabilities on 2026-10-02.
- New build tests cover injected Rollup mkdir ENOENT, real HTML/JS/CSS, nested/binary output, cleanup, invalid paths/incomplete output and rollback after rename failure.

Evidence: final-verification.log, audits/runtime-smoke/, audits/dependencies-*.json.
Detailed findings/limits: AUDIT_RU.txt. The archive includes source, lockfile and dist.

## Lighthouse и полный сценарий

- FULL STANDARD / FAST: 6 viewport, все 9 модулей, Manual STANDARD — завершён на детерминированной странице, report создан.
- 3 реальных guarded Lighthouse cold runs, median и HTML — PASS. Это LAB methodology, не field/RUM.
- Реальная отмена Lighthouse во время измерения — PASS (<8s в тесте); собственные временные профили удалены.
- Deadline/guard/cancellation/resource/late-progress/queue regressions — PASS.
- Linux fixture использует Chromium headless shell из Playwright и тестовый --no-sandbox из-за запрета Unix singleton socket в контейнере. Production flags не изменены. DNS/transport подменены в тесте; сетевые политики production остаются включены.

## Windows evidence

r4: пользовательский VERIFY на Node 24.15.0 успешно прошёл selftest, production
server и Chromium UI smoke. Source/lock hashes сохранены в audits/windows-r4-user-success.txt.
Пользователь сообщил блокировку антивирусом старой установки. QUICK с 3 модулями
без Art завершился; r4 smoke не включал Lighthouse.

r5 Windows execution и performance — NOT VERIFIED здесь. Распаковать r5 в новую
папку, остановить старую копию её STOP.bat, запустить RUN.bat. Любой FAIL блокирует
START; итоговые PASS selftest и production smoke должны присутствовать в логе.
Paid OpenAI calls и аудит произвольного live-сайта не выполнялись.

## Runtime regression scenarios, закреплённые тестами/source contracts

- interrupted RUNNING → NOT_VERIFIED, не auto-requeue;
- recovered QUEUED без decryptable target → NOT_VERIFIED, свежая очередь продолжает работу;
- cancellation controller exists before RUNNING publication;
- stalled audit → watchdog timeout → next job starts;
- stale job 404 → UI clears it;
- diagnostics expose queue/active/controller/job summary;
- START binds PID + instanceId + `--vqb-instance` marker;
- STOP never kills generic `node.exe`, but can terminate its own hung marked process;
- external AI honors parent AbortSignal;
- external AI requires explicit key + model;
- technical verdict cannot be mutated by AI Art Direction.
