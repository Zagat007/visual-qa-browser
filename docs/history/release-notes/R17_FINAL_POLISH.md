# r17 — Final premium polish

r17 is a minimum-change polish release on top of r16. It does not change the audit architecture or verdict model.

## Closed in r17

- Fixed a real 320–390 px responsive defect where the Fix Bridge header was squeezed by its tool/status rail and wrapped almost word-by-word.
- Fix Bridge header now stacks cleanly on narrow screens; help/status controls remain readable and do not force the title into a narrow column.
- Increased contrast of secondary muted text and the primary navigation index/secondary line.
- Increased descriptive microcopy size on narrow screens while keeping compact metadata/badges dense.
- Revalidated no horizontal overflow at 320, 360, 390, 430, 768, 820, 1024, 1180, 1280, 1440, 1600 and 1920 px in the static rendered UI harness.
- Fix Bridge tooltip remains inside the viewport at 320 and 390 px; the header title keeps >88% of panel width on narrow screens.

## Release truth

- Package/static integrity can be verified in non-Windows environments.
- Target Windows runtime remains **NOT VERIFIED** until `INSTALL.bat` / `VERIFY.bat` succeeds on Windows 10/11 with Node >=22.19.0.
- Historical r16 evidence remains useful history but is not acceptance evidence for r17.
