# Changelog

## v1.0.0 — 2026-03-19

First stable release. Package scoped to `@effectorhq/compose`.

### Added
- **Pipeline YAML format** — define multi-step agent pipelines in `pipeline.effector.yml`
- **Type-checked composition** — `npx @effectorhq/compose check` verifies type compatibility before execution
- **Sequential type-checking** — validates that output types of each step are compatible with input types of the next
- **CLI** — `check`, `run`, `build`, `suggest`, `resolve`, `visualize` commands
- **Registry loader** — loads effector definitions from local directories

### Changed
- Cross-repo imports replaced with `@effectorhq/core` package specifiers
- Package name: `effector-compose` → `@effectorhq/compose`
