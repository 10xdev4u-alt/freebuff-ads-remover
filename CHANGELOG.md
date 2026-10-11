# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-11

### Added

- App patcher (`scripts/patch-freebuff-app.mjs`): injects the extension
  loader into Freebuff's `resources/app.asar` — the only reliable preload
  path, since Electron ignores `--require`, `NODE_OPTIONS` and `--app` for
  packaged apps. Original archive is preserved as `app.asar.orig`.
- `WebContentsCssTarget`: CSS fallback now injects via
  `webContents.insertCSS` (sessions have no `insertCSS` API), re-applies on
  navigation, and never touches previewed third-party sites.
- `scripts/verify-remover.mjs`: end-to-end probe through the DevTools
  endpoint — asserts ad fetches are blocked while control requests still
  reach the orchestrator.
- Auto-activation: the extension registers its `app.whenReady()` hook at
  module load, before the app's own `boot` runs.

### Changed

- Launcher: drops the ineffective `--require` flag, unsets
  `ELECTRON_RUN_AS_NODE`, patches the app payload, and re-extracts the
  AppImage when it changes (so updates get patched too).
- Build: `dist/package.json` (`{"type":"commonjs"}`) is emitted by the
  build; stale `dist/index.cjs` removed.
- Lint: fixed pre-existing violations (the `typescript-eslint` package was
  missing, so lint had never actually run); tests get a tsconfig and a
  small rule relaxation for mock-heavy code.

## [1.0.0] - 2026-10-09

### Added

- Foundation: TypeScript project scaffold with strict mode
- Config system with zod validation and hot-reload
- Ad interceptor: pattern matching for all 18 ad endpoints
- CSS injector: fallback hiding for all 9 ad surfaces
- Electron session hook: webRequest integration
- Extension entry point: activate/deactivate API
- Launcher script: one-command Freebuff launch with extension
- Update checker: GitHub releases version comparison
- Performance monitor: latency, memory, uptime tracking
- CI/CD pipeline: lint, typecheck, test, build
- Research documentation: complete ads architecture
- Architecture documentation: component diagrams and data flow
- 57 tests across 5 test files
- GitHub issue and PR templates
- README with installation and configuration guide
- Contributing guide

### Research

- Complete reverse-engineering of Freebuff Desktop ads system
- 18 ad API endpoints mapped
- 6 ad surfaces identified and classified
- Renderer state flow documented
- Blocking strategy designed and validated
