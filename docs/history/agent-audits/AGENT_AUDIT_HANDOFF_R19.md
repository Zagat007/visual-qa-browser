# Visual QA Browser v1.1.7 r19 — Independent Audit Handoff

Treat all previous PASS claims as untrusted until reproduced. r19 is an evidence-hardening delta over r18.

## Audit priorities

1. Reproduce `PACKAGE_MANIFEST.sha256` / `PACKAGE_PROVENANCE.json` integrity before and after verification.
2. Run the complete Windows chain through `VERIFY.bat`; do not convert NOT RUN into PASS.
3. Adversarially verify GPT evidence schema v2:
   - `defects.json` only BUG-like technical findings; `candidates.json` CAND;
   - `root-cause-hypotheses.json` uses HYP language, not proven-cause claims;
   - `screenshotFiles[].issueIds` never associates nonvisual security/runtime/performance issues merely by viewport;
   - `machine/` contains sanitized security/accessibility/runtime/site/performance/provenance evidence;
   - tall pages (>16,000 px) retain section evidence and do not bloat ZIP with giant full-page PNG;
   - section manifest entries expose useful selectors.
4. Verify target-size false-positive defenses with an 18 px radio inside a >=44 px associated label and a genuinely tiny standalone control. The first must not be flagged by the collector; target-size findings must remain CAND until visually confirmed.
5. Feed implausible Lighthouse values (for example FCP 96,801 ms / LCP 137,089 ms under a 120,000 ms run timeout). The run must become SUSPECT/NOT_VERIFIED and must not generate a trustworthy performance verdict.
6. Confirm repeated image-crop and typography-role candidates deduplicate across viewports while retaining viewport coverage and selector evidence.
7. Confirm Premium GPT output exists only when Art Direction ran.
8. Recheck privacy: query/hash/token data must not leak through machine JSON, prompts or raw Lighthouse core measurement files.

## Required verdict format

For each claim: PASS / ISSUE / PARTIAL / NOT_VERIFIED, with file/line or runtime evidence. Report P0/P1/P2/P3 findings with reproduction, root cause, consequence and minimum safe fix. Final release PASS is forbidden if the Windows verification chain or any required evidence source was not executed.
