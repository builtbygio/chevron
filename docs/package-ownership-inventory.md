# Bundled package ownership inventory

**Status:** living inventory  
**Source of truth for pins:** root [`package.json`](../package.json) `dependencies`  
**Modernization process:** [owned-package-modernization-checklist.md](./owned-package-modernization-checklist.md)

## Summary (current)

| Class | Count | Policy |
|-------|------:|--------|
| **Owned** (`builtbygio/*` git pins) | ~32 | Maintenance + modernization (product packages) |
| **Upstream Atom** (`atom/*` git pins) | ~33 | **Only `language-*`** — deferred (see follow-up issue) |
| **In-repo** (`file:packages/*`) | ~29 | Monorepo packages (themes, about, welcome, natives, …) |
| **npm registry** | rest | Host npm / Electron rebuild |

## Owned product packages (`builtbygio/*`)

### Tier-1 (security-sensitive / high touch)

| Package | Notes |
|---------|--------|
| autocomplete-plus | Editor |
| command-palette | Core UI |
| find-and-replace | Editor |
| fuzzy-finder | Core |
| github | Git / GitHub (utilityProcess workers — Phase S3) |
| markdown-preview | HTML/markdown SCA priority |
| notifications | Core UI |
| settings-view | Pulsar registry, IPC |
| snippets | Editor |
| spell-check | Editor |
| status-bar | Core UI |
| tabs | Core UI |
| tree-view | FS UI |

### Next-tier (forked for ownership; modernize with checklist)

| Package | Role |
|---------|------|
| archive-view | Archives |
| image-view | Images |
| open-on-github | GitHub links |
| symbols-view | Symbols / ctags |
| package-generator | Scaffold packages |
| styleguide | Style guide |
| timecop | Perf UI |
| autocomplete-atom-api → **autocomplete-chevron-api** | API completions (renamed fork) |
| autocomplete-css | CSS completions |
| autocomplete-html | HTML completions |
| autocomplete-snippets | Snippet completions |
| autosave | Autosave |
| background-tips | Tips |
| bookmarks | Bookmarks |
| bracket-matcher | Brackets |
| encoding-selector | Encodings |
| keybinding-resolver | Keybinding UI |
| whitespace | Whitespace |
| wrap-guide | Wrap guide |

## Deferred: `language-*` on `atom/*`

Grammars only; re-pin or fork when a language breaks or for supply-chain hygiene. Tracked separately (language-pack ownership issue). Full list is every `language-*` dependency in root `package.json` still pointing at `github.com/atom/*` (~33), except in-repo `language-rust-bundled`.

## Workflow when changing an owned package

1. Commit on `builtbygio/<pkg>`  
2. Bump SHA in Chevron `package.json` + lockfile  
3. Chevron PR — monorepo CI is the gate  

See the [modernization checklist](./owned-package-modernization-checklist.md).

## Related

- [sca-runtime-inventory.md](./sca-runtime-inventory.md)  
- [package-node-policy.md](./package-node-policy.md)  
