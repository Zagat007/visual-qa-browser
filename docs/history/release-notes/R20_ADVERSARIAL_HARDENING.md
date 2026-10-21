# r20 — Adversarial hardening

Visual QA Browser v1.1.8 / r20 is a minimum-change hardening release over r19 after a second adversarial audit of the actual release ZIP.

## Confirmed defects fixed

1. **Visual regression compile blocker** — removed duplicate `const page` declaration that would fail TypeScript/build.
2. **Safe Mode HTTP allowlist** — only GET/HEAD/OPTIONS are allowed. WebDAV/custom methods such as PROPFIND/MOVE/MKCOL fail closed.
3. **Destructive read-like actions** — destructive URL heuristics are applied to GET and HEAD and recognize executable/action suffixes while preserving safe history/help pages.
4. **Special-use address coverage** — IPv4/IPv6 loopback, private, link-local, documentation, benchmarking, multicast, site-local, translation and transition ranges used by SSRF bypasses are blocked.
5. **Candidate/verdict separation** — clipping and small-control candidates cannot elevate the target verdict without confirmed evidence.
6. **Effective touch targets** — checkbox/radio target measurement uses only actually clickable associated labels; `pointer-events:none` labels do not inflate the activation surface.
7. **Dynamic lazy-load completeness** — warmup rechecks live document height until a stable bottom is reached; dynamic/infinite pages exhaust the bounded budget and become incomplete rather than false PASS.
8. **Evidence schema v3** — full-page images are viewport context, not exact issue proof; exact responsive evidence is identified separately.
9. **External evidence privacy** — GPT prompts and registries pass through the same external-artifact sanitizer before ZIP packaging; arbitrary query/hash values are stripped from embedded external URLs.
10. **Runtime evidence truncation** — bounded runtime text is explicitly tracked and degrades completeness instead of silently truncating evidence.
11. **Release integrity** — exact tracked-file-set verification rejects unmanifested release files.

## Verification truth

In the construction environment, package static checks, independent TS/TSX AST parsing and targeted pure regression smokes can be executed. A complete npm dependency install and the authoritative `typecheck -> tests -> build -> production runtime/Chromium smoke` chain require the Windows target environment with Node.js >=22.19.0 and registry access.

Therefore r20 is not declared Windows-runtime verified until `RUN.bat` / `VERIFY.bat` finishes with final PASS on the target machine. The verifier is intentionally fail-closed.
