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
| `patch-natives-context-aware.js` | A compile | `NODE_MODULE` → `CONTEXT_AWARE` | Upstream/native pins use context-aware macros |
| `patch-keytar-nan.js` | A compile | keytar nested nan too old for Electron 14+ | Drop nested nan; depend on root nan ≥2.22 |
| `patch-nested-nan.js` | A compile | replace nested nan &lt; root | Lockfile only root nan; no nested copies |
| `patch-v8-api.js` | A compile | `CreationContext` → `GetCreationContext` | Fix superstring/tree-sitter sources in monorepo + pins |
| `patch-oniguruma-gyp.js` | A compile | GCC 14 + K&R in oniguruma | Pin modern oniguruma / gyp |
| `patch-spellchecker-win.js` | A compile | MSVC C2440 temp wstring | Upstream spellchecker fix |
| `patch-dep-package-json.js` | Hygiene | DEP0128 / broken package.json | Fix upstream package metadata |
| `patch-decaffeinate-bundled-packages.js` | C bridge | #62 coffee → JS for atom/* leftovers | Replace pins with precompiled SHAs; delete `script/patches/decaffeinated-*` |
| `patch-debabel-bundled-packages.js` | C bridge | #62 babel-prefix → JS | Same; delete `script/patches/debabelled-*` |
| `patch-packages-remote-ipc.js` | B safety net | remote → IPC | Folded into builtbygio; keep until always no-op |
| `patch-github-remote.js` | B safety net | github worker | Folded into builtbygio/github |
| `patch-tree-view-stats.js` | B safety net | Stats.mtime on modern Node | Folded into tree-view pin |
| `patch-settings-view-registry.js` | B safety net | atom.io → Pulsar | Folded into settings-view; re-run after intermediate transpile |
| `patch-apm-download-node.js` / `patch-apm-npm.js` | D legacy | apm debug only | Remove when `--with-apm` is deleted |
| `force-patched-superstring.sh` | A compile | monorepo superstring wins | Keep while monorepo packages/superstring is source of truth |

### Static patch trees

| Path | Role |
|------|------|
| `script/patches/decaffeinated-bundled-packages/` | Offline JS for remaining coffee `lib/` atom pins |
| `script/patches/debabelled-bundled-packages/` | Offline JS for babel-prefix atom pins |

## Critical natives (hard gate)

After rebuild (or warm cache skip), these must expose a `.node` under `build/Release/` (see `script/lib/critical-natives.js`):

`superstring`, `tree-sitter`, `@atom/watcher`, `@atom/nsfw`, `@atom/fuzzy-native`, `keytar`, `spellchecker`, `pathwatcher`, `git-utils`, `scrollbar-style`, `nslog`, `keyboard-layout`, `ctags`, `fs-admin`, `oniguruma`.

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
3. **C** — delete when no atom/* coffee/babel pins remain  
4. **D** — delete with apm debug path  
