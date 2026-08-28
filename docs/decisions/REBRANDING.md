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
| Global editor env | **`global.chevron` only** (supported). `global.atom` is an unsupported legacy alias. |
| Main process app | **`global.chevronApplication`**. `global.atomApplication` is unsupported legacy. |
| Package module API | **`require('chevron')`**. `require('atom')` logs a one-shot warning. |
| Engines | Prefer **`engines.chevron`**. `engines.atom` alone → cpm warning. |
| Protocol | **`chevron://`** only. The `atom://` alias was removed in Wave 4 once no owned pin emitted it; `atom://` no longer resolves. |
| CLI | **`chevron`**, **`cpm`**. `atom` / `apm` remain shims, not a dual-product promise. |
| Config home | **`~/.chevron`** default. `CHEVRON_HOME` first. `ATOM_HOME` only if explicitly set. **No default to `~/.atom`.** |
| Themes | **`chevron-*-ui/syntax`**; old `atom-*` theme ids still map at load. |

## Config home order

1. `CHEVRON_HOME`  
2. `ATOM_HOME` (explicit legacy override only)  
3. Portable `.chevron` next to the app  
4. **`~/.chevron`** (default)

Users with an existing Atom config under `~/.atom` must set `ATOM_HOME` or copy/migrate into `~/.chevron`.

## Still deferred (high cost)

- Rename `atom-keymap`, `atom-select-list`, `@atom/*` natives  
- Class renames (`AtomEnvironment` → …)  
- Hard **delete** of legacy aliases (after owned packages and docs no longer need them)

## Verification

Pin-policy CI; multi-platform smoke; `~/.chevron` used when no env override.
