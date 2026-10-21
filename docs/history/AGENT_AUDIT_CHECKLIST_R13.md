# r13 Independent Audit Checklist

Use this as a compact execution tracker. `PASS` is allowed only with evidence.

## Package
- [ ] Received ZIP SHA-256 calculated
- [ ] Clean extraction succeeds
- [ ] File inventory reviewed
- [ ] No accidental node_modules/dist/reports/backups/secrets
- [ ] PACKAGE_MANIFEST independently verified
- [ ] PACKAGE_PROVENANCE independently recomputed
- [ ] package-lock hash matches provenance

## Windows bootstrap
- [ ] Node >=22.19
- [ ] RUN.bat from fresh directory
- [ ] INSTALL path verified if dependencies absent
- [ ] VERIFY.bat PASS
- [ ] final-verification.log inspected
- [ ] START loads UI
- [ ] STOP does not kill unrelated Node process
- [ ] PID/instance ownership checked

## Project gates
- [ ] static:check
- [ ] typecheck
- [ ] tests
- [ ] build
- [ ] smoke:runtime
- [ ] benchmark:accuracy
- [ ] verify

## Fix Pack privacy
- [ ] .env excluded
- [ ] credential/secret config excluded
- [ ] DB URL secret excluded
- [ ] auth/cookie/session literals excluded
- [ ] URL query/hash stripped from external text
- [ ] nested evidence sanitized
- [ ] standalone GPT handoff sanitized
- [ ] screenshot PII limitation represented honestly
- [ ] large local evidence remains exportable

## Fix Package parser/path
- [ ] replace/create only
- [ ] unknown/delete/rename/shell rejected
- [ ] strict manifest fields
- [ ] snapshot fingerprint checked
- [ ] beforeSha256 checked
- [ ] unexported target rejected
- [ ] protected target rejected
- [ ] traversal rejected
- [ ] absolute/drive path rejected
- [ ] ADS rejected
- [ ] symlink escape rejected
- [ ] Windows reserved names rejected
- [ ] case-insensitive collisions rejected
- [ ] binary/executable create rejected
- [ ] CRC corruption rejected
- [ ] ZIP64 rejected
- [ ] multi-disk/encryption rejected
- [ ] standard DEFLATE accepted

## No-auto-exec
- [ ] package scripts not executed
- [ ] source/config modules not executed
- [ ] no host side-effect marker created
- [ ] executable-code change result remains NOT_VERIFIED where appropriate
- [ ] invalid JSON blocks before mutation

## Apply/backup/rollback
- [ ] backup before first mutation
- [ ] backup payload hash verified
- [ ] backup manifest sidecar verified
- [ ] corrupt backup rejected
- [ ] valid replace confirms after hash
- [ ] post-commit cleanup failure => warning, not fake rollback
- [ ] partial failure emergency rollback verified by hashes
- [ ] concurrent third-party edit preserved
- [ ] incomplete recovery reported truthfully
- [ ] backups rediscovered after restart
- [ ] rollback resumable
- [ ] later edit blocks unsafe rollback
- [ ] created files removed safely
- [ ] only safe empty created dirs cleaned

## UI/API
- [ ] project root explicit
- [ ] changing root clears selected Fix ZIP
- [ ] blocked precheck not shown as applied
- [ ] PASS vs NOT_VERIFIED visually distinct
- [ ] backup/rollback state survives restart
- [ ] live re-check says post-deploy
- [ ] UI claims match backend behavior

## Core regression
- [ ] one real audit completes
- [ ] progress/cancel works
- [ ] report opens
- [ ] BUG/CAND separation correct
- [ ] screenshots/evidence present
- [ ] Safe Mode mutation protection checked
- [ ] runtime/network checked
- [ ] forms/interactions checked
- [ ] accessibility/SEO checked
- [ ] mobile/tablet/desktop checked
- [ ] one breakpoint triad checked
- [ ] Art Director remains advisory

## Final report
- [ ] all P0/P1/P2 findings recorded
- [ ] root cause for each material finding
- [ ] exact reproduction included
- [ ] regression test proposed
- [ ] NOT RUN items marked NOT VERIFIED
- [ ] claim-evidence matrix included
- [ ] explicit release verdict issued
