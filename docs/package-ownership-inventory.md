# Bundled package ownership inventory

**Status:** living inventory (audit P1 — issues #58, #63)  
**Source of truth for pins:** root [`package.json`](../package.json) `dependencies`  
**Policy:** Tier-1 high-touch packages → `builtbygio/*` forks; remaining `atom/*` pins stay SHA-locked until forked or replaced.

## Summary (0.6.x baseline)

| Class | Count | Policy |
|-------|------:|--------|
| **Owned** (`builtbygio/*` git pins) | 13 | Primary maintenance + security patches |
| **Upstream Atom** (`atom/*` git pins) | 52 | Unmaintained; SHA pins only — bit-rot / supply-chain risk |
| **In-repo** (`file:packages/*`) | 29 | Monorepo packages (themes, about, welcome, natives, …) |
| **npm registry** (semver / file natives) | rest | Host npm / Electron rebuild |

## Owned forks (`builtbygio/*`) — keep current

| Package | Role | Notes |
|---------|------|--------|
| autocomplete-plus | Editor | TS lib; openExternal via applicationDelegate |
| command-palette | Core UI | Owned |
| find-and-replace | Editor | Symlink probes via IPC |
| fuzzy-finder | Core | Path probes via main |
| github | Git / GitHub | Residual remote cleanup; workers still Node BWs (Phase S) |
| markdown-preview | Preview | HTML/markdown — SCA priority (`dompurify`/`marked`) |
| notifications | Core UI | Owned |
| settings-view | Settings / install | Pulsar registry; avatar cache IPC |
| snippets | Editor | Owned |
| spell-check | Editor | Owned |
| status-bar | Core UI | Owned |
| tabs | Core UI | Cross-window DnD without remote |
| tree-view | FS UI | Bulk fs via main IPC |

## Risk classes for remaining `atom/*` pins

| Risk | Meaning | Default action |
|------|---------|----------------|
| **high-touch** | Node, network, HTML preview, or security-sensitive UI | Fork next when touching |
| **medium-ui** | Core editor UI, low native surface | Fork when fixing Electron breakages |
| **low-grammar** | TextMate/tree language packages | Leave on SHA; re-pin only if broken |

### high-touch / medium (fork queue)

Prefer forking when any of: Electron breakage, SCA hit, or security patch needed.

| Package | SHA (short) | Risk | Suggested action |
|---------|-------------|------|------------------|
| archive-view | `762c5b6` | medium-html | Fork if archive CVE / ls-archive issues |
| image-view | `4b5eb10` | medium-html | Fork if guest/file handling issues |
| styleguide | `aa4f682` | medium-html | Low priority product surface |
| open-on-github | `c12ffbe` | medium-node | Network + shell; fork when next touch |
| package-generator | `5c45f80` | medium-node | Generates packages; fork if used in docs |
| symbols-view | `36c4dd4` | medium-node | ctags / process; fork if rebuild pain |
| timecop | `f7d9543` | medium-node | Devtools-ish; can lag |
| autocomplete-atom-api | `f772a3f` | medium-editor | Bootstrap decaffeinate (#62); fork when next touch |
| autocomplete-css | `5307928` | medium-editor | Bootstrap decaffeinate (#62); fork when next touch |
| autocomplete-html | `cee2467` | medium-editor | Leave until break |
| autocomplete-snippets | `2da0e23` | medium-editor | Leave until break |
| autosave | `129cbb9` | medium-ui | Leave until break |
| background-tips | `e54189c` | medium-ui | Leave until break |
| bookmarks | `35363fb` | medium-ui | Bootstrap decaffeinate (#62); fork when next touch |
| bracket-matcher | `d07c17c` | medium-ui | Leave until break |
| encoding-selector | `e445c69` | medium-ui | Leave until break |
| keybinding-resolver | `c65b0fb` | medium-ui | Leave until break |
| whitespace | `53d5ba9` | medium-ui | Leave until break |
| wrap-guide | `6a4f577` | medium-ui | Bootstrap decaffeinate (#62); fork when next touch |

### low-grammar (defer)

All `language-*` packages pinned to `atom/*` (except in-repo `language-rust-bundled`). Action: **leave** on SHA; re-pin only for syntax regressions. Full list is the `language-*` entries in root `package.json` dependencies (34 packages).

## Workflow when forking

1. Create `builtbygio/<package>` from the pinned commit  
2. Apply Chevron patches (no `remote`, IPC, Pulsar as needed)  
3. Set `repository` + `engines.chevron`  
4. Bump SHA in Chevron `package.json` + lockfile  
5. Land via monorepo CI (bootstrap → build → smoke)  

Package-repo CI stays metadata-only (see [package-node-policy.md](./package-node-policy.md)).

## Next ownership tranche (recommended)

Order for proactive forks (not blocking 0.6.x):

1. **archive-view** / **image-view** — content handlers  
2. **open-on-github** / **symbols-view** — process + network  
3. **bracket-matcher** / **whitespace** — high daily use if Electron breaks  

Language packs remain last unless a grammar blocks smoke.

## Related

- [sca-runtime-inventory.md](./sca-runtime-inventory.md)  
- [package-node-policy.md](./package-node-policy.md)  
- Audit issues #58, #63 under tracking #51  
