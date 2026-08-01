# GROK.md — Chevron session handoff

Context for the next Grok (or human) session. Prefer this file + CHANGELOG over archaeology.

**Repo:** `builtbygio/chevron` (local: workspace `chevron`)  
**Product:** **Chevron** — modernized Atom fork  
**Date of this handoff:** 2026-08-01 (0.6.0)

---

## Product vision

| Horizon | Goal |
|---------|------|
| **Near term** | **Phase S prep** — natives / package host redesign toward editor sandbox |
| **Medium term** | Product depth: Git polish, optional AI, packages first-class |
| **Long term** | Possible Avalonia rehost; keep hackable package spirit |

**Do not** rebase onto Pulsar unless the owner revisits that decision.  
**Dual-support forever:** `global.atom`, `atom://`, `engines.atom`, `apm` name (shim → cpm).

---

## Current baseline (0.6.0)

| Item | Value |
|------|--------|
| Version | **0.6.0** |
| Electron | **43.1.0** (ladder complete) |
| Package / productName | `chevron` / **Chevron** |
| Bundle ID | `dev.builtbygio.chevron` |
| Security (page) | `contextIsolation: true`, `nodeIntegration: false` |
| Security (preload) | Node + natives; `sandbox: false` (hackable until Phase S) |
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
| P3.3 Editor `sandbox: true` | **Follow-on** (blocked on natives) |

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
| Phase S editor sandbox | **Later** (blocked on natives — `src/preload-natives.js`) |

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

### Phase S prep (primary next track)

Authoritative plan: **`docs/security-phase-s.md`**.  
Background: **`docs/security-phase-n.md`**, **`docs/security-phase-n5.md`**, closed BP **`docs/electron-best-practices-plan.md`**.  
Inventory: **`src/preload-natives.js`**.

| Stream | Status |
|--------|--------|
| S0 Inventory + plan | **Done** (this handoff) |
| S1.0 Community native addon / `.node` block | **Done** (default with require restrict) |
| S1.2 Package host design note | **Next** |
| S2 Easy native relocation (main-only tags) | Pending |
| S3 github → utilityProcess | Pending (large) |
| S5 Option A spike vs Option C (sandbox may stay false) | Pending |
| S6 Flip editor `sandbox: true` | **Blocked** on S1 dogfood + S5 decision |

Recommended spine: **Option B** package-host isolation first; full Chromium sandbox is optional (Option C may be permanent for editor hot-path natives).

1. ~~N0–N5.1~~ **done**  
2. ~~Electron BP P0–P3 shippable~~ **done** (0.6.0)  
3. ~~S0 + S1.0~~ **done**  
4. **S1.2** package host design note → pick **S2** easy move or **S3** utilityProcess spike  
5. **S5** decide sandbox strategy; only then S6  

**Dev policy env:**  
- `CHEVRON_AUDIT_PACKAGE_REQUIRES=1` — log privileged + native requires  
- `CHEVRON_RESTRICT_PACKAGE_REQUIRES=0` — opt **out** of community privileged/native restrict (default is on)  
- `CHEVRON_FS_IPC_STRICT=0` — opt out of strict FS IPC roots  
- `CHEVRON_EXPERIMENTAL_WEB_FEATURES=1` — re-enable experimental Chromium features  

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
| Non-context-aware natives | `patch-natives-context-aware.js` + rebuild in bootstrap-modern |
| Probing `atom` from CDP | Eval in **Electron Isolated Context**, not page world |
| Nested superstring without `.node` | Re-sync nested natives after rebuild (bootstrap-modern) |
| GitHub workers | Still Node + `contextIsolation: false` (trusted hidden windows) |
| Packaged github `renderer.html` | Unpack `github/lib/**` in `package-application.js` |
| Custom mksnapshot on E43 | Soft-fail; stock V8 snapshots |
| Windows ASAR integrity fuse | Leave off — FATAL without packager-embedded resources |

---

## Success criteria (rolling)

- [x] Current Electron stable  
- [x] No `@electron/remote` in production  
- [x] `contextIsolation` + preload boot  
- [x] No metrics / atom.io auto-update by default  
- [x] Multi-platform CI (macOS, Linux, Windows)  
- [x] cpm Phases 0–4 + Pulsar settings  
- [x] Phase N + Electron BP shippable defaults (protocol/IPC/CSP/require/FS/fuses)  
- [ ] Phase S: editor sandbox after natives migration  
- [ ] Package migration notes for community authors (Node not guaranteed long-term)  

---

*Handoff file — update when an epic lands so the next session does not re-derive history.*
