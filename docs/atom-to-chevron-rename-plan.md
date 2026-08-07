# Atom → Chevron rename program

**Status:** in progress (Chevron-primary; Atom aliases during migration)  
**Policy:** [REBRANDING.md](./REBRANDING.md)  
**Pin guard:** `script/ci/package-pin-policy.test.js`

## Goals

| Goal | Status |
|------|--------|
| G0 Restore builtbygio pins / no silent pin reverts | Done (Phase 0) |
| G1 `autocomplete-chevron-api` end-to-end | Done (Phase 0) |
| G2 `global.chevron` + `require('chevron')` preferred | Phase 2 |
| G3 Atom names remain aliases for community packages | Phase 2+ |
| G4 Themes / product package names migrate | Phase 3 |

## Non-goals (for now)

- Hard-delete `global.atom` / `require('atom')` / `atom://` / `apm` (not before 1.0)
- Mass-rename `@atom/*` natives or `atom-keymap` (separate follow-on)
- language-* forks (#79)
- Good-first-issue docs hygiene assigned elsewhere (#75–#78)

## Phases

### Phase 0 — Pins + autocomplete-chevron-api

- Restore 32 `builtbygio/*` pins after #81 regression
- Rename package identity `autocomplete-atom-api` → `autocomplete-chevron-api`
- Pin-policy CI

### Phase 1 — Policy

- REBRANDING: Chevron-primary, Atom aliases
- This document

### Phase 2 — JS API aliases

| Surface | Chevron-primary | Atom alias |
|---------|-----------------|------------|
| Global env | `global.chevron` | `global.atom` (same object) |
| Main process app | `global.chevronApplication` | `global.atomApplication` |
| Package exports | `require('chevron')` → `exports/chevron.js` | `require('atom')` → same |

### Phase 3 — Product package renames

| From | To |
|------|-----|
| `autocomplete-atom-api` | `autocomplete-chevron-api` (done) |
| `atom-dark-ui` | `chevron-dark-ui` |
| `atom-light-ui` | `chevron-light-ui` |
| `atom-dark-syntax` | `chevron-dark-syntax` |
| `atom-light-syntax` | `chevron-light-syntax` |

User `core.themes` values that still say `atom-*-ui/syntax` are mapped at load time.

### Phase 4 — Messaging

- Prefer `engines.chevron`, `chevron://`, CLI `chevron` in product copy
- Keep accepting `engines.atom`, `atom://`, `atom` CLI

### Phase 5 — Owned / monorepo packages

- Prefer `require('chevron')` in monorepo `packages/*` where practical
- Builtbygio forks: gradual in package repos (not required in one monorepo PR)

## Guardrails

1. Never change owned pin host `builtbygio` → `atom` when only bumping a SHA  
2. Rename PRs update: dep key, packageDependencies, require, fork name, patches, lockfile together  
3. Do not steal files owned by open good-first-issue assignments (#77 config comments, #78 CONTRIBUTING)

## Follow-on (not this PR)

- `atom-keymap` → `chevron-keymap` (large consumer surface)
- `atom-select-list` → `chevron-select-list`
- `@atom/watcher` etc.
- Deprecate and eventually remove `global.atom` after 1.0
