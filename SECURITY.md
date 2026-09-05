# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security problems.

Use GitHub's private vulnerability reporting: go to the
[Security tab](https://github.com/jpysh/ayurcalm-scheduler/security/advisories/new)
and open a draft advisory. It stays private between you and the maintainer until
a fix is released.

Expect an acknowledgement within a week. This is a single-maintainer project, so
fixes are best-effort rather than guaranteed within a fixed window.

## Scope and expectations

AyurCalm has not had an external security audit. It ships with a seeded demo
administrator (`admin@example.com` / `demo1234`) so a fresh install is usable
immediately — that account is a known default, not a vulnerability. The server
warns on every startup while it is unchanged.

Do not expose an instance to the public internet without your own TLS,
authentication layer and backups in front of it.

## Supported versions

Fixes land on `main`. There are no long-term support branches.
