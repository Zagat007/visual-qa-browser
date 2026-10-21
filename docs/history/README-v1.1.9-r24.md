> **Архив / Archive.** This is the README shipped with the private Windows package
> v1.1.9-r24, preserved for historical reference. The current public documentation
> starts at the repository-root `README.md`; relative links below reflect the
> original package layout and some may be outdated.

# Visual QA Browser v1.1.9 — LIGHTHOUSE TEST ISOLATION FIX r24

Текущий релизный handoff: [docs/R24_LIGHTHOUSE_TEST_BOUNDARY.md](docs/R24_LIGHTHOUSE_TEST_BOUNDARY.md). r24 сохраняет startup self-heal из r22, Lighthouse isolation из r21 и strict-TypeScript fixes из r23; исправлен integration-test, который после изоляции Lighthouse ошибочно пытался наблюдать Vitest mocks через границу дочернего процесса.

Локальная Windows QA-станция для evidence-driven аудита сайтов. Версия объединяет technical QA, runtime/scheduler hardening и отдельный **AI Art Director** advisory-слой.

## Что входит

### Visual regression и safe scenarios — r15/r21
- Утверждение завершённого аудита как локального эталона. Последующие снимки сравниваются по viewport при совпадении URL, ОС, версии Chromium и параметров экрана. Красная карта различий и доля изменившихся пикселей требуют ручного просмотра; пиксельные отличия не становятся BUG автоматически.
- Явные пользовательские сценарии из 1–12 шагов: проверка видимости и текста, открытие безопасного меню или вкладки, выбор checkbox/radio и ввод вымышленных тестовых значений. Для каждого успешного шага сохраняется скриншот, для запуска — локальный trace. Сценарии можно скачать и открыть как JSON.
- После загрузки страницы Safe Mode блокирует сеть для действий сценария. Опасный или непроверенный шаг помечается `SKIPPED_SAFELY`/`NOT_VERIFIED`; полный `PASS` ему не присваивается. Не используйте настоящие персональные данные.

### Technical QA
- Русский Command Center и русский `report.html`.
- Visual/Responsive/Forms/Interactions/Runtime/Accessibility/SEO/Passive Security/Performance.
- QUICK / STANDARD / DEEP / SELECTED / CUSTOM; breakpoint −1/0/+1 и responsive sweep.
- Geometry, overflow, clipping/overlap candidates, typography, image/crop evidence, section/full-page screenshots.
- axe-core, Technical SEO, passive delivery/security checks, Lighthouse 3 cold runs + median.
- ЭКО / НОРМАЛЬНЫЙ / FAST / MAX с hardware safety cap.
- Safe Mode: non-destructive policy, private-network/WebSocket blocking and evidence.
- `defects.json` (BUG), `candidates.json` (CAND), `root-cause-hypotheses.json`, `gpt-fix-prompt.txt`, weighted progress, cancellation, history.
- `gpt-evidence.zip` со списком BUG-ID, манифестом покрытия и доступными скриншотами; результат аудита можно передать GPT вместе с исходниками сайта. Кнопка копирования передаёт только текст.


### Lighthouse isolation — r21
- Lighthouse больше не выполняется в HTTP/control-plane Node-процессе. Каждый performance audit запускается в отдельном дочернем процессе.
- Если Lighthouse/Chrome зависает, основной UI/API остаётся доступным; «Остановить аудит» отменяет job независимо от состояния worker.
- Родительский процесс имеет независимый heartbeat watchdog и может PID-точно завершить весь Lighthouse/Chrome process tree. Чужие Node/Chrome процессы не трогаются.
- Жёсткий timeout одного cold run завершает performance как неполный и не запускает ещё два заведомо бесполезных timeout-прогона. Аудит продолжает формирование отчёта.
- Подробнее: `docs/R21_LIGHTHOUSE_ISOLATION.md`.

### Runtime hardening v1.1.1
- Interrupted `RUNNING` job после crash/restart не реанимируется и не блокирует очередь: получает `NOT_VERIFIED`.
- Scheduler использует реальные `activeIds`, а не хрупкий running-counter.
- No-progress watchdog освобождает очередь после зависшего аудита.
- Checkpoint state пишется атомарно через temp → rename.
- Stale job `404` очищается в UI вместо вечного `0%` polling.
- `/api/diagnostics/jobs` + `DIAGNOSE.bat`.
- Каждая установка имеет `instanceId`; Node запускается с `--vqb-instance=<id>`.
- `STOP.bat` может безопасно завершить даже зависший backend без health-response, но только при совпадении PID + command line + installation marker. После проверки он завершает именно этот owned process tree (`/T /F`), включая его Lighthouse/Chrome descendants; чужой `node.exe` не убивается.

## AI Art Director

Technical QA = факты. AI Art Direction = профессиональная advisory-оценка. Эти truth domains не смешиваются.

- Manual / ChatGPT export без внешнего AI.
- Optional OpenAI multimodal provider через Responses API, strict structured output, `store:false`.
- ECONOMY / STANDARD / DEEP.
- Premium Quality, Image Quality & Variety, Semantic Image Fit, Visual Hierarchy, Typography & Spacing, Emotional Fit, Conversion, Cross-section, Cross-page, Mobile, Desktop.
- AUTO / MELODY4YOU / GENERIC brand profiles.
- Локальная прозрачная rubric /100 + /10; выключенные dimensions = `N/A`, overall нормализуется только по включённым weighted dimensions.
- Confidence: HIGH / MEDIUM / LOW.
- Priority: STRONGLY_RECOMMENDED / SHOULD_CONSIDER / OPTIONAL_POLISH.
- Evidence-first recommendation filter, deduplication, `ROOT-ART-*`, anti-generic, identity-claim guard, numeric-conversion-claim guard.
- `image-review-board.html`, `art-direction-evidence.json`, `art-direction-prompt.txt`, `art-direction.json`, `gpt-premium-fix-prompt.txt`.
- Human override в отчёте: Принять / Отклонить / Игнорировать / На потом. Сайт никогда автоматически не меняется.

### Privacy / external AI

Automatic OpenAI review требует **обе** локальные переменные среды:
- `OPENAI_API_KEY`
- `OPENAI_ART_DIRECTOR_MODEL` — vision-capable Responses API model ID, выбранный пользователем.

Модель намеренно не захардкожена. Ключ не вводится в UI и не сохраняется в отчёте.

Перед external AI:
- private/auth/session/magic-link URL блокируется;
- likely email/phone PII в rendered DOM блокирует upload;
- URL evidence удаляет query/hash и data/blob payloads;
- website text маркируется как `UNTRUSTED WEBSITE EVIDENCE`;
- parent audit cancellation немедленно отменяет AI request;
- image-count / byte / output-token / timeout limits обязательны.

Screenshot-level PII blur пока не реализован. Поэтому visually embedded PII на публичном screenshot — остаточный риск; private/authenticated external AI review отключён.

## Windows — чистая установка r24

Не накладывайте эту версию поверх старых копий.

1. Распакуйте архив в **новую** папку, например `C:\Visual-QA-Browser-v1.1.9-r24`.
2. Если старый экземпляр работает, остановите его через `STOP.bat` из старой папки.
3. Запустите **`START.bat`** или **`RUN.bat`**. На чистой установке `START.bat` сам передаст управление проверенному `RUN.bat`, который установит зависимости, соберёт и проверит приложение.
4. В процессе первой проверки вывод идёт на экран и в `final-verification.log`. После FAIL запуск блокируется.
5. После первой успешной сборки `START.bat` работает как быстрый запуск без повторного полного VERIFY. Для диагностики — `DIAGNOSE.bat`; для остановки — `STOP.bat`.

Установка требует интернет для npm/Playwright. `INSTALL.bat` и `VERIFY.bat` доступны отдельно; `VERIFY.bat` сохраняет окно открытым при двойном клике. Проверка runtime использует временную папку и свободный порт, не меняет существующие заказы.

### Передача результатов в GPT (r10)

1. После аудита скачайте `gpt-evidence.zip` и скопируйте подходящий промпт кнопкой в приложении или из `gpt-fix-prompt.txt` / `gpt-premium-fix-prompt.txt`.
2. В том же чате прикрепите ZIP. Если GPT не читает ZIP, распакуйте его и приложите `defects.json`, `evidence-manifest.json` и скриншоты по нужным BUG-ID. Проверьте на скриншотах личные данные.
3. Для исправления кода предоставьте GPT исходники проверяемого сайта. Аудит публичного URL не даёт доступ к локальному репозиторию. Попросите GPT сначала перечислить реально прочитанные BUG-ID и изображения.
4. `defects.json` содержит BUG, `candidates.json` содержит CAND. Кандидаты и группы RC — гипотезы; их нельзя исправлять без воспроизведения. Визуальное качество, обрезанные лица и истинную первопричину нужно подтвердить по изображениям и исходникам.

Калибровка детекторов: `docs/R10_ACCURACY_AUDIT.md`; воспроизвести командой `npm run benchmark:accuracy` (результат в `reports/accuracy-benchmark/`). Точное подтверждение responsive-находок: `docs/R9_EXACT_RESPONSIVE_EVIDENCE.md`. Матрица 14 аудитов: `docs/R8_REQUIREMENTS_AUDIT.md`. Windows r10 здесь не проверен.

### Что исправлено в r5

- Устранено воспроизведённое зависание перед первой навигацией Lighthouse: он получает заранее подготовленную вкладку Safe Mode. Запрос из неподготовленной вкладки блокируется сразу; сетевые ограничения сохранены.
- Один прогон Lighthouse ограничен 120 секундами. Отмена прерывает ожидание даже при зависшей операции библиотеки. Сбой измерения получает FAILED / PARTIAL и не даёт performance PASS.
- Завершение собственного Chrome на Windows выполняется асинхронно, с лимитом 5 секунд; синхронный `taskkill` больше не вызывается при отмене. Соединения, оба лог-файла и отдельный временный профиль очищаются.
- Во время Lighthouse видны номер прогона, фаза, прошедшее время и лимит. Heartbeat не увеличивает процент; поздний progress отменённого задания игнорируется.
- Проверен полный FULL STANDARD / FAST: 6 viewport, 9 модулей, Manual STANDARD, 3 реальных Lighthouse-прогона и отчёты. Проверены реальная отмена, ошибки guard, тайм-ауты, cleanup и продолжение очереди. Контрольная страница и тестовый транспорт: это не аудит произвольного сайта.
- Пользователь подтвердил успешный Windows VERIFY r4 на Node 24.15.0 и завершение QUICK без performance. Windows r5 ещё требует собственного RUN/VERIFY.

### Сохранённые исправления r4

- По Windows-логу r3: 85 тестов прошли, но Vite упал при `mkdir .vite-build/assets`. Сборка была скомпилирована, запись файлов не завершилась.
- Vite теперь генерирует bundle в памяти (`write: false`). Отдельный writer создаёт каталоги по одному уровню и последовательно пишет HTML/JS/CSS/бинарные assets. При неудачной записи или финальном rename предыдущая сборка сохраняется.
- Regression-тест воспроизводит `ENOENT` на прежнем асинхронном пути Rollup и проверяет, что новый путь всё равно создаёт реальный HTML с рабочими JS/CSS-ссылками.
- Обновлены Vite 7.3.6, Vitest 4.1.11, concurrently 9.2.4 / shell-quote 1.9.0, Playwright 1.55.1. Новый `package-lock.json` включён; `npm audit` сообщает 0 известных уязвимостей на 02.10.2026. `npm audit fix --force` не применялся.
- Подробности и первичные advisory URL: `AUDIT_RU.txt`. Машинные результаты npm: `audits/dependencies-before.json` и `audits/dependencies-after.json`.

### Сохранённые исправления r3

- Исправления r1/r2 интегрированы в рабочие исходники. Отдельного payload и наложения патча больше нет.
- Проверки типов request body без ошибки TS2339.
- Отмена провайдера до чтения, во время чтения, перед fetch и после получения ответа; реальное чтение файлов получает AbortSignal.
- Лимит очереди резервируется до асинхронных записей: 12 одновременных API-запросов больше не обходят предел в 8 jobs.
- Все тесты JobManager ждут завершения worker/checkpoint cleanup до удаления временных папок.
- Тест публикации frontend использует собственную временную папку и не стирает установленный `dist`.
- Chromium/context закрываются при ошибках metadata, Safe Mode и отмене во время launch.
- Проверка запуска не ограничивается unit tests: production backend, API, crash recovery, UI-контролы и render проверяются Chromium.
- Node floor проверяется во всех входных сценариях; диагностика занятого порта показывает правильный PID.
- Убраны два ненужных backdrop-filter на тёмных панелях: они давали чёрные compositor-области при длинных снимках; фон, цвета и структура сохранены.
- Source provenance не зависит от логов, `.vite-build` и производного checksum manifest.

Windows launcher/runtime PASS подтверждается только собственным запуском RUN/VERIFY на Windows. Проверка сборки и runtime в Linux не заменяет Windows evidence.

Для автоматического AI review запустите `START.bat` из PowerShell, где заданы обе переменные, например:

```powershell
$env:OPENAI_API_KEY="..."
$env:OPENAI_ART_DIRECTOR_MODEL="<vision-capable-model-id>"
.\START.bat
```

Manual / ChatGPT export работает без API key.

## Честные ограничения

- Source/trusted static audit требует отдельного input исходников.
- Visual regression реализован локально через утверждённый immutable baseline; изменения остаются REVIEW-кандидатами и требуют ручной оценки.
- Full-site crawler/multi-page inventory не реализован; Cross-page на single URL = PARTIAL / NOT VERIFIED.
- Firefox/WebKit full release scope не реализован; Playwright WebKit ≠ real Safari PASS.
- Private/auth external AI отключён до доказанного screenshot-redaction/session workflow.
- Lighthouse = LAB, не field/RUM.
- Complete SSRF immunity не заявляется: application-level DNS/IP checks не заменяют network-layer isolation/IP pinning.
- r24 поставляется как source package: **`START.bat` и `RUN.bat` обе являются корректными точками первого запуска**. `START.bat` при отсутствии сборки автоматически передаёт управление каноническому `RUN.bat`. Windows runtime PASS допустим только после успешного полного verification на целевой машине.

## ChatGPT Fix Bridge (r14)

После аудита Visual QA Browser может собрать **один source-aware ZIP для ChatGPT**: технический evidence, BUG/CAND/root-cause данные и безопасный snapshot исходников. Секреты, зависимости и generated output исключаются.

Возвращённый ChatGPT `VQB-FIX-*.zip` (schemaVersion 2) проходит fail-closed проверку manifest, fingerprint, привязки к каноническому пути проекта и per-file SHA-256. Старые r13 Fix ZIP нужно создать заново из r14. Затем выполняется только **неисполняющий precheck**: структурные проверки не запускают project scripts, build, tests или исходный код. Только после него создаётся installation-sealed backup и выполняются разрешённые `replace/create`. Rollback сохраняется между перезапусками и проверяет хэши backup/target перед восстановлением.

`replace` разрешён только для файлов, реально вошедших в экспортированный source snapshot; `create` — только для поддерживаемых source-файлов. Secret/credential-конфиги и high-confidence литеральные секреты исключаются. Fix Bridge не запускает автоматически код проекта именно потому, что временная копия не является OS sandbox. Runtime/type/lint/test/build — отдельный доверенный verification gate.

Программа не отправляет исходники во внешний AI автоматически и не даёт локальному AI права менять проект. Live re-check имеет смысл только после загрузки исправлений на хостинг.

## Independent agent audit package

For a clean external review of this release, use:

- `AGENT_AUDIT_HANDOFF_R24.md` — current r24 Windows verification scope;
- `AGENT_AUDIT_HANDOFF_R23.md` — retained strict-TypeScript baseline;
- `AGENT_AUDIT_HANDOFF_R22.md` — retained startup self-heal baseline;
- `AGENT_AUDIT_HANDOFF_R21.md` — retained Lighthouse isolation architecture baseline;
- `AGENT_AUDIT_PROMPT_R24.txt` — current ready-to-paste independent audit prompt;
- `AGENT_AUDIT_CHECKLIST_R24.md` — current r24 execution checklist;
- `AGENT_AUDIT_CHECKLIST_R23.md` — retained r23 strict-TypeScript checklist;
- `AGENT_AUDIT_CHECKLIST_R22.md` — retained r22 startup checklist;
- `AGENT_AUDIT_CHECKLIST_R21.md` — retained r21 Lighthouse checklist;
- `docs/history/` — previous r13 audit materials for historical comparison only.

The independent agent must treat previous PASS statements as untrusted claims and reproduce them from the extracted package/runtime.
