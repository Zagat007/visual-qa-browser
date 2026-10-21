# AI ART DIRECTOR — architecture / guardrails v1.1.4 r16

## Truth domains

TECHNICAL QA = deterministic/observable facts and technical verdict.
AI ART DIRECTION = advisory professional judgment against an explicit rubric.

Technical status is finalized before Art Direction runs and is never mutated by AI output.

## Providers

- `MANUAL`: local evidence/prompt/Image Review Board; no external upload.
- `OPENAI`: explicit opt-in only when **both** `OPENAI_API_KEY` and `OPENAI_ART_DIRECTOR_MODEL` exist in the process environment.

No model ID is hard-coded. Provider failure is isolated from Technical QA.

## UNTRUSTED DATA / prompt injection

Audited website text and screenshots are untrusted evidence. Trusted review rules are sent separately from website content. Instructions found inside headings, CTA, DOM text, alt text or screenshots must never be executed as provider instructions.

## Evidence minimization / privacy

External evidence:
- redacts sensitive path segments;
- strips query/hash from page/image URL evidence;
- replaces data/blob URLs with redacted markers;
- masks text secrets;
- blocks private/auth/session/magic-link targets;
- blocks external multimodal upload when likely email/phone PII is detected in rendered DOM.

There is no claim of screenshot-level PII blur. Visually embedded PII on a public screenshot remains a residual risk. Private/auth external review therefore remains disabled.

## Cancellation / bounds

External provider request inherits the audit AbortSignal and also has a mode-specific timeout. Image count, aggregate image bytes and max output tokens are bounded.

## Rubric

Full rubric weights:
- Visual hierarchy 15
- Typography 10
- Spacing & rhythm 10
- Image quality 10
- Image semantic fit 10
- Image variety 10
- Composition 10
- Brand consistency 10
- Premium perception 10
- Conversion presentation 5

Overall is computed locally. With partial layers, disabled score dimensions are `N/A` and overall is normalized only across enabled weighted dimensions. If selected layers contain no weighted dimension, overall = `N/A`.

Report displays /100 and /10. These are advisory rubric outputs, not objective measurements.

## Recommendation gate

Provider findings are validated and filtered for:
- selected layer;
- evidence presence;
- confidence/priority validity;
- non-generic/actionable wording;
- deduplication/root cause clustering;
- identity-recognition claims;
- unsupported numeric conversion promises.

LOW confidence cannot be promoted above OPTIONAL_POLISH.

## Coverage honesty

- Cross-section requires enough semantic sections.
- Cross-page/whole-site requires evidence from multiple URLs; current single-target workflow reports PARTIAL / NOT VERIFIED instead of fabricating site-wide coverage.
- Before/After is implemented as a separate local Visual Regression module with an immutable approved baseline. Art Director may comment on evidence, but pixel differences remain REVIEW candidates and never become automatic BUGs.

## Human decision

Accept / Reject / Ignore / Save for later is local report state only. It never mutates the audited site.
