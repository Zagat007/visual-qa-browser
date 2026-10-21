# Visual QA Browser

**Локальная evidence-driven QA-станция для проверки сайтов.**
Настоящий отрисованный браузер (Chromium через Playwright), девять модулей
аудита и отчёт, где каждый подтверждённый дефект опирается на доказательства —
скриншоты и машинные JSON. **Нет доказательств → нет PASS.**

![Командный центр Visual QA Browser](docs/images/ui-home.png)

## Что проверяет

- **Visual / Responsive** — скриншоты секций и полной страницы, матрица
  viewport, свип ширины 320–1920, геометрия переполнения и наложений.
- **Forms / Interactions** — поля, подписи, touch-targets; только безопасные
  действия, опасные шаги — `SKIPPED_SAFELY`.
- **Runtime** — ошибки консоли и сети с отредактированными доказательствами.
- **Accessibility** — axe-core; неполное покрытие честно снижает вердикт.
- **SEO** — технические мета, robots.txt, sitemap, soft-404.
- **Passive Security** — строго пассивно: HTTPS, HSTS, CSP, `nosniff`,
  Referrer-Policy, флаги cookies.
- **Performance** — Lighthouse в изолированном процессе: 3 холодных прогона + медиана.
- **Visual regression** — сравнение с утверждённым локальным эталоном (различия —
  кандидаты на ручной просмотр, не автоматические BUG).
- **AI Art Director** — отдельная advisory-оценка визуального качества; факты
  и вкус не смешиваются. **AI Fix Bridge** — безопасный импорт исправлений от ИИ
  с бэкапом и откатом, без исполнения кода проекта.

## Быстрый старт (Windows)

Требуется **Node.js ≥ 22.19**.

```bat
git clone https://github.com/Zagat007/visual-qa-browser
cd visual-qa-browser
INSTALL.bat
START.bat
```

Интерфейс откроется локально на `127.0.0.1:4210`. Проверяйте только свои
сайты или те, на аудит которых у вас есть разрешение.

## Linux / macOS

```bash
npm ci --ignore-scripts
npx playwright install chromium   # Linux: --with-deps
npm run build
npm start
```

## Документация

- Полный справочник функций: [docs/FUNCTIONS_RU.txt](docs/FUNCTIONS_RU.txt)
  (открывается и из интерфейса).
- Английская версия и архитектурные документы: [README.md](README.md).
- Безопасность: [SECURITY.md](SECURITY.md) · Участие: [CONTRIBUTING.md](CONTRIBUTING.md) ·
  Планы: [ROADMAP.md](ROADMAP.md).

## Лицензия

[MIT](LICENSE) © 2026 Zagat007
