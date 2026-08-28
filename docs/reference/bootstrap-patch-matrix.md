# Bootstrap patch matrix

**Audience:** maintainers changing Electron, Node, or native pins  
**Entry:** `./script/bootstrap-modern`  
**Related:** [toolchain-node-python-upgrade-plan.md](../process/toolchain-node-python-upgrade-plan.md), build audit Streams A–B

There are **no** remaining `script/lib/patch-*.js` mutators. Fixes live in owned `builtbygio` pins. The only install-time native rewrite is `force-patched-superstring.sh` (monorepo superstring / watcher source over npm), and it runs **only when** natives are rebuilt.

## Host contract (Stream A)

| Tool | Required |
|------|----------|
| Node | **20–24** (prefer 24 / `.nvmrc`) |
| Python | **3.11–3.13** (prefer 3.12 + `setuptools`) |
| App deps | host **npm ci --ignore-scripts --legacy-peer-deps** |
| Natives | rebuilt for **Electron** (`package.json` `electronVersion`) |

Override soft native failures only with `CHEVRON_ALLOW_NATIVE_REBUILD_FAILURES=1` (not for CI).

## Patch inventory

| Script | Class | Purpose | Retirement path |
|--------|-------|---------|-----------------|
| ~~`patch-dep-package-json.js`~~ | Hygiene retired | scandal `isbinaryfile@2` `main` | [builtbygio/isbinaryfile](https://github.com/builtbygio/isbinaryfile) + `overrides["isbinaryfile@2"]` — **deleted** |
| ~~`patch-packages-remote-ipc.js`~~ | B retired | `atom-pathspec` `remote.app` | [builtbygio/atom-pathspec](https://github.com/builtbygio/atom-pathspec) — **deleted** |
| ~~`patch-nested-nan.js`~~ | A retired | nested nan hoist | `overrides.nan=2.28.0` — **deleted** |
| ~~`patch-natives-context-aware.js`~~ | A retired | `NODE_MODULE` → `CONTEXT_AWARE` | Folded into owned native forks — **deleted** |
| ~~`patch-v8-api.js`~~ | A retired | V8 15 removals | Folded into owned native forks — **deleted** |
| ~~`patch-oniguruma-gyp.js`~~ | A retired | GCC 14 + K&R | Folded into builtbygio/node-oniguruma — **deleted** |
| ~~`patch-spellchecker-win.js`~~ | A retired | MSVC C2440 | Folded into builtbygio/node-spellchecker — **deleted** |
| ~~`patch-keytar-nan.js`~~ | A retired | keytar nested nan | Folded into builtbygio/node-keytar (`nan@2.28.0`) — **deleted** |
| ~~`patch-decaffeinate-bundled-packages.js`~~ | C retired | Folded into owned pins | **Deleted** |
| ~~`patch-debabel-bundled-packages.js`~~ | C retired | Folded into owned pins | **Deleted** |
| ~~`patch-tree-view-stats.js`~~ | B retired | Stats.mtime on modern Node | Folded into builtbygio/tree-view — **deleted** |
| ~~`patch-github-remote.js`~~ | B retired | github worker | Folded into builtbygio/github — **deleted** |
| ~~`patch-settings-view-registry.js`~~ | B retired | atom.io → Pulsar | Folded into settings-view — **deleted** |
| ~~`patch-apm-download-node.js`~~ / ~~`patch-apm-npm.js`~~ | D retired | apm debug only | Unused on the cpm path — **deleted** |
| `force-patched-superstring.sh` | A compile | monorepo superstring / watcher source (not `build/`) | Keep while `packages/superstring` is source of truth. Skipped on fingerprint-warm rebuild. `rsync` excludes `build/` so a local host-Node `.node` cannot overwrite the Electron addon. |

Bootstrap no longer rewrites `node_modules` for compile or remote/IPC. The only remaining install-time native step is `force-patched-superstring.sh` (monorepo superstring / watcher overwrite npm **on rebuild**).

### Static patch trees

| Path | Role |
|------|------|
| ~~`script/patches/decaffeinated-bundled-packages/`~~ | Folded into owned SHAs — **deleted** |
| ~~`script/patches/debabelled-bundled-packages/`~~ | Folded into owned SHAs — **deleted** |

## Critical natives (hard gate)

After rebuild (or warm cache skip), these must expose a `.node` under `build/Release/` (see `script/lib/critical-natives.js`):

`superstring`, `@atom/watcher`, `@atom/nsfw`, `@atom/fuzzy-native`, `keytar`, `spellchecker`, `pathwatcher`, `git-utils`, `scrollbar-style`, `nslog`, `keyboard-layout`, `ctags`, `fs-admin`, `oniguruma`.

`tree-sitter` / `tree-sitter-*` are official N-API prebuilds and are **not** rebuilt.

## CI checks

```bash
node --test script/ci/bootstrap-contract.test.js
```

Manual after bootstrap:

```bash
node -e "const c=require('./script/lib/critical-natives'); console.log(c.checkCriticalNatives(process.cwd()))"
```

## Classes (retirement order)

1. **A** — keep until Electron/native upgrades remove need  
2. **B** — delete when bootstrap log always shows no-op / zero files changed  
3. **C** — **retired** (owned pins ship precompiled JS)  
4. **D** — delete with apm debug path  
