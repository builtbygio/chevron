# GROK.md — Chevron session handoff

Context for the next Grok (or human) session. Prefer this file + CHANGELOG over archaeology.

**Repo:** `builtbygio/chevron` (local: workspace `chevron`)  
**Product:** **Chevron** — modernized Atom fork  
**Date of this handoff:** 2026-07-22 (0.4.0)

---

## Product vision

| Horizon | Goal |
|---------|------|
| **Near term** | **Security Phase N** — shrink package Node surface; keep Atom package API |
| **Medium term** | Product depth: Git polish, optional AI, packages first-class |
| **Long term** | Possible Avalonia rehost; keep hackable package spirit |

**Do not** rebase onto Pulsar unless the owner revisits that decision.  
**Dual-support forever:** `global.atom`, `atom://`, `engines.atom`, `apm` name (shim → cpm).

---

## Current baseline (0.4.0)

| Item | Value |
|------|--------|
| Version | **0.4.0** |
| Electron | **43.1.0** (ladder complete) |
| Package / productName | `chevron` / **Chevron** |
| Bundle ID | `dev.builtbygio.chevron` |
| Security (page) | `contextIsolation: true`, `nodeIntegration: false` |
| Security (preload) | Node + natives (superstring, pathwatcher, tree-sitter, …); `sandbox: false` |
| Telemetry | Off — no metrics/exception-reporting; crash upload forced off |
| Package manager | **cpm** (Electron-as-Node); **apm → cpm shim** |
| Registry | **Pulsar** (`https://api.pulsar-edit.dev`); `CPM_REGISTRY_URL` override |
| Bootstrap | **host npm** + `@electron/rebuild` via `./script/bootstrap-modern` |
| CI | macOS x64/arm64, Linux x64/arm64 (packages + smoke), Windows x64 |

---

## What's done (recent epics)

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

### Security Phase N (partial)

| Stream | Status |
|--------|--------|
| N0 hygiene / R+I / IPC harden | **Done** |
| N1 github worker unpack | **Done** (live dogfood still useful) |
| N2 shell IPC (openExternal / Finder / trash) | **Done** |
| **N2.1 settings-view avatar cache → main IPC** | **Done in 0.4.0** |
| **N2.2 fuzzy-finder UI path probes → main IPC** | **Done** (Task crawl/rg stays in Task) |
| **N2.3 tree-view bulk fs → main IPC** | **Done** (`fs-via-main` + `register-fs-ipc`) |
| **N2.4 github residual remote** | **Done** (path/webContents/menus; workers IPC) |
| **N3.1 preload inventory + session perms + require audit** | **Done** |
| **N3.2 opt-in community require restrict** | **Done** (`CHEVRON_RESTRICT_PACKAGE_REQUIRES=1`) |
| **N4.1 guest WebContents nav + permissions** | **Done** |
| **Tier-1 package forks** | **Pinned** to `builtbygio/{settings-view,tree-view,fuzzy-finder,github}` |
| **settings-view pack.version / cpm view** | **Done** (fork `b47814b` + cpm `--compatible`) |
| **N5.1 secondary package window hardening** | **Done** (workers: Node kept, prefs/nav/perms locked) |
| Phase S editor sandbox | **Later** (blocked on natives — `src/preload-natives.js`) |

---

## What needs to be done next

### Security Phase N → S

Authoritative plan: **`docs/security-phase-n.md`**. N5: **`docs/security-phase-n5.md`**.

Suggested order after N5.1:

1. ~~N0–N5.1~~ **done** (guests sandboxed; package workers hardened; editor stays hackable)  
2. **Fold bootstrap patches** into `builtbygio/*` forks over time (tree-view fs shim, github residual, …)  
3. **Phase S prep** — move natives / package host redesign before editor `sandbox: true`  
4. Optional: default-on require restrict; Task crawl → utility process; shrink `remote-compat`  

**Dev policy env:**  
- `CHEVRON_AUDIT_PACKAGE_REQUIRES=1` — log  
- `CHEVRON_RESTRICT_PACKAGE_REQUIRES=1` — block community privileged requires

### Optional hygiene

- Linux arm64 smoke can flake (renderer crash under Xvfb before packages activate); job has `continue-on-error: true`  
- Custom V8 startup snapshot still disabled on Electron 43 (stock snapshots + warning)  
- Keep `GROK.md` / CHANGELOG current when landing epics  

### Later (not next)

- Full Avalonia spike  
- In-app AI  
- Aggressive rename of `atom` JS API  

### Explicitly out of scope unless asked

- Pulsar rebase  
- Dropping dual-support / `apm` shim  

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
2. `docs/security-phase-n.md` (+ n2 / n3)  
3. `docs/cpm-cutover.md`  
4. `src/main-process/register-renderer-ipc.js` (trust boundary)  
5. `script/lib/patch-packages-remote-ipc.js` (bundled package patches)  

---

## Known landmines

| Landmine | Mitigation |
|----------|------------|
| Host Node outside 20–24 | `.nvmrc` → **24** |
| Python without distutils | **3.12** + setuptools (CI pin) |
| Dead atom.io Electron headers | `ATOM_ELECTRON_URL=https://www.electronjs.org/headers` |
| Snapshot without less prebuild | Full `script/build` only |
| Non-context-aware natives | `patch-natives-context-aware.js` + rebuild in bootstrap-modern |
| Probing `atom` from CDP | Eval in **Electron Isolated Context**, not page world |
| Nested superstring without `.node` | Re-sync nested natives after rebuild (bootstrap-modern) |
| GitHub workers | Still Node + `contextIsolation: false` (trusted hidden windows) |
| Packaged github `renderer.html` | Unpack `github/lib/**` in `package-application.js` |
| Custom mksnapshot on E43 | Soft-fail; stock V8 snapshots |

---

## Success criteria (rolling)

- [x] Current Electron stable  
- [x] No `@electron/remote` in production  
- [x] `contextIsolation` + preload boot  
- [x] No metrics / atom.io auto-update by default  
- [x] Multi-platform CI (macOS, Linux, Windows)  
- [x] cpm Phases 0–4 + Pulsar settings  
- [ ] Phase N: privileged package paths on IPC / Atom services (in progress)  
- [ ] Package migration notes for community authors (Node not guaranteed long-term)  

---

*Handoff file — update when an epic lands so the next session does not re-derive history.*
