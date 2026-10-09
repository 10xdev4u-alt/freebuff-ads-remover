# Contributing

## Development Setup

```bash
git clone https://github.com/10xdev4u-alt/freebuff-ads-remover.git
cd freebuff-ads-remover
npm install
npm run build
```

## Workflow

All work follows the **agentic git issues-PR driven development** loop:

```
research → issues → validate → implement → test → commit → PR → review → merge → cleanup → repeat
```

### Rules

1. **No commits to main** — All work via PR
2. **No squash merge** — Merge commit preserves history
3. **Co-author on every commit** — `the-ai-developer`
4. **Reviewer on every PR** — `the-ai-developer`
5. **6-word conventional commits** — Strict format
6. **Research before code** — Document findings first
7. **TDD** — Test first, then implement
8. **80%+ coverage** — No exceptions

## Commit Format

```
<type>: <description>

<body>

Co-authored-by: the-ai-developer <88466089+the-ai-developer@users.noreply.github.com>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

## Pull Request Template

See [.github/pull_request_template.md](.github/pull_request_template.md).

## Code Style

- TypeScript strict mode
- No `any` types
- Small functions (<50 lines)
- Small files (<800 lines)
- Self-documenting code (no comments unless necessary)
