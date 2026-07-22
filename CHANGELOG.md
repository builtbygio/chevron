# Changelog

All notable changes to **Chevron** are documented in this file.

Chevron is a modernised fork of [Atom](https://github.com/atom/atom). Historical Atom releases are archived at the upstream project; this log covers Chevron only.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **App icons:** regenerate channel PNGs/ICOs with true transparent corners (no white JPEG fringe); ship multi-size icons for Linux taskbar; improve `BrowserWindow` icon loading + `app.setDesktopName` for shell association
- **settings-view + cpm:** `cpm view --json` returns apm-shaped metadata with top-level `version`; supports `--compatible`; owned settings-view null-safe on failed/missing pack (no `pack.version` throw)

### Security

- **Phase N5.1:** package secondary BrowserWindows (github workers) — fixed hardened prefs, `chevron-package-worker` partition, file:-only navigation, deny window.open/permissions; editor remains `sandbox: false` (hackable)

- **Phase N2.2–N2.4:** fuzzy-finder path probes, tree-view bulk fs via main IPC, github residual remote cleanup
- **Phase N3.1:** preload natives inventory; package Node policy; editor session permission deny-list; optional require audit
- **Phase N3.2:** opt-in `CHEVRON_RESTRICT_PACKAGE_REQUIRES=1` blocks privileged `require`s from community packages only (core/bundled exempt)
- **Phase N4.1:** guest `<webview>` WebContents — deny window.open, restrict navigation schemes, deny permissions, default `chevron-guest` partition
- **Bundled package ownership (Option B):** pin Tier-1 packages to `builtbygio` forks (same SHAs): `settings-view`, `tree-view`, `fuzzy-finder`, `github`
- **bootstrap:** GCC 14+ oniguruma build fix (`patch-oniguruma-gyp.js`)

## [0.4.0] — 2026-07-22

Package manager cutover and Security Phase N resume. Electron remains **43.1.0**.

### Added

- **cpm package manager (Phases 0–4 complete)** — cutover guide: [docs/cpm-cutover.md](docs/cpm-cutover.md)
  - **Phase 4:** product no longer bundles classic apm (Node 12); packaging/CI use **cpm** only; `apm` remains a **shim → cpm**
  - **Phase 3:** prefer native **prebuilds** before source rebuild (`chevron.prebuilds`, `prebuild-install`, then `@electron/rebuild`); `--force-source`; [docs/cpm-prebuilds.md](docs/cpm-prebuilds.md)
  - **Phase 2:** registry client (`search`, `view`, install-by-name via Pulsar API; `CPM_REGISTRY_URL`)
  - **Phase 1:** `@chevron/cpm` under `cpm/` — Electron-as-Node CLI (`list`, `doctor`, `install`, `uninstall`, `link`, `rebuild --no-color`)
    - Launchers `cpm` / `apm` shims; product packaging copies `app/cpm`; `getApmPath()` prefers cpm
    - Shell installer installs `cpm` + `apm` shim; Windows `resources/win/cpm.cmd` + Squirrel PATH
    - `engines.atom` / `engines.chevron` checks on install; compile-cache policy (b) runtime-only
    - Install smoke + rebuild contract tests
- **Security Phase N2.1:** settings-view avatar cache writes/lists/deletes only via main-process IPC under `userData/Cache/settings-view` (basename allowlist + size cap)

### Changed

- **Phase 0 bootstrap:** root app `node_modules` via **host npm** (not apm/Node 12)
  - `package-lock.json` → lockfileVersion 3; root `.npmrc` with `legacy-peer-deps=true`
  - `script/bootstrap-modern` uses `install-app-dependencies.js`; `--with-apm` is debug-only (not CI/product)
  - Bundled `packageDependencies` stay root `dependencies` (design §13.5 Option A)
- **Secondary tooling** no longer invokes classic apm for monorepo installs (`script/test`, `update-dependency`, `run-apm-install` → host npm; `getApmBinPath` → monorepo cpm shim)
- **First-run / onboarding** (`packages/welcome`): Welcome/Guide copy documents **cpm** (and `apm` shim); removed Atom sunset/telemetry consent; Teletype card removed
- **User migration (cutover):** prefer `cpm …`; existing `apm …` scripts keep working via shim; Settings installer uses cpm; registry defaults to Pulsar — see [docs/cpm-cutover.md](docs/cpm-cutover.md)
- **Settings package search / featured / install UI** use Pulsar registry APIs (not dead atom.io); registry patch re-applied after Coffee transpile in the package build
- Session handoff (`GROK.md`) rewritten for post-cpm baseline; **next epic = Security Phase N**

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
