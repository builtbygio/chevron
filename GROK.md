# GROK.md — AtomNova session handoff

Context for the next Grok (or human) session working on this repo.

**Repo:** `/Users/giovanni/Workspace/atom-nova`  
**Remote:** `gdick-crypto/atom-nova`  
**Base:** Atom 1.65.0-dev (Electron **11.5.0**), not Pulsar  
**Date of this handoff:** 2026-07-12  

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
| Electron | **14.2.9** (upgrade in progress from 11.5; bootstrap may need native patches) |
| Package name | `atomnova-editor` |
| productName | `AtomNova` |
| Built app name | Still **Atom Dev** via `script/config.js` channel logic |
| Security model | `nodeIntegration: true`, `enableRemoteModule: true` (`src/main-process/atom-window.js`) |
| Telemetry | **Removed** — no metrics/exception-reporting packages; crash upload forced off; consent default `no` |
| apm | Bundled Node **12.14.1**; registry/update still Atom-era |

---

## What needs to be done next

### Immediate next epic: Electron + security

Do **not** start Avalonia or deep rebrand next.

Suggested order:

1. **Hygiene (partially done)**  
   - ~~Disable metrics / exception-reporting / crash upload~~ **done**  
   - Disable or stub auto-update (`ATOM_UPDATE_URL_PREFIX` / feed defaults)  

2. **Electron upgrade plan**  
   - Pick target **current stable Electron**  
   - Plan step ladder (e.g. 11 → 14 → 18 → 22 → 28 → current)  
   - Inventory `remote` usage (core + packages) and native modules  

3. **Security architecture**  
   - Replace `electron.remote` with IPC + **preload**  
   - `contextIsolation: true`, `nodeIntegration: false`  
   - Temporary `@electron/remote` only if needed as a bridge with a kill list  

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
| `name === 'atom'` in main/module-cache | Dev repo detect may be wrong for `atomnova-editor` |
| Packaged vs dev | Packaged uses snapshot; `--dev --resource-path=$PWD` skips it |

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

- [ ] Runs on a **current** Electron stable release  
- [ ] No production reliance on `remote` / renderer `nodeIntegration`  
- [ ] contextIsolation enabled  
- [ ] No unexpected traffic to atom.io / Bugsnag (or fully user-owned endpoints)  
- [ ] Documented build + CI green on at least one modern platform  
- [ ] Core editor + critical packages usable; package migration notes published  

---

*Written as session handoff so the next agent can continue without re-deriving bootstrap and blank-window history.*
