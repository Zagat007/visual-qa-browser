> **HISTORICAL v1.1.1 SNAPSHOT.** This file is retained for audit history. Current release status is defined by `docs/R21_LIGHTHOUSE_ISOLATION.md` and `AGENT_AUDIT_HANDOFF_R21.md`.

# HISTORICAL PACKAGE STATUS — pre-r12

The detailed r5/r10 status below is retained for traceability. It records an older r5/r10 state. The r13 verdict that followed is also historical; current status is defined by `R21_LIGHTHOUSE_ISOLATION.md`.

# Visual QA Browser v1.1.1 — package status

Текущая ревизия r10: 35 размеченных Chromium случаев по 7 сигналам выявили и помогли исправить три ложных `zero-size-interactive`. Калибровка и границы: `docs/R10_ACCURACY_AUDIT.md`. Предыдущая точная responsive-проверка: `docs/R9_EXACT_RESPONSIVE_EVIDENCE.md`; 14 аудитов требований: `docs/R8_REQUIREMENTS_AUDIT.md`. Приведённые ниже r5 результаты являются историческими.

Дата: 2026-10-02

## Объединённый scope

- Technical QA core: IMPLEMENTED.
- Runtime queue/recovery/watchdog/diagnostics hardening: IMPLEMENTED.
- AI Art Director advisory module: IMPLEMENTED в public live-scope с Manual fallback и optional external provider.
- Technical verdict и Art Direction verdict/score разделены архитектурно.

## Deep audit fixes v3.0

Закрыты существенные root causes:
1. Crash-recovered `RUNNING` мог занять единственный worker → теперь quarantine `NOT_VERIFIED`.
2. Scheduler зависел от mutable running counter → `activeIds`.
3. Stalled runner мог держать очередь → no-progress watchdog.
4. Stale UI job мог показывать вечные `0%` → 404 clears job.
5. Несколько установок могли конфликтовать на 4210 → PID + deterministic `instanceId` + process marker.
6. Hung backend было трудно безопасно остановить → owned `--vqb-instance` marker позволяет STOP без health.
7. Checkpoint write мог быть частично записан → atomic temp→rename.
8. Recovery test противоречил новой логике → RUNNING и QUEUED recovery cases разделены.
9. External AI не наследовал audit cancellation → parent AbortSignal + timeout.
10. AI model ID был hard-coded → требуется explicit `OPENAI_ART_DIRECTOR_MODEL`.
11. Partial Art layers создавали ложный full score → disabled dimensions = N/A; weighted normalization only on enabled dimensions.
12. AI evidence мог включать signed/image URL query values → external-evidence URL sanitizer удаляет query/hash/data/blob payloads.

## Текущий статус FIXED r5

SOURCE_SNAPSHOT: исходники, фиксированный audited lockfile и готовый dist включены.
Linux Node 24.19.0: strict typecheck, 27 test files / 107 tests, frontend/backend
build и production Chromium UI/API smoke — PASS. npm audit — 0 на 02.10.2026.
Подробности: AUDIT_RU.txt, docs/FINAL_VERIFICATION.md, final-verification.log.

r5: устранён воспроизведённый Lighthouse navigation/guard deadlock; введены
120s/run deadlines, abortable ожидания, асинхронная очистка owned Chrome и
двух лог-дескрипторов, elapsed progress без фиктивного процента. Полный FULL
STANDARD/FAST с 9 модулями, 6 viewport и Manual STANDARD завершён на Linux fixture;
3 real Lighthouse runs и real cancellation проходят. Подробные границы — AUDIT_RU.txt.

Windows r4: пользовательский VERIFY PASS (Node 24.15.0, production/Chromium UI smoke).
Windows performance/r5 остаются NOT VERIFIED до нового RUN/VERIFY на Windows.

Следующие заметки — исторический source-only review v3.0 до r3/r4; они не являются
доказательством готовности r5 и были дополнены фактическими runtime находками.

## Final v3.0 convergence note — 2026-10-02
- Two independent source convergence passes found no new P0/P1/significant P2 after the unified fixes.
- Final adversarial source pass includes AI-output HTML escaping regression, partial-rubric honesty, external URL minimization, scheduler recovery/watchdog and Windows instance ownership.
- Final verdict for the distributable before user Windows evidence remains **NOT VERIFIED (runtime)**, not PASS.

### Late adversarial runtime finding closed
- START no longer discards the owned PID handle when the matching instance exists but its health endpoint is hung. It emits a distinct owned-unhealthy state, invokes STOP.bat only after instance-marker verification, then proceeds to restart.
- Regression/static contracts require this path.
