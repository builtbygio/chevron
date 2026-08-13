# Bundled package ownership inventory

**Status:** living inventory  
**Source of truth for pins:** root [`package.json`](../package.json) `dependencies`  
**Ecosystem strategy:** [package-ecosystem-strategy.md](./package-ecosystem-strategy.md) — **owned catalog only** until sandboxed community (host v2)  
**Modernization process:** [owned-package-modernization-checklist.md](./owned-package-modernization-checklist.md)  
**Pin guard:** `script/ci/package-pin-policy.test.js` (fails CI if owned packages regress to `atom/*`)

## Summary (current)

| Class | Count | Policy |
|-------|------:|--------|
| **Owned** (`builtbygio/*` git pins) | **32** | Primary maintenance + security patches |
| **Upstream Atom** (`atom/*` git pins) | **22** | Remaining TextMate-only `language-*` — SHA pins only (#79 leftover) |
| **In-repo** (`file:packages/*`) | 29 | Monorepo packages (themes, about, welcome, natives, …) |
| **npm registry** (semver / file natives) | rest | Host npm / Electron rebuild |

## Owned forks (`builtbygio/*`)

| Package | Notes |
|---------|--------|
| archive-view | Class C fold — plain JS pin |
| **autocomplete-chevron-api** | Renamed from `autocomplete-atom-api`; Class C fold (no coffee) |
| autocomplete-css | Class C fold — no runtime coffee |
| autocomplete-html | Next-tier |
| autocomplete-plus | Babel-prefix drop pin |
| autocomplete-snippets | Next-tier |
| autosave | Next-tier |
| background-tips | Next-tier |
| bookmarks | Class C fold — no coffee / babel-prefix |
| bracket-matcher | Next-tier |
| command-palette | Babel drop pin |
| encoding-selector | Next-tier |
| find-and-replace | Babel drop pin |
| fuzzy-finder | Path probes via main |
| github | Git workers utilityProcess (Phase S) |
| image-view | Next-tier |
| keybinding-resolver | Class C fold — plain JS |
| markdown-preview | SCA: marked 4.3.0 + DOMPurify 3.4.13 |
| notifications | Owned |
| open-on-github | Class C fold — plain JS |
| package-generator | Next-tier |
| settings-view | Babel drop pin; Pulsar registry |
| snippets | Owned |
| spell-check | Owned |
| status-bar | Owned |
| styleguide | Class C fold — plain JS |
| symbols-view | Class C fold — plain JS |
| tabs | Owned |
| timecop | Class C fold — plain JS |
| tree-view | Babel drop pin |
| whitespace | Next-tier |
| wrap-guide | Class C fold — no runtime coffee |
| language-c | Tree-sitter ABI 13–15 (`tree-sitter-c` / `cpp`) |
| language-css | Tree-sitter ABI 13–15 |
| language-go | Tree-sitter ABI 13–15 |
| language-html | Tree-sitter ABI 13–15 + embedded-template |
| language-java | Tree-sitter ABI 13–15 (`tree-sitter-java`, was `java-dev`) |
| language-javascript | Tree-sitter ABI 13–15 (js / jsdoc / regex) |
| language-json | Tree-sitter ABI 13–15 |
| language-python | Tree-sitter ABI 13–15 |
| language-ruby | Tree-sitter ABI 13–15 |
| language-shellscript | Tree-sitter ABI 13–15 (`tree-sitter-bash`) |
| language-typescript | Tree-sitter ABI 13–15 (ts / tsx) |

Binding: official npm `tree-sitter@0.25.1` (not DeeDeeG / `file:packages/tree-sitter`).

## Remaining `atom/*` pins

### TextMate-only language-* (defer — #79)

No tree-sitter grammar in the package. Still `atom/*` SHA pins. Fork when needed for other reasons.

## Process

1. **Never** change an owned package’s git host from `builtbygio` → `atom` when only bumping a SHA.  
2. Renames (e.g. `autocomplete-atom-api` → `autocomplete-chevron-api`) must update: dep key, `packageDependencies`, `require()`, fork `package.json` `name`, bootstrap patches, lockfile, and this inventory in the **same** PR.  
3. Pin-policy CI enforces the owned list in `script/ci/package-pin-policy.test.js`.

## Related

- [sca-runtime-inventory.md](./sca-runtime-inventory.md)  
- [package-node-policy.md](./package-node-policy.md)  
- [owned-package-modernization-checklist.md](./owned-package-modernization-checklist.md)  
