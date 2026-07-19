# Changelog

All notable changes to **Chevron** are documented in this file.

Chevron is a modernised fork of [Atom](https://github.com/atom/atom). Historical Atom releases are archived at the upstream project; this log covers Chevron only.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **First-run / onboarding polish** (`packages/welcome`):
  - Removed Atom sunsetting and telemetry consent views (no user path to either)
  - Welcome: works/WIP panel, project + shell-command CTAs, clearer two-tab sequencing
  - Guide: removed Teletype card; honest package-install note (apm/registry limits until cpm)
  - Config-home migrate prompt deferred (WONTFIX; silent dual-support remains)

## [0.3.0] — 2026-07-18

Polish release: brand mark, icons, and first-run product language.

### Added

- New **Chevron app icon** (double-chevron mark, indigo→cyan) for stable/beta/nightly/dev
  - `resources/app-icons/<channel>/chevron.icns`, `.ico`, and `png/*`
  - Legacy `atom.icns` / `atom.ico` kept as copies for residual paths
- In-app **Chevron wordmark** (About + Welcome) replacing the Atom orbital logo
- README hero with the new mark; status table for 0.3.0 capabilities

### Changed

- Welcome guide product-facing copy → Chevron
- Packaging prefers the `chevron` icon basename (macOS/Windows/Linux)

## [0.2.0] — 2026-07-18

First multi-platform packaging baseline and Chevron product identity.

### Added

- **Windows CI**: bootstrap, build, zip package, launch smoke test (`windows-2022` + MSVC)
- **macOS dual-arch CI**: Intel (`macos-15-intel` / x64) and Apple Silicon (`macos-15` / arm64)
- **Linux arm64 CI**: bootstrap, build, packages, smoke (alongside x64)
- **Linux packages**: required `.deb`, `.rpm`, and `.tar.gz` artifacts on x64 and arm64
- **Chevron branding** (dual-support forever for Atom packages):
  - Bundle ID `dev.builtbygio.chevron` (+ helper)
  - Config home: `CHEVRON_HOME` → `ATOM_HOME` → `~/.chevron` if present → `~/.atom`
  - URI schemes: `atom://` (package API) + `chevron://` alias
  - Shell commands: `chevron`, `atom`, and `apm` (compatibility)
- **Tooling rename (P5)**: internal `atomnova_*` helpers → `chevron_*` (with short-lived aliases)

### Fixed

- Native rebuilds for Electron 43 on Windows (MSVC, `ArrayBuffer::Data()` ABI, spellchecker, tree-sitter languages)
- Squirrel apm shim naming for `chevron.exe` (no longer string-replaces `atom`→`apm` on the wrong stem)
- Dev-mode / module-cache recognition of package name `chevron`
- Soft-fail custom mksnapshot when Electron 43 context snapshot generator exits non-zero
- Skip empty macOS symbols zip when `dump_syms` is unavailable (e.g. arm64)

### Changed

- Product name and packaging IDs default to **Chevron** / `chevron` (stable channel)
- Runtime crash reporter and about/welcome copy point at `builtbygio/chevron`
- Electron remains **43.1.0**

### Compatibility

Unchanged public Atom ecosystem surface:

- `global.atom` / `require('atom')` / `engines.atom`
- Primary package URI scheme `atom://`
- Default config dir still `~/.atom` when no Chevron-specific home is set
- `apm` command name

## [0.1.0] — earlier

Initial Chevron tree: Electron modernization, modern host bootstrap (`bootstrap-modern`), Linux x64 packaging path, and early rebrand of `package.json` to `chevron` / `Chevron`.

---

[Unreleased]: https://github.com/builtbygio/chevron/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/builtbygio/chevron/releases/tag/v0.3.0
[0.2.0]: https://github.com/builtbygio/chevron/releases/tag/v0.2.0
