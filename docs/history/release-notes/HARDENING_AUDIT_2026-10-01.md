# Hardening audit — 2026-10-01

## Итог

Текущий пакет прошёл многосторонний source/architecture audit. Финальный Windows runtime PASS после последних hardening-исправлений должен быть подтверждён `VERIFY.bat` на целевой Windows-машине.

## Подтверждённые дефекты и исправления

1. **Cancellation race / P1**
   - Было: `RUNNING` публиковался до регистрации AbortController; быстрый Cancel мог попасть в окно гонки.
   - Исправлено: controller регистрируется до публикации `RUNNING`.
   - Regression: `tests/job-manager.test.ts` содержит сценарий cancellation и запрещает превращать отменённый audit в PASS.

2. **Coverage truncation / P1**
   - Риск: усечённый geometry/images/runtime/forms/interactions evidence не должен допускать FULL PASS.
   - Исправлено: truncated evidence централизованно превращается в `incompleteReasons`; verdict становится `PARTIAL`.

3. **Candidate vs confirmed defect / P1**
   - Исправлено: `SPA_FALLBACK` остаётся review-candidate и не повышает target verdict до ISSUE; `SOFT_404` повышает.
   - Interaction automation failure считается evidence gap / NOT VERIFIED, а не багом сайта.

4. **P0 severity gap / P2**
   - Исправлено: main-document HTTP 5xx может формироваться как P0 в defect registry.

5. **Root-cause clustering / P2**
   - Исправлено: report формирует `RC-xxx`, `root-causes.json` и связывает BUG-проявления с вероятной первопричиной.

6. **Premature RELEASE label / P2**
   - Исправлено: Chromium-only maximum workflow называется `Максимальный live-аудит`, а не полноценный RELEASE preset.

7. **Package provenance / P2**
   - `INSTALL.bat` после успешного selftest пересоздаёт `PACKAGE_PROVENANCE.json` уже с фактическим Windows Node и package-lock hash.
   - Source package без lockfile не притворяется reproducible release.

8. **Windows verification usability / P3**
   - Добавлен `VERIFY.bat`: selftest + provenance refresh + `final-verification.log`.

## Evidence

- Последний пользовательский Windows-прогон до cancellation fix: **48/49 tests PASS**; единственный FAIL — cancellation lifecycle.
- После этого root cause cancellation устранён в исходниках.
- Текущая container-среда: TypeScript/TSX syntax parse **60 файлов / 0 parse errors**.
- Static sanity: **63+ required source contracts проходят**, единственный ожидаемый blocker в container — отсутствие `package-lock.json` из-за недоступного npm registry.

## Финальный gate на Windows

1. `INSTALL.bat`
2. `VERIFY.bat`
3. В `final-verification.log` должен быть `[PASS] All selftests passed.`

Без этого post-fix Windows runtime остаётся `NOT VERIFIED`, даже если source audit чистый.
