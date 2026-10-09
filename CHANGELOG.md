# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
