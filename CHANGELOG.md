# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · [Semantic Versioning](https://semver.org/)

---

## [1.0.0] — 2026-03-19

First stable release. Published as `@effectorhq/compose`.

### Added
- **Pipeline YAML format** — define multi-step agent pipelines in `pipeline.effector.yml`
- **Type-checked composition** — sequential validation that output type of each step is compatible with input type of the next (uses `@effectorhq/core` subtype relations)
- **CLI subcommands**:
  - `check` — validate type compatibility of a pipeline definition
  - `build` — resolve and emit a pipeline execution plan
  - `resolve` — map pipeline steps against a local effector registry
  - `suggest` — find short type-compatible chains (depth ≤ 3) between types
  - `visualize` — render pipeline as SVG to stdout
  - `run` — generate a dry-run execution plan (no actual runtime invocation)
- **Registry loader** — discovers effector definitions from local directories
- 16 tests

### Changed
- All cross-repo relative imports replaced with `@effectorhq/core ^1.0.0` package specifier
- Package name: `effector-compose` → `@effectorhq/compose`
- `dependencies` updated from `file:../effector-core` → `"@effectorhq/core": "^1.0.0"`
- `files` field: `["src/", "bin/", "README.md", "LICENSE"]`
- `prepublishOnly` script added
