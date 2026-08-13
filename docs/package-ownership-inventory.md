# Bundled package ownership inventory

**Status:** living inventory  
**Source of truth for pins:** root [`package.json`](../package.json) `dependencies`  
**Ecosystem strategy:** [package-ecosystem-strategy.md](./package-ecosystem-strategy.md) — **owned catalog only** until sandboxed community (host v2)  
**Modernization process:** [owned-package-modernization-checklist.md](./owned-package-modernization-checklist.md)  
**Pin guard:** `script/ci/package-pin-policy.test.js` (fails CI if owned packages regress to `atom/*`)

## Summary (current)

| Class | Count | Policy |
|-------|------:|--------|
| **Owned** (`builtbygio/*` git pins) | **43** | Primary maintenance + security patches |
| **Upstream Atom** (`atom/*` git pins) | **22** | Remaining TextMate-only `language-*` — SHA pins only (#79 leftover) |
| **In-repo** (`file:packages/*`) | 29 | Monorepo packages (themes, about, welcome, natives, …) |
| **npm registry** (semver / file natives) | rest | Host npm / Electron rebuild |

## Owned forks (`builtbygio/*`)

| Package | Notes |
|---------|--------|
| archive-view | JSON keymaps; `require('chevron')` in lib; **ls-archive** is [builtbygio/ls-archive](https://github.com/builtbygio/ls-archive) (tar 7) |
| **autocomplete-chevron-api** | Coffee gone; update script uses `fetch` (no `request`) |
| autocomplete-css | Coffee gone; update script uses `fetch` (no `request`) |
| autocomplete-html | Update scripts use `fetch` (no `request`) |
| autocomplete-plus | TS; sanitizers; coffeelint gone |
| autocomplete-snippets | coffeelint gone |
| autosave | `engines.chevron` |
| background-tips | `engines.chevron` |
| bookmarks | JSON keymaps/menus |
| bracket-matcher | JSON keymaps/menus |
| command-palette | TS; coffeelint gone |
| encoding-selector | JSON keymaps/menus |
| find-and-replace | TS; coffeelint gone |
| fuzzy-finder | `engines.chevron` |
| github | Git workers utilityProcess (Phase S); sanitizers |
| image-view | JSON keymaps/menus |
| keybinding-resolver | JSON keymaps/menus |
| markdown-preview | SCA: marked 4.3.0 + DOMPurify 3.4.13 |
| notifications | TS; sanitizers |
| open-on-github | JSON keymaps/menus |
| package-generator | JSON menus |
| settings-view | Pulsar registry via `fetch` (no `request`) |
| snippets | TS; coffeelint gone |
| spell-check | TS |
| status-bar | TS; coffeelint gone |
| styleguide | JSON keymaps/menus |
| symbols-view | JSON keymaps/menus |
| tabs | TS; coffeelint gone |
| timecop | JSON menus |
| tree-view | TS (lib complete); coffeelint gone; `require('chevron')` |
| whitespace | JSON menus |
| wrap-guide | Coffee gone; `require('chevron')` in lib |
| language-c | Tree-sitter ABI 13–15 (`tree-sitter-c` / `cpp`); JSON + TypeScript |
| language-css | Tree-sitter ABI 13–15; JSON + TypeScript |
| language-go | Tree-sitter ABI 13–15; JSON + TypeScript |
| language-html | Tree-sitter ABI 13–15 + embedded-template; JSON + TypeScript |
| language-java | Tree-sitter ABI 13–15 (`tree-sitter-java`, was `java-dev`); JSON + TypeScript |
| language-javascript | Tree-sitter ABI 13–15 (js / jsdoc / regex); JSON + TypeScript |
| language-json | Tree-sitter ABI 13–15; JSON + TypeScript |
| language-python | Tree-sitter ABI 13–15; JSON + TypeScript |
| language-ruby | Tree-sitter ABI 13–15; JSON + TypeScript |
| language-shellscript | Tree-sitter ABI 13–15 (`tree-sitter-bash`); JSON + TypeScript |
| language-typescript | Tree-sitter ABI 13–15 (ts / tsx); JSON + TypeScript |

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
