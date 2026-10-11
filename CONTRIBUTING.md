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

## Landing Page (`index.html`)

The GitHub Pages site embeds a **snapshot** of the built dashboard
client (`dist/dashboard-client.js`) between the
`FAR-CLIENT-START` / `FAR-CLIENT-END` banners for the live on-page
demo. After any `src/dashboard-client.ts` change, rebuild and
re-inline it:

```bash
npm run build
node -e '
const {readFileSync, writeFileSync} = require("node:fs");
const client = readFileSync("dist/dashboard-client.js", "utf8").trim();
if (/<\/script/i.test(client)) throw new Error("client contains </script>");
let html = readFileSync("index.html", "utf8");
const s = html.indexOf("// ===== FAR-CLIENT-START");
const e = html.indexOf("// ===== FAR-CLIENT-END");
if (s < 0 || e < 0 || e < s) throw new Error("banners missing");
const headEnd = html.indexOf("\n", s) + 1;
html = html.slice(0, headEnd) + client + "\n" + html.slice(e);
writeFileSync("index.html", html);
'
```

(Keep the snapshot in sync — the demo must always run the shipped bundle.)
