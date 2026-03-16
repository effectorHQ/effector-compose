# Changelog

## [Unreleased] — 2026-03-15 (Phase D)

### Added
- `@effectorhq/core` as file dependency

### Changed
- Cross-repo imports replaced with package specifiers:
  - `src/type-checker.js`: `../../effector-core/src/type-checker.js` → `@effectorhq/core/types`
  - `src/registry.js`: `../../effector-core/src/toml-parser.js` → `@effectorhq/core/toml`
- `effector-types` dependency changed to `file:../effector-types`
