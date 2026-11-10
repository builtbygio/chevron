# Chevron rebranding

This document is the rebrand record. The old root `MIGRATION-CHECKLIST.md` (AtomNova intermediate) was removed; use this file + [CHANGELOG.md](../../CHANGELOG.md) instead.

**Living rename checklist:** [atom-to-chevron-rename-plan.md](../process/atom-to-chevron-rename-plan.md)

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Product name | **Chevron** |
| Package name | `chevron` (`productName`: Chevron) |
| Bundle ID | `dev.builtbygio.chevron` / `.helper` |
| Atom ecosystem | **Chevron only** — dual-support is **not** a product goal |
| Package ecosystem | **Owned catalog only** now; **sandboxed community** later — [package-ecosystem-strategy.md](./package-ecosystem-strategy.md) |
| Intermediate brand | AtomNova is retired |

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| P0–P5 | Product name, bundle ID, CLI, copy, helper renames | Done (≤0.3.0) |
| Rename Phases 0–5 | Owned pins, `autocomplete-chevron-api`, themes, `require('chevron')` | Done (#82) |
| **Policy: Chevron only** | Drop dual-support commitment; default `~/.chevron` | Done |
| **Package ecosystem** | Closed owned catalog; community deferred to host v2 | **Locked** — [package-ecosystem-strategy.md](./package-ecosystem-strategy.md) |
| Later | Remove legacy shims; sandboxed community packages when base is ready | Planned |

## Chevron-only surfaces

| Surface | Product rule |
|---------|----------------|
| Global editor env | **`global.chevron` only**. There is no `global.atom`. |
| Main process app | **`global.chevronApplication`**. There is no `global.atomApplication`. |
| Package module API | **`require('chevron')`**. `require('atom')` is `MODULE_NOT_FOUND`. |
| Engines | Prefer **`engines.chevron`**. `engines.atom` alone → cpm warning. |
| Protocol | **`chevron://`** only. The `atom://` alias was removed in Wave 4 once no owned pin emitted it; `atom://` no longer resolves. |
| CLI | **`chevron`**, **`cpm`**. The `apm` launcher is not shipped. `atom.sh` still starts the app when invoked under an `atom*` name. |
| Config home | **`~/.chevron`** default. `CHEVRON_HOME` first. `ATOM_HOME` only if explicitly set. **No default to `~/.atom`.** |
| Themes | **`chevron-*-ui/syntax`**; old `atom-*` theme ids still map at load. |

## Config home order

1. `CHEVRON_HOME`  
2. `ATOM_HOME` (explicit legacy override only)  
3. Portable `.chevron` next to the app  
4. **`~/.chevron`** (default)

Users with an existing Atom config under `~/.atom` must set `ATOM_HOME` or copy/migrate into `~/.chevron`.

## Still deferred (high cost)

- Rename `atom-select-list` and the remaining `@atom/*` natives. The keymap engine is already vendored in `src/keymap`; the `atom-keymap` package is gone.
- Class renames are done: `ChevronEnvironment`, `ChevronApplication`, `ChevronWindow`.
- `global.atom` and `require('atom')` are already gone.

## Verification

Pin-policy CI; multi-platform smoke; `~/.chevron` used when no env override.
