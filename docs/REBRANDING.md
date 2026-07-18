# Chevron rebranding

This document supersedes the historical AtomNova rebrand checklist.

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Product name | **Chevron** |
| Package name | `chevron` (`productName`: Chevron) |
| Bundle ID | `dev.builtbygio.chevron` / `.helper` |
| Atom ecosystem | **Dual-support forever** (`atom://`, `global.atom`, `engines.atom`, `~/.atom` / `ATOM_HOME`, `apm`) |
| Intermediate brand | AtomNova is retired (tooling renames remaining) |

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| P0 | Recognize `chevron` package name; Squirrel apm shim; metadata fix | Done on `feat/chevron-rebrand` |
| P1 | Crash / telemetry / copyright / protocol prompt strings | Done |
| P2 | Bundle ID, installers, Linux install-from-source, atom.sh | Done |
| P3 | Dual config home, `chevron://` alias, CLI `chevron`+`atom`+`apm` | Done |
| P4 | Welcome / about / docs product copy | Done |
| P5 | Rename `atomnova_*` helpers → `chevron_*` | Done (0.2.0) |

## Leave forever

- `global.atom`, `require('atom')`, `engines.atom`
- Primary package URI scheme `atom://` (plus `chevron://` alias)
- Theme package **names** (`atom-dark-ui`, …)
- `@atom/*` npm package names and most upstream `github.com/atom/*` pins

## Dual-support forever

| Surface | Behavior |
|---------|----------|
| Config home | `CHEVRON_HOME` → `ATOM_HOME` → portable → `~/.chevron` if exists → **`~/.atom`** |
| Protocols | Register `atom` + `chevron`; normalize `chevron://` → `atom://` for packages |
| CLI | Install `chevron` primary; keep `atom` + `apm` shims |

## 0.3.0 polish

- [x] New Chevron app icons (icns/ico/png) for all channels
- [x] About + Welcome wordmark
- [x] Welcome guide product copy
- [x] README hero / screenshot refresh
- [ ] Optional first-run config migrate prompt

## Verification

Multi-platform CI after each phase. See the session plan for full acceptance checklist.
