# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.5.x   | Yes       |
| 1.4.x   | Yes       |
| < 1.4   | No        |

## Reporting a vulnerability

Open a private issue via GitHub's security advisory feature, or email
10xdev4u@gmail.com. Do not open public issues for security bugs.

## Scope

- The extension must never crash the host Freebuff app (fail-open).
- No data leaves the machine; all stats are local.
- The launcher must not weaken file permissions.
- Patching must keep a pristine `app.asar.orig` for rollback.
