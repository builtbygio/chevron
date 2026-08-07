# Chevron rebranding

This document is the rebrand record. The old root `MIGRATION-CHECKLIST.md` (AtomNova intermediate) was removed; use this file + [CHANGELOG.md](../CHANGELOG.md) instead.

**Living rename checklist:** [atom-to-chevron-rename-plan.md](./atom-to-chevron-rename-plan.md)

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Product name | **Chevron** |
| Package name | `chevron` (`productName`: Chevron) |
| Bundle ID | `dev.builtbygio.chevron` / `.helper` |
| Atom ecosystem | **Chevron-primary**; Atom surfaces kept as **aliases** during migration (community packages, old configs) |
| Intermediate brand | AtomNova is retired (tooling renames remaining) |

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| P0–P5 | Product name, bundle ID, dual home, CLI, copy, helper renames | Done (≤0.3.0) |
| Rename Phase 0 | Restore owned pins; `autocomplete-chevron-api` | Done |
| Rename Phase 1 | Policy flip + rename plan doc | Done |
| Rename Phase 2 | `global.chevron` / `require('chevron')` (+ atom aliases) | Done |
| Rename Phase 3 | Theme package names `chevron-*-ui/syntax` | Done |
| Rename Phase 4–5 | Messaging + monorepo prefer `require('chevron')` | Done |
| Later | `atom-keymap`, `atom-select-list`, `@atom/*`, remove atom aliases post-1.0 | Not started |

## Chevron-primary surfaces

| Surface | Preferred | Alias (kept) |
|---------|-----------|--------------|
| Global editor env | `global.chevron` | `global.atom` (same object) |
| Main process app | `global.chevronApplication` | `global.atomApplication` |
| Package module API | `require('chevron')` | `require('atom')` |
| Engines | `engines.chevron` | `engines.atom` still accepted |
| Protocol | Document `chevron://` | `atom://` still registered; packages may use either |
| CLI | `chevron`, `cpm` | `atom`, `apm` shims |
| Config home | `~/.chevron` when present | `~/.atom` / `ATOM_HOME` still work |
| Themes (bundled fallbacks) | `chevron-dark-ui` / `chevron-dark-syntax` / light variants | Old `atom-*` names map at load |

## Still deferred (high cost)

- `atom-keymap` / `atom-select-list` package **names**
- `@atom/*` scoped natives
- Class renames (`AtomEnvironment` → `ChevronEnvironment`) — cosmetic; aliases later if ever
- Hard removal of `global.atom` — not before **1.0**

## Config home order

`CHEVRON_HOME` → `ATOM_HOME` → portable → `~/.chevron` if exists → **`~/.atom`**

## Verification

Multi-platform CI after rename PRs. Pin-policy unit test for owned `builtbygio` pins.
