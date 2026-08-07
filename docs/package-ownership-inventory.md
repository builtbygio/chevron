# Bundled package ownership inventory

**Status:** living inventory  
**Source of truth for pins:** root [`package.json`](../package.json) `dependencies`  
**Modernization process:** [owned-package-modernization-checklist.md](./owned-package-modernization-checklist.md)  
**Pin guard:** `script/ci/package-pin-policy.test.js` (fails CI if owned packages regress to `atom/*`)

## Summary (current)

| Class | Count | Policy |
|-------|------:|--------|
| **Owned** (`builtbygio/*` git pins) | **32** | Primary maintenance + security patches |
| **Upstream Atom** (`atom/*` git pins) | **33** | Almost all `language-*` — SHA pins only |
| **In-repo** (`file:packages/*`) | 29 | Monorepo packages (themes, about, welcome, natives, …) |
| **npm registry** (semver / file natives) | rest | Host npm / Electron rebuild |

## Owned forks (`builtbygio/*`)

| Package | Notes |
|---------|--------|
| archive-view | Next-tier (#80) |
| **autocomplete-chevron-api** | Renamed from `autocomplete-atom-api`; pin `af35f1f` |
| autocomplete-css | Next-tier; bootstrap decaffeinate residual coffee if present |
| autocomplete-html | Next-tier |
| autocomplete-plus | Babel-prefix drop pin |
| autocomplete-snippets | Next-tier |
| autosave | Next-tier |
| background-tips | Next-tier |
| bookmarks | Decaffeinate patch for main |
| bracket-matcher | Next-tier |
| command-palette | Babel drop pin |
| encoding-selector | Next-tier |
| find-and-replace | Babel drop pin |
| fuzzy-finder | Path probes via main |
| github | Git workers utilityProcess (Phase S) |
| image-view | Next-tier |
| keybinding-resolver | Debabel patch |
| markdown-preview | SCA priority (`dompurify`/`marked`) |
| notifications | Owned |
| open-on-github | Next-tier |
| package-generator | Next-tier |
| settings-view | Babel drop pin; Pulsar registry |
| snippets | Owned |
| spell-check | Owned |
| status-bar | Owned |
| styleguide | Debabel patch |
| symbols-view | Debabel patch |
| tabs | Owned |
| timecop | Debabel patch |
| tree-view | Babel drop pin |
| whitespace | Next-tier |
| wrap-guide | Decaffeinate patch |

## Remaining `atom/*` pins

### low-grammar (defer — #79)

All `language-*` packages pinned to `atom/*` (except in-repo `language-rust-bundled`). Action: **leave** on SHA; re-pin or fork only for syntax regressions.

## Process

1. **Never** change an owned package’s git host from `builtbygio` → `atom` when only bumping a SHA.  
2. Renames (e.g. `autocomplete-atom-api` → `autocomplete-chevron-api`) must update: dep key, `packageDependencies`, `require()`, fork `package.json` `name`, bootstrap patches, lockfile, and this inventory in the **same** PR.  
3. Pin-policy CI enforces the owned list in `script/ci/package-pin-policy.test.js`.

## Related

- [sca-runtime-inventory.md](./sca-runtime-inventory.md)  
- [package-node-policy.md](./package-node-policy.md)  
- [owned-package-modernization-checklist.md](./owned-package-modernization-checklist.md)  
