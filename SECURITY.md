# Security Policy

## Supported use — read this first

Visual QA Browser is a **local, defensive QA workstation**. Use it only on
websites you own or are explicitly authorized to audit. It is not an attack
tool: the security module is passive (response headers and cookie flags),
Safe Mode blocks mutations and private-network targets, and the application
server binds to `127.0.0.1` only.

- **Never expose the local server to a network** (no port forwarding, tunnels,
  or binding patches). Its API can launch audits and, via the Fix Bridge,
  modify a local project after explicit operator action.
- **Reports and screenshots stay local and may contain personal data** visible
  on audited pages. Review evidence before sharing it with anyone, including
  external AI services.
- The optional OpenAI Art Director provider is off unless you configure it.
  Private/authenticated external AI review is intentionally disabled.
- The Fix Bridge never executes project code from an imported fix package and
  is fail-closed — but applying any third-party/AI-generated patch remains a
  human decision. Keep version control and backups of target projects.

## Known residual risks (honest limits)

Application-level URL/DNS checks do not equal complete SSRF immunity: there is
no network-layer isolation or IP pinning. Do not run the tool against
untrusted tenants or as a multi-user hosted service.

## Reporting a vulnerability

Please report privately through **GitHub → Security → Report a vulnerability**
on this repository. Do not open a public issue first. Include affected version,
OS/Node version, and a minimal reproduction without real personal data or
secrets.

This is a volunteer project: fixes land on `main` and ship in the next patch
release as soon as realistically possible. The latest release is the only
supported version.
