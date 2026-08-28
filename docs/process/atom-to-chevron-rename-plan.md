# Atom → Chevron rename program

**Status:** active — **Chevron-only product policy**  
**Policy:** [REBRANDING.md](../decisions/REBRANDING.md)  
**Pin guard:** `script/ci/package-pin-policy.test.js`

## Goals

| Goal | Status |
|------|--------|
| G0 Restore builtbygio pins / no silent pin reverts | Done |
| G1 `autocomplete-chevron-api` end-to-end | Done |
| G2 `global.chevron` + `require('chevron')` preferred | Done |
| G3 Product is **Chevron only** (no dual-support commitment) | Done (policy) |
| G4 Themes / product package names migrate | Done for bundled `chevron-*` themes |
| G5 Remove remaining legacy shims | Open |

## Non-goals (still)

- Mass-rename `@atom/*` natives or `atom-keymap` in one PR  
- Good-first-issue docs hygiene assigned elsewhere (#75–#78)  
- ~~language-* forks (#79)~~ done — owned `builtbygio` pins

## Policy (Chevron only)

Chevron is the only supported product. We do **not** promise dual-support for Atom as a second product.

| Surface | Supported | Legacy (unsupported; may be removed) |
|---------|-----------|--------------------------------------|
| Globals | `global.chevron` | `global.atom` |
| Main | `global.chevronApplication` | `global.atomApplication` |
| require | `require('chevron')` | `require('atom')` (warns once) |
| Config home | `~/.chevron`, `CHEVRON_HOME` | default `~/.atom`; portable `.atom` |
| Engines | `engines.chevron` | `engines.atom` alone |
| Protocol | `chevron://` | `atom://` **removed** (Wave 4) |
| CLI | `chevron`, `cpm` | `atom`, `apm` shims |

## Phases completed

0. Pins + `autocomplete-chevron-api`  
1. Policy docs  
2. JS API aliases  
3. Theme renames  
4–5. Messaging + monorepo `require('chevron')`  
6. **Chevron-only policy** (default home, engines warning, docs)

## Follow-on

1. Migrate first-party `global.atom` / `atomApplication` call sites to chevron  
2. Package openers: prefer `chevron://` URIs in monorepo packages  
3. Remove `require('atom')` builtin after deprecation window (owned `lib/`/`src/` already use `require('chevron')`)  
4. `atom-keymap` / `atom-select-list` / `@atom/*` renames  
5. **Package ecosystem:** owned catalog only now; sandboxed community (host v2) after base is ready — [package-ecosystem-strategy.md](../decisions/package-ecosystem-strategy.md)  

## Guardrails

1. Never change owned pin host `builtbygio` → `atom` when only bumping a SHA  
2. Rename PRs update dep key, packageDependencies, require, fork name, patches, lockfile together  
3. Do not steal files owned by open good-first-issue assignments (#77, #78)
