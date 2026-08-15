# Bundled package ownership inventory

**Status:** living inventory  
**Source of truth for pins:** root [`package.json`](../package.json) `dependencies`  
**Ecosystem strategy:** [package-ecosystem-strategy.md](./package-ecosystem-strategy.md) — **owned catalog only** until sandboxed community (host v2)  
**Modernization process:** [owned-package-modernization-checklist.md](./owned-package-modernization-checklist.md)  
**Pin guard:** `script/ci/package-pin-policy.test.js` (fails CI if owned packages regress to `atom/*`)

## Summary (current)

| Class | Count | Policy |
|-------|------:|--------|
| **Owned** (`builtbygio/*` git pins) | **84** | Primary maintenance + security patches |
| **Upstream Atom** (`atom/*` git pins) | **0** | #79 closed — TextMate `language-*` are owned |
| **In-repo** (`file:packages/*`) | 29 | Monorepo packages (themes, about, welcome, natives, …) |
| **npm registry** (semver / file natives) | rest | Host npm / Electron rebuild |

## Owned forks (`builtbygio/*`)

### Natives (compile fixes folded in-source)

| Package | Repo | Notes |
|---------|------|--------|
| `@atom/fuzzy-native` | [fuzzy-native](https://github.com/builtbygio/fuzzy-native) | Native export as-is (fuzzy-finder). CONTEXT_AWARE / V8 15 |
| `@atom/nsfw` | [nsfw](https://github.com/builtbygio/nsfw) | Callable + `actions` 0–3 (`path-watcher.js`). CONTEXT_AWARE |
| `ctags` | [node-ctags](https://github.com/builtbygio/node-ctags) | `findTags` 3-arg + `createReadStream` (symbols-view). No Coffee |
| `git-utils` | [git-utils](https://github.com/builtbygio/git-utils) | `open(path)` Repository (`git-repository.js`). Vendored libgit2 |
| `keyboard-layout` | [keyboard-layout](https://github.com/builtbygio/keyboard-layout) | Keymap observers (atom-keymap). CONTEXT_AWARE |
| `keytar` | [node-keytar](https://github.com/builtbygio/node-keytar) | Promise get/set/delete/find (github). No prebuild-install |
| `nslog` | [node-nslog](https://github.com/builtbygio/node-nslog) | Function export (`console.log = nslog`). No Coffee |
| `oniguruma` | [node-oniguruma](https://github.com/builtbygio/node-oniguruma) | `OnigRegExp` + `OnigScanner` (TextMate + first-mate) |
| `pathwatcher` | [node-pathwatcher](https://github.com/builtbygio/node-pathwatcher) | `{ File, Directory }` + `watch`. CONTEXT_AWARE |
| `spellchecker` | [node-spellchecker](https://github.com/builtbygio/node-spellchecker) | Hunspell/system API (spell-check). CONTEXT_AWARE |
| `fs-admin` | [fs-admin](https://github.com/builtbygio/fs-admin) | 0.15.0 `symlink` / `makeTree` / `recursiveCopy` / `createWriteStream`. Override replaces text-buffer’s nested 0.19 |
| `scrollbar-style` | [scrollbar-style](https://github.com/builtbygio/scrollbar-style) | `observePreferredScrollbarStyle` (`workspace-element.js`). N-API |

### Core JS (registry packages now owned)

| Package | Repo | Notes |
|---------|------|--------|
| `first-mate` | [first-mate](https://github.com/builtbygio/first-mate) | 7.4.3 `GrammarRegistry` / `ScopeSelector`. Compiled `lib/` from npm (no v7.4.3 git tag) |
| `atom-keymap` | [atom-keymap](https://github.com/builtbygio/atom-keymap) | 8.2.15 `KeymapManager`. Compiled `lib/` (git tag is Coffee) |
| `atom-select-list` | [atom-select-list](https://github.com/builtbygio/atom-select-list) | 0.8.1 `SelectListView`. Override unifies nested 0.7.2 |
| `season` | [season](https://github.com/builtbygio/season) | 6.0.2 CSON `readFile(Sync)` / `writeFile(Sync)` / `setCacheDir` |
| `text-buffer` | [text-buffer](https://github.com/builtbygio/text-buffer) | 13.18.6. Nested superstring is `file:packages/superstring` |

`scandal` (and its `isbinaryfile@2` override) dropped after search and replace left it (architecture H1 PR 4).

Root `overrides` pin nested copies (first-mate → oniguruma, spell-check → spellchecker / atom-pathspec, symbols-view → ctags, text-buffer → `fs-admin` 0.15, atom-select-list 0.8.1, …) to the same SHAs.

| Package | Repo | Notes |
|---------|------|--------|
| `atom-pathspec` | [atom-pathspec](https://github.com/builtbygio/atom-pathspec) | `remote.app.getPath` → `atom-app-get-path-sync` (spell-check) |

### Product packages

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

Binding: official npm `tree-sitter@0.25.1`. The old DeeDeeG `packages/tree-sitter` tree is gone.

### TextMate-only language-* (#79 done)

Owned `builtbygio` pins of the previous `atom/*` SHAs. No tree-sitter grammar. Grammars/settings/snippets unchanged.

`language-clojure`, `language-coffee-script`, `language-csharp`, `language-gfm`, `language-git`, `language-hyperlink`, `language-less`, `language-make`, `language-mustache`, `language-objective-c`, `language-perl`, `language-php`, `language-property-list`, `language-ruby-on-rails`, `language-sass`, `language-source`, `language-sql`, `language-text`, `language-todo`, `language-toml`, `language-xml`, `language-yaml`.

In-repo exception: `language-rust-bundled` (`file:packages/…`).

## Process

1. **Never** change an owned package’s git host from `builtbygio` → `atom` when only bumping a SHA.  
2. Renames (e.g. `autocomplete-atom-api` → `autocomplete-chevron-api`) must update: dep key, `packageDependencies`, `require()`, fork `package.json` `name`, bootstrap patches, lockfile, and this inventory in the **same** PR.  
3. Pin-policy CI enforces the owned list in `script/ci/package-pin-policy.test.js`.

## Related

- [sca-runtime-inventory.md](./sca-runtime-inventory.md)  
- [package-node-policy.md](./package-node-policy.md)  
- [owned-package-modernization-checklist.md](./owned-package-modernization-checklist.md)  
