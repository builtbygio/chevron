# GROK.md — Chevron session handoff

Context for the next Grok (or human) session. Prefer this file + CHANGELOG over archaeology.

**Repo:** `builtbygio/chevron` (local: workspace `chevron`)  
**Product:** **Chevron** — modernized Atom fork  
**Date of this handoff:** 2026-08-14 (#125: own remaining loaders + language-* + github CJS)

---

## Product vision

| Horizon | Goal |
|---------|------|
| **Near term** | 1.0 dogfood (#106); Jasmine nightly is wired (#57) |
| **Medium term** | Package host v2, Git polish, optional AI |
| **Long term** | Possible Avalonia rehost; keep hackable package spirit |

**Do not** rebase onto Pulsar unless the owner revisits that decision.  
**Chevron only:** product API is `global.chevron` / `require('chevron')` / `engines.chevron` / `~/.chevron`. Atom surfaces are unsupported legacy shims (may be removed). See [docs/REBRANDING.md](docs/REBRANDING.md).  
**Packages:** **owned catalog only** for now; sandboxed community packages later (host v2). See [docs/package-ecosystem-strategy.md](docs/package-ecosystem-strategy.md).

---

## Current baseline (1.0.1 unsigned preview)

| Item | Value |
|------|--------|
| Version | **1.0.1** (unsigned preview — [docs/releases.md](docs/releases.md)) |
| Electron | **43.1.0** (ladder complete) |
| Package / productName | `chevron` / **Chevron** |
| Bundle ID | `dev.builtbygio.chevron` |
| Security (page) | `contextIsolation: true`, `nodeIntegration: false` |
| Security (preload) | Node + natives; `sandbox: false` (**Phase S Option C** — intentional) |
| Git workers | **utilityProcess** (BW emergency-only) |
| Community packages | Privileged `require` **restricted by default** |
| FS IPC | Strict roots **on** by default (`core.fsIpcStrict`) |
| Telemetry | Off — no metrics/exception-reporting; crash upload forced off |
| Package manager | **cpm** (Electron-as-Node); **apm → cpm shim** |
| Registry | **Pulsar** (`https://api.pulsar-edit.dev`); `CPM_REGISTRY_URL` override |
| Bootstrap | **host npm** + `@electron/rebuild` via `./script/bootstrap-modern` |
| CI | macOS x64/arm64, Linux x64/arm64 (packages + smoke), Windows x64 |

---

## What's done (recent epics)

### Electron best-practices (P0–P3 shippable) — **complete in 0.6.0**

Authoritative plan (closed): **`docs/electron-best-practices-plan.md`**.  
Threat model: **`docs/security-threat-model.md`**.

| Stream | Status |
|--------|--------|
| P0.1 Protocol path confinement | **Done** |
| P0.2 bw-id method + ownership allowlist | **Done** |
| P0.3 wc-send ownership | **Done** |
| P1.1 CSP tighten | **Done** |
| P1.2 Community require restrict default-on | **Done** |
| P1.3 Experimental web features default off | **Done** |
| P1.4 Threat model doc | **Done** |
| P2.1 FS IPC strict roots | **Done** |
| P2.2 sendSync → invoke | **Closed** (inventory only — `docs/remote-ipc-inventory.md` §11) |
| P2.3 `nodeIntegrationInWorker: false` | **Done** |
| P2.4 Guest `file:` roots | **Done** |
| P3.2 Production Electron fuses | **Done** (ASAR integrity macOS-only) |
| P3.4 `certificate-error` deny | **Done** |
| P3.1 utilityProcess workers | **Follow-on** (github rewrite) |
| P3.3 Editor `sandbox: true` | **Declined (Option C)** — see security-phase-s-decision.md |

### Electron + remote removal

- Electron ladder → **43.1.0**
- No `@electron/remote`; `src/remote-compat.js` + `register-renderer-ipc.js`
- Preload boot: `static/preload.js` → Atom in isolated world
- Custom elements: `src/create-custom-element.js`
- IPC trust boundary (openExternal scheme allowlist, no executeJavaScript over webContents IPC)

### cpm (Phases 0–4) — **complete**

| Phase | Outcome |
|-------|---------|
| 0 | Host npm for app deps; apm off bootstrap critical path |
| 1 | cpm CLI (install/list/rebuild/…) under Electron-as-Node |
| 2 | Pulsar registry search/view/install-by-name |
| 3 | Prefer native prebuilds before source rebuild |
| 4 | Product ships cpm only; apm name is shim |

Docs: `docs/cpm-design.md`, `docs/cpm-cutover.md`, `docs/cpm-prebuilds.md`.

### Branding / packaging

- Chevron identity, icons, dual config home, multi-platform packages (0.2–0.3)
- Settings UI + build patches force Pulsar (not dead atom.io)

### Security Phase N — **complete** (pre-BP)

| Stream | Status |
|--------|--------|
| N0–N5.1 | **Done** (guests sandboxed; package workers hardened; editor stays hackable) |
| Tier-1 package forks | **Pinned** to `builtbygio/*` |
| N2 patches folded into forks | **Done** |
| Nine package libs → TypeScript + zero CoffeeScript first-party | **Done** |
| Phase S | **Complete (Option C)** — `docs/security-phase-s-decision.md` |

---

## Owned package CI (Option B — monorepo gate)

Tier-1 `builtbygio/*` package repos are **pin sources**, not standalone Atom products.

| Where | What runs |
|-------|-----------|
| **Package fork** | Optional lightweight CI (`package.json` / `repository` / `engines.chevron`). **No** `UziTech/action-setup-atom`, **no** `atom --test`. |
| **Chevron monorepo** | Real gate: `bootstrap-modern` → build → smoke (packages load under Electron 43). Optional later: `script/test --package <name>`. |

Workflow when changing a package:

1. Land commit on `builtbygio/<pkg>`  
2. Bump SHA in Chevron `package.json` + lockfile  
3. Open Chevron PR — CI there is the signal  

---

## What needs to be done next

### 1.0 unsigned preview — **published**

Tag `v1.0.1` (after `v1.0.0`). Docs: [docs/releases.md](docs/releases.md), [docs/dogfood-1.0.md](docs/dogfood-1.0.md).  
Tracker: **#106**. 1.0.1 mac zips are per-arch (`chevron-mac-x64.zip` / `chevron-mac-arm64.zip`).

Landed with 1.0 / immediately after:

| Item | PR |
|------|-----|
| SCA sanitizer + dugite tar | #103 |
| Class C decaff/debabel folded into owned SHAs | #104 |
| Unsigned preview publish + GitHub Releases update URL | #105 |
| Per-arch mac zip names | #107 |
| Empty tree-view / Open a Project / false `registerElement` deprecation | #108 |
| Defer heavy package preload | #120 |
| Custom V8 snapshot (Linux/Windows; Darwin stock) | #121 |
| Ship ripgrep; cpm ls/outdated; desktop uninstall helper | #122 |
| Colour + own remaining natives + delete bootstrap patches | #123 |
| Modernize those native forks (keep required APIs) | #124 |

### Phase S — **complete**

Authoritative: **`docs/security-phase-s.md`** + **`docs/security-phase-s-decision.md`** (Option C).  
Editor `sandbox: false` is intentional; utilityProcess git workers; T2 require restrict.

### LSP — **phases 0–5 landed**

[docs/lsp-design.md](docs/lsp-design.md). Host v2 / more servers later.

### Primary next tracks

1. **Dogfood week (#106)** — use the unsigned preview; file blockers. Smoke is not dogfood.  
2. **#57** — `cpm` + `script/ci` units already on every PR. Full `script/test` is Linux nightly + dispatch / PR label `jasmine` ([docs/jasmine-ci.md](docs/jasmine-ci.md)); first nightlies are measurement, not a merge gate.  
3. **#79 done** — all bundled `language-*` are `builtbygio` pins (tree-sitter ones + 22 TextMate-only). No `atom/*` app git pins.
4. Residual `@atom/*` **names** (`@atom/watcher`, `@atom/nsfw`, `@atom/fuzzy-native`) — owned repos, old npm scope.
5. **Startup perf** — custom V8 snapshot on Linux/Windows/Darwin (eval-only). Constructor heap still runtime. See [docs/startup-snapshot-plan.md](docs/startup-snapshot-plan.md).  
6. **Later:** sandboxed community packages (package host v2); `@electron/packager`; signing
7. **Build:** `./script/bootstrap-modern` then `./script/with-modern-env ./script/build --no-bootstrap`. Bare `./script/build` now packages if the tree is already bootstrapped (does not call the dead stub).

### Known dogfood leftovers (found 2026-08-13)

- **Fixed in #108:** empty tree-view — `collectDefaultRoots` used `atomApplication.windows` (never set); must use `getAllWindows()`. `/tmp` projects hid this. Keep `document-register-element` (contextIsolation); do not Grim-wrap `registerElement`.  
- Owned packages still `require('atom')` in specs/comments (one-shot legacy warning; shim stays).

**Dev policy env:**  
- `CHEVRON_AUDIT_PACKAGE_REQUIRES=1` — log privileged + native requires  
- `CHEVRON_RESTRICT_PACKAGE_REQUIRES=0` — opt **out** of community privileged/native restrict (default is on)  
- `CHEVRON_FS_IPC_STRICT=0` — opt out of strict FS IPC roots  
- `CHEVRON_EXPERIMENTAL_WEB_FEATURES=1` — re-enable experimental Chromium features  
- `CHEVRON_DISABLE_LEGACY_TRANSPILE=1` — refuse legacy Coffee/Babel compile-cache (both already removed at runtime)  
- `CHEVRON_ALLOW_PACKAGE_WORKER_BROWSERWINDOW=1` — **emergency** Node BW git workers only  


### Optional hygiene

- Linux arm64: bootstrap/build are hard gates; **smoke only** is soft-gated (`continue-on-error` on smoke step)  
- Custom V8 snapshot on Linux/Windows/Darwin; `CHEVRON_SKIP_MKSNAPSHOT=1` keeps stock
- Keep `GROK.md` / CHANGELOG current when landing epics  
- Nested `packages/*/node_modules`: untracked; policy in `docs/nested-package-modules.md`  
- CI: Electron + node-gyp cache at `$GITHUB_WORKSPACE/.cache/*`; `node_modules` cache enables bootstrap **native rebuild skip** (`script/lib/natives-fingerprint.js`); force with `CHEVRON_FORCE_NATIVE_REBUILD=1`  

### Later (not next)

- Full Avalonia spike  
- In-app AI  
- Aggressive rename of `atom` JS API  

### Explicitly out of scope unless asked

- Pulsar rebase  
- Hard-delete of remaining Atom shims before a dedicated removal PR  

---

## How to resume quickly

```bash
cd /path/to/chevron
git status
# Host: Node 24 + Python 3.12 (+ setuptools)
./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap

# macOS: open out/Chevron.app
# Linux packages: build with --create-debian-package --create-rpm-package --compress-artifacts
# Smoke: node script/ci/smoke-test.js   # or xvfb-run -a on Linux
```

**Read first:**

1. This file  
2. `docs/security-phase-s.md` (active) + `src/preload-natives.js`  
3. `docs/electron-best-practices-plan.md` (closed)  
4. `docs/security-threat-model.md`  
5. `src/main-process/register-renderer-ipc.js` (trust boundary)  

---

## Known landmines

| Landmine | Mitigation |
|----------|------------|
| Host Node outside 20–24 | `.nvmrc` → **24** |
| Python without distutils | **3.12** + setuptools (CI pin) |
| Dead atom.io Electron headers | `ATOM_ELECTRON_URL=https://www.electronjs.org/headers` |
| Snapshot without less prebuild | Full `script/build` only |
| Non-context-aware natives | Folded into owned `builtbygio` native forks; bootstrap rebuilds for Electron |
| Probing `atom` from CDP | Eval in **Electron Isolated Context**, not page world |
| Nested superstring without `.node` | Re-sync nested natives after rebuild. Force-copy **excludes** `build/` and is skipped on warm cache. |
| GitHub workers | **utilityProcess** by default; Node BW only via `CHEVRON_ALLOW_PACKAGE_WORKER_BROWSERWINDOW=1` |
| Packaged github `renderer.html` | Unpack `github/lib/**` in `package-application.js` |
| Custom mksnapshot on E43 | Generate on every host that can run mksnapshot; soft-fail to stock |
| Windows ASAR integrity fuse | Leave off — FATAL without packager-embedded resources |
| FS IPC `atomApplication.windows` | Never set — use `getAllWindows()` (#108) |
| Skip `document-register-element` | Breaks `document.createElement('atom-*')` under contextIsolation |
| Tree-view tests only under `/tmp` | Temp is always an FS IPC root; real folders can still be blocked |

---

## Success criteria (rolling)

- [x] Current Electron stable  
- [x] No `@electron/remote` in production  
- [x] `contextIsolation` + preload boot  
- [x] No metrics / atom.io auto-update by default  
- [x] Multi-platform CI (macOS, Linux, Windows)  
- [x] cpm Phases 0–4 + Pulsar settings  
- [x] Phase N + Electron BP shippable defaults (protocol/IPC/CSP/require/FS/fuses)  
- [x] Phase S complete under Option C (editor sandbox false intentional; utilityProcess git workers)  
- [ ] Package migration notes for community authors (Node not guaranteed long-term)  


---

*Handoff file — update when an epic lands so the next session does not re-derive history.*
