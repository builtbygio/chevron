# GROK.md — AtomNova session handoff

Context for the next Grok (or human) session working on this repo.

**Repo:** `/Users/giovanni/Workspace/atom-nova`  
**Remote:** `gdick-crypto/atom-nova`  
**Base:** Atom 1.65.0-dev (Electron **43.1.0**, current stable), not Pulsar  
**Date of this handoff:** 2026-07-14  

---

## Product vision (owner intent)

| Horizon | Goal |
|---------|------|
| **Near term** | Catch up to **current Electron** + **security** (context isolation, no `remote` / renderer Node) |
| **Medium term** | Product depth: **Git** integration, **AI** in-app, packages still first-class |
| **Long term** | Full migration to **Avalonia**, while keeping Atom’s **hackable plugin/package spirit** |

**Rebranding:** deferred. Partial identity already exists in git (`atomnova-editor` / `AtomNova` in `package.json`, README, checklists). Further rebrand (binaries, icons, `Atom Dev` channel name, etc.) is **later**, not the next focus.

**Do not re-base on Pulsar** unless the owner explicitly revisits that decision.

---

## What’s already done

### Build / bootstrap (modern host)

Stock `./script/bootstrap` fails on modern macOS (Node 24, Python 3.14, dead atom.io headers). Working path:

```bash
nvm use                 # .nvmrc → 16
./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap
open "out/Atom Dev.app"   # still named Atom Dev (channel-based)
```

| Artifact | Role |
|----------|------|
| `.nvmrc` | Pins **Node 16** |
| `script/lib/modern-env.sh` | Node 16, Python 3.11, C++14, `ATOM_ELECTRON_URL`, gyp `rU` patch helper |
| `script/with-modern-env` | Run any command with modern env |
| `script/bootstrap-modern` | Full dep install with apm Node-12 ABI targeting + patches |
| `docs/bootstrap-report.md` | Failure ladder + rules |
| `README.md` | AtomNova intro + modern build docs |

**Host prerequisites that worked:** nvm Node 16.20.2, Homebrew Python 3.11, `~/.local/bin/python` → python3.11, `CXXFLAGS=-std=c++14`, `ATOM_ELECTRON_URL=https://www.electronjs.org/headers`.

### Runtime fixes

1. **Startup snapshot** — electron-link cannot parse modern `node:` requires or `undici` private fields. Exclusions in `script/lib/generate-startup-snapshot.js`.
2. **Blank window** — caused by regenerating snapshot **without** `prebuild-less-cache` in the same process → missing `lessSourcesByRelativeFilePath` → ThemeManager TypeError on `about.less`.  
   - Fix: always full `script/build`; defensive `|| {}` in `src/theme-manager.js`; `.catch(handleSetupError)` on `setupWindow()` in `static/index.js`.  
   - **Rule:** never call `generateStartupSnapshot` alone in a fresh Node process.
3. **Dock icon but no window (Electron 14)** — stacked issues after the Electron 14 upgrade (all addressed):
   - Page `require is not defined` under default isolation → **`static/preload.js`** boots Atom in the preload Node world; page has no Node (`contextIsolation: true`, `nodeIntegration: false`).
   - Built-in `electron.remote` removed → **`src/remote-compat.js` + `register-renderer-ipc.js`** (no `@electron/remote`).
   - Non-context-aware `NODE_MODULE` natives → `script/lib/patch-natives-context-aware.js` + rebuild (wired into `bootstrap-modern`). Vendored packages (`superstring`, `watcher`, `tree-sitter`) are already patched in-tree.
   - Custom elements un-upgraded under isolation → `src/create-custom-element.js` (`new Class()`).
4. **Hygiene** — auto-update does **not** default to `atom.io` (set `ATOM_UPDATE_URL_PREFIX` to opt in); `isAtomRepoPath` / module-cache accept `atomnova-editor`.

### Docs / planning

- `MIGRATION-CHECKLIST.md` — Phase 1 modernization checklist  
- `docs/REBRANDING.md` — rebrand checklist (deferred execution)  
- Priority discussion (not a file): telemetry off, Electron ladder, package API for Avalonia later  

### Git (as of handoff)

Useful commits on `master` (may already be on origin):

- Migration checklist, partial package.json rebrand, rebranding doc  
- Modern bootstrap tooling + snapshot exclusions  
- Blank-window fix  
- `.nvmrc` + README build docs (`80ad636ff` area)  

Uncommitted rebrand WIP was **discarded** with `git restore` (owner postponed full rebrand).

---

## Current technical baseline

| Item | Value |
|------|--------|
| Electron | **43.1.0** — **current stable; ladder complete** |
| Package name | `atomnova-editor` |
| productName | `AtomNova` |
| Built app name | Still **Atom Dev** via `script/config.js` channel logic |
| Security model | **`contextIsolation: true`**, `nodeIntegration: false` (page); Atom boots in **preload** (Node); no `@electron/remote` |
| Telemetry | **Removed** — no metrics/exception-reporting packages; crash upload forced off; consent default `no` |
| apm | Bundled Node **12.14.1**; registry/update still Atom-era |

---

## What needs to be done next

### Immediate next epic: Electron + security

Do **not** start Avalonia or deep rebrand next.

Suggested order:

1. **Hygiene**  
   - ~~Disable metrics / exception-reporting / crash upload~~ **done**  
   - ~~Stub auto-update (no default atom.io feed)~~ **done** — set `ATOM_UPDATE_URL_PREFIX` when a real feed exists  

2. **Electron upgrade plan**  
   - **Now on 43.1.0, current stable — ladder complete** (done 2026-07-14)  
   - Re-inventory natives + ABI rebuilds each rung  
   - 14→18 lessons: `allowRendererProcessReuse` escape hatch is gone (E17), so
     **every** renderer native must be truly context-aware — the patcher now
     finds `binding.cc` anywhere in a tree-sitter package (css uses
     `bindings/node/`, typescript has `typescript/src` + `tsx/src`);
     `package-lock.json` needed git-dep `integrity` stripped and `git://` →
     `git+https://` (GitHub killed git:// and old tarball hashes drifted);
     apm's npm 6 needs `patch-apm-npm.js` (npm/npm#19877 crash);
     window proxy in `renderer-ipc.js` now bridges BrowserWindow
     `blur`/`focus`/`removeListener` to DOM events (background-tips).  
   - 18→22 lessons: Electron 20+ headers reject node-gyp < 9 (config.gypi
     guard) → apm's bundled gyp 5 can't build anything; `bootstrap-modern`
     now uses `script/node_modules/.bin/node-gyp` (9.x) and `npm rebuild`
     for Electron ≥ 20. C++ standard bumped to **c++17** in `modern-env.sh`
     (E22 common.gypi builds gnu++17). V8 10.x removed `CreationContext()`
     → `script/lib/patch-v8-api.js` rewrites to `GetCreationContext()`.
     **V8 memory cage (E21+)**: wrapping `malloc`ed memory in ArrayBuffers
     aborts the renderer — vendored `packages/tree-sitter`
     (`conversions.cc`, `node.cc`) now lets V8 allocate transfer buffers
     and points the native pointer at `GetBackingStore()->Data()`.  
   - 22→28 lessons: `ipcRenderer.sendTo` removed → github worker.js
     rewritten to main's `atom-wc-send` relay (`patch-github-remote.js`).
     npm 6 **rewrites package-lock on every install**, reintroducing specs
     it can't parse next time → `fix-package-lock.js` normalizes before
     each apm install (name-prefixed git requires, git:// urls, git
     integrity). V8 12 (E28) changed `GetInternalField` to return
     `Local<Data>`; nested nan 2.17 copies (lockfile-pinned) fail to
     compile → `patch-nested-nan.js` replaces them with root nan 2.28
     (careful: `@atom/watcher/src/nan` is *source*, not the package).  
   - 28→43 lessons: V8 15 needs **C++20** and `<source_location>` — CLT
     clang 14 can't; `modern-env.sh` selects `/Applications/Xcode.app`
     via `DEVELOPER_DIR` for Electron ≥ 40 and gnu++20 for ≥ 29.
     `patch-v8-api.js` grew: `Context/Object::GetIsolate()` removed,
     `String::Write*` promoted to the V2 signatures
     (`Write(isolate, offset, length, buffer, flags)`, explicit
     capacity, no clamping/NUL) — vendored superstring/tree-sitter
     fixed in-tree, oniguruma/spellchecker/fuzzy-native via patch.
     Newer macOS SDKs type `iconv_t` as a struct ptr (superstring cast
     fixed). **Custom V8 startup snapshot is DISABLED on 43**:
     `v8_context_snapshot_generator` SIGTRAPs on Atom's custom blob
     (tiny/synthetic blobs fine — content-specific); build falls back
     to stock snapshots with a warning (slower startup, `snapshotResult`
     undefined, plain-require path like `--dev`). Follow-up: bisect
     electron-link output vs the generator. `path-watcher.js` no longer
     assumes the `atom` global (main-process ConfigFile.watch).  

3. **Security architecture**  
   - **Inventory:** `docs/remote-ipc-inventory.md`  
   - **P0–P4 done:** no `@electron/remote`; IPC `remote-compat`  
   - **Preload + contextIsolation done:** page has no Node; `static/preload.js` boots Atom; custom elements use `create-custom-element.js`  
   - **IPC trust boundary (PR #5):** `openExternal` scheme allowlist; no `executeJavaScript` over webContents IPC; worker `webPreferences` fixed  
   - **Packaged github workers:** unpack `node_modules/github/lib/**` so `file://` worker HTML resolves under `app.asar.unpacked`  
   - **Phase N (in progress):** narrow package Node surface — see `docs/security-phase-n.md`
4. **Native modules + CI**  
   - Rebuild against each Electron ABI  
   - GitHub Actions for bootstrap/build/test on modern OS  

5. **Package compatibility**  
   - Keep `atom` global and package API where possible  
   - Deprecate renderer Node / `remote` for package authors  
   - Document breakage for community packages  

### Later (after Electron is modern)

- Full rebrand (binary names, icons, bundle ID, help URLs)  
- Git UX polish, in-app AI (service-first APIs)  
- Avalonia spike: rehost a thin package/service surface in native UI  

### Explicitly out of scope unless asked

- Rebase onto Pulsar  
- Aggressive rename of `atom` JS API  
- New package registry before security baseline  

---

## Known landmines

| Landmine | Mitigation |
|----------|------------|
| Node ≠ 16 for bootstrap | `nvm use` / `.nvmrc` |
| Python ≥ 3.12 | Use 3.11 + `python` shim |
| `atom.io/download/electron` dead | `ATOM_ELECTRON_URL=https://www.electronjs.org/headers` |
| Snapshot without less prebuild | Full `script/build` only |
| `superstring@2.4.4` vs Electron 14+ | Vendored `packages/superstring` with `GetBackingStore` patch (`2.4.4-atomnova.1`) |
| Non-context-aware natives on Electron 12+ | `node script/lib/patch-natives-context-aware.js` then rebuild natives |
| `electron.remote` on Electron 14+ | **Resolved:** `src/remote-compat.js` + `register-renderer-ipc.js` (no `@electron/remote`) |
| Packaged vs dev | Packaged uses snapshot; `--dev --resource-path=$PWD` skips it |
| Probing the app from outside | `window.atom` lives in the **preload isolated world**, not the page: with `--remote-debugging-port` + CDP, enumerate `Runtime.executionContextCreated` and evaluate in the "Electron Isolated Context" (main-world evals silently see no Atom) |
| Nested superstring without `.node` | After rebuild, copy `packages/superstring` **including** `build/` into nested installs (force-patched script excludes `build/` on purpose) |
| `keytar` native missing / fails to build | github needs `keytar.node`; keytar 4.x needs `nan` ≥ 2.22 for Electron 14, then electron-rebuild |
| GitHub worker windows | Still `contextIsolation: false` + Node (trusted hidden windows via remote-compat) |
| Packaged github `renderer.html` not found | Unpack `github/lib/**` in `script/lib/package-application.js` (workers load via `file://` under `.asar.unpacked`) |
| `keytar` native missing / fails to build | github package needs `keytar.node`; rebuild for Electron ABI (nan ≥ 2.22 under keytar 4.x, or upgrade keytar) |
| Helper Info.plist re-packaging | `setAtomHelperVersion` uses Set-or-Add (plain Add fails if keys already exist) |

---

## How to resume quickly

```bash
cd /Users/giovanni/Workspace/atom-nova
git status
nvm use
# If node_modules missing:
./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap
open "out/Atom Dev.app"
```

Read first:

1. This file (`GROK.md`)  
2. `docs/bootstrap-report.md`  
3. `MIGRATION-CHECKLIST.md`  
4. `src/main-process/atom-window.js` (security flags)  
5. `package.json` (`electronVersion`)  

---

## Success criteria for the “Electron catch-up” phase

- [x] Runs on a **current** Electron stable release (**43.1.0**)  
- [x] No production reliance on `@electron/remote` (compat IPC layer remains)  
- [x] `contextIsolation: true` (page); Node only in preload  
- [x] No metrics/crash upload; auto-update not pointed at atom.io by default  
- [ ] Documented build + CI green on at least one modern platform  
- [ ] Core editor + critical packages usable; package migration notes published  

---

*Written as session handoff so the next agent can continue without re-deriving bootstrap and blank-window history.*
