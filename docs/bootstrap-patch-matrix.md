# Bootstrap patch matrix

**Audience:** maintainers changing Electron, Node, or native pins  
**Entry:** `./script/bootstrap-modern`  
**Related:** [toolchain-node-python-upgrade-plan.md](./toolchain-node-python-upgrade-plan.md), build audit Streams A–B

Idempotent scripts under `script/lib/patch-*.js` rewrite `node_modules` (and some monorepo natives) after host `npm ci --ignore-scripts`. Goal: **shrink this list** by folding fixes into pins/sources.

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
| `patch-nested-nan.js` | A compile | replace nested nan &lt; root | Root `overrides.nan=2.28.0`; keep until a clean bootstrap log is always no-op |
| `patch-dep-package-json.js` | Hygiene | DEP0128 / broken package.json | Fix upstream package metadata |
| ~~`patch-natives-context-aware.js`~~ | A retired | `NODE_MODULE` → `CONTEXT_AWARE` | Folded into owned native forks — **deleted** |
| ~~`patch-v8-api.js`~~ | A retired | V8 15 removals | Folded into owned native forks — **deleted** |
| ~~`patch-oniguruma-gyp.js`~~ | A retired | GCC 14 + K&R | Folded into builtbygio/node-oniguruma — **deleted** |
| ~~`patch-spellchecker-win.js`~~ | A retired | MSVC C2440 | Folded into builtbygio/node-spellchecker — **deleted** |
| ~~`patch-keytar-nan.js`~~ | A retired | keytar nested nan | Folded into builtbygio/node-keytar (`nan@2.28.0`) — **deleted** |
| ~~`patch-decaffeinate-bundled-packages.js`~~ | C retired | Folded into owned pins | **Deleted** |
| ~~`patch-debabel-bundled-packages.js`~~ | C retired | Folded into owned pins | **Deleted** |
| ~~`patch-tree-view-stats.js`~~ | B retired | Stats.mtime on modern Node | Folded into builtbygio/tree-view — **deleted** |
| `patch-packages-remote-ipc.js` | B safety net | remote → IPC | Folded into builtbygio; keep until always no-op |
| `patch-github-remote.js` | B safety net | github worker | Folded into builtbygio/github |
| `patch-settings-view-registry.js` | B safety net | atom.io → Pulsar | Folded into settings-view; re-run after intermediate transpile |
| `patch-apm-download-node.js` / `patch-apm-npm.js` | D legacy | apm debug only | Remove when `--with-apm` is deleted |
| `force-patched-superstring.sh` | A compile | monorepo superstring wins | Keep while monorepo packages/superstring is source of truth |

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
