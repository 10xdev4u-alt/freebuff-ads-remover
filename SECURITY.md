# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.2.x   | :white_check_mark: |
| < 1.2.0 | :x:                |

Only the latest minor release receives security fixes. Freebuff Desktop
moves fast — older extension releases may not patch newer app payloads.

## Reporting a Vulnerability

Open a **private** report via
[GitHub Security Advisories](https://github.com/10xdev4u-alt/freebuff-ads-remover/security/advisories/new)
— please do not file public issues for security problems.

Include:

- What you did (steps to reproduce, no exploit needed beyond a PoC)
- What you expected vs. what happened
- Extension version (`dist` build date or git SHA) and Freebuff version
- `~/.config/freebuff-ads-remover/extension.log` excerpt if relevant
  (scrub tokens first — it can contain request URLs)

You will get an acknowledgement within 72 hours and a fix timeline
once the issue is confirmed.

## Scope Notes

This extension runs with the same privileges as Freebuff Desktop itself
(it executes inside the app's Electron main process by design). It makes
**no network calls of its own** — all logic is local request filtering,
CSS hiding, and file logging. Treat `~/.config/freebuff-ads-remover/`
as sensitive: it can contain ad request URLs from your sessions.
