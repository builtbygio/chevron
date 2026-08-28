# Plan: Electron best-practices hardening

**Status:** **complete** for terminal goals (shipped in **0.6.0**, 2026-08-01)  
**Depends on:** Phase R + I (done), Phase N0–N5.1 (done)  
**Related:** `docs/process/security-phase-n.md`, `docs/process/security-phase-n5.md`, `docs/reference/package-node-policy.md`, `docs/reference/remote-ipc-inventory.md`, `docs/reference/security-threat-model.md`  
**Handoff:** `GROK.md`  
**Baseline:** Electron [Security Tutorial](https://www.electronjs.org/docs/latest/tutorial/security) + Electron 43 process model

## Goal

Close concrete gaps between Chevron’s current Electron surface and Electron best practices **without** abandoning the hackable-editor motto until Phase S is ready.

Terminal state for **this plan** (not full Phase S) — **all met**:

1. ~~Custom protocols cannot escape package/asset roots.~~ **done** (P0.1)
2. ~~Window / webContents IPC is method- and ownership-allowlisted.~~ **done** (P0.2–P0.3)
3. ~~CSP and Chromium flags are tightened where compatible.~~ **done** (P1.1, P1.3)
4. ~~Community package privilege is opt-out (or install-time explicit), not silent full Node.~~ **done** (P1.2)
5. Longer tracks (utilityProcess, editor sandbox) were sequenced under **Phase S** (not this plan). Both closed: S3 utilityProcess shipped; Option C keeps editor `sandbox: false`.

## Product posture (do not regress)

| Surface | Policy (current) | This plan |
|---------|------------------|-----------|
| Editor page world | No Node, `contextIsolation: true` | Keep |
| Editor preload + packages | Node allowed, `sandbox: false` | Keep until Phase S; shrink trust for **community** |
| Guest `<webview>` | Sandboxed, no Node (N3/N4) | Keep; tighter file roots (P2.4) |
| Package secondary windows | Node kept for dugite (N5.1) | Keep Node; tighten IPC ownership (P0.2–P0.3) |
| Shell / openExternal | Scheme allowlist | Keep |

Hackable core is intentional. Findings that only apply to “bank-app Electron” are deferred to Phase S, not treated as accidental bugs.

## Current architecture (privilege map)

```text
Main process — full Node, protocols, shell, BrowserWindow factory
    │
    ▼ IPC (many sendSync + handle)
Editor BrowserWindow
  page: no Node, contextIsolation
  preload: full Node + packages     ← hackable host (sandbox: false)
    │                    │
    │ will-attach-webview│ atom-create-browser-window-sync
    ▼                    ▼
Guest webview          Package worker BW
sandbox true, no Node  nodeIntegration true
partition chevron-guest partition chevron-package-worker
```

Key files:

| Area | Path |
|------|------|
| Editor prefs / guests | `src/main-process/atom-window.js` |
| IPC surface | `src/main-process/register-renderer-ipc.js` |
| FS IPC | `src/main-process/register-fs-ipc.js` |
| Protocols | `src/main-process/atom-protocol-handler.js`, `atom-protocol-path.js` |
| Preload boot | `static/preload.js` |
| remote bridge | `src/remote-compat.js` |
| Require policy | `src/package-require-audit.js`, `docs/reference/package-node-policy.md` |
| Natives blocking sandbox | `src/preload-natives.js` |
| Production fuses | `script/lib/flip-electron-fuses.js` |

## Already aligned (do not undo)

- Page: `nodeIntegration: false` + `contextIsolation: true`; empty `static/index.html` shell  
- No `@electron/remote`; `remote-compat` + main IPC  
- No `executeJavaScript` over webContents IPC  
- `shell.openExternal` schemes: `http:`, `https:`, `mailto:`  
- Shell path helpers: absolute paths, null-byte reject; settings-view cache basename-confined  
- Editor `will-navigate` lock; `setWindowOpenHandler` → deny (editor, guests, workers)  
- Guest: strip preload/Node, force sandbox, permission deny, `chevron-guest` partition  
- Workers: fixed `webPreferences`, `file:`-only nav, destroy with manager  
- Editor session permission denylist (media, geo, serial, usb, …)  
- Auto-update off unless `ATOM_UPDATE_URL_PREFIX`  
- Electron **43.1.0**
- **P0–P3 shippable scope** (see status board)

## Audit summary (post-0.6.0)

| Area | Grade | Notes |
|------|-------|--------|
| Editor page isolation | Good | Isolation + empty page |
| Guest webviews | Good | N3/N4 + P2.4 file roots |
| Package workers | Good | Phase S3 utilityProcess (BW emergency-only) |
| IPC trust boundary | Good | Protocol, bw-id, wc-send, FS roots allowlisted |
| Editor sandbox / package Node | Weak (intentional) | Phase S |
| CSP | Fair | Tightened; `unsafe-eval` / `unsafe-inline` still required |
| Protocols | Good | Path confinement |
| Currency | Good | E43.1.0 |
| Fuses | Fair | Cookie encryption on; ASAR integrity macOS-only; RunAsNode kept for cpm |

---

## Workstreams (historical detail)

### P0 — Concrete security bugs — **done**

#### P0.1 — Confine `atom://` / `chevron://` resolution

**Finding:** H1 · **Files:** `atom-protocol-handler.js`, `atom-protocol-path.js`  
Path resolve + prefix check; reject `..`; only regular files. Specs cover traversal.

#### P0.2 — Allowlist `atom-bw-id-call-sync`

**Finding:** H3 · **File:** `register-renderer-ipc.js`  
Resolve only from package-worker map; method allowlist; reject unknown methods.

#### P0.3 — Scope `atom-wc-send`

**Finding:** H4 · **File:** `register-renderer-ipc.js`  
Send only to manager-owned workers / self; cross-window injection denied.

#### P0.4 — Verify after P0

Smoke green multi-platform CI; github dogfood; protocol + IPC specs.

---

### P1 — Trust defaults and surface hygiene — **done**

#### P1.1 — Tighten CSP (`static/index.html`)

`'self' atom: chevron: data: blob:`; `script-src` keeps `'unsafe-eval'` for compile-cache; `style-src` keeps `'unsafe-inline'`.

#### P1.2 — Community require restrict default-on

`core.restrictCommunityPackageRequires` default **true**; env/config escape hatch. Core + bundled unrestricted. See `docs/reference/package-node-policy.md`.

#### P1.3 — Experimental Chromium flag

`enable-experimental-web-platform-features` **off** by default; opt-in via config/env.

#### P1.4 — Threat model

`docs/reference/security-threat-model.md`.

---

### P2 — Defense in depth — **done** (P2.2 closed as follow-on)

#### P2.1 — FS IPC root allowlist

`core.fsIpcStrict` default **on**; roots: project, home, resourcePath, temp.

#### P2.2 — Shrink `sendSync` — **closed for this plan**

Boot and `remote-compat` still require synchronous IPC. Full `sendSync`→`invoke` is a multi-release migration tracked under Phase S prep, not a remaining P0 bug.

**Deliverable for this plan:** inventory of remaining sync channels lives in [`docs/reference/remote-ipc-inventory.md` §11](../reference/remote-ipc-inventory.md). Do not block releases on wholesale conversion.

#### P2.3 — `nodeIntegrationInWorker: false`

Landed after audit; no package Worker+require dependency.

#### P2.4 — Guest `file:` confinement

Guests limited to project roots / package preview temps.

---

### P3 — Release hardening + Phase S sequencing

#### P3.1 — GitHub workers → `utilityProcess` — **done** (Phase S3)

Large github package rewrite. Track as **Phase S / utilityProcess**, not unfinished BP work.

#### P3.2 — Electron fuses — **done**

`script/lib/flip-electron-fuses.js` on package. ASAR integrity enabled on macOS only (Windows lacks embedded integrity resources with `@electron/packager`). `OnlyLoadAppFromAsar` off (unpacked natives + cpm). `RunAsNode` kept for tooling.

#### P3.3 — Phase S: editor `sandbox: true` — **out of scope (blocked)**

Blocked on natives in `src/preload-natives.js`. Authoritative notes: `docs/process/security-phase-n.md` / `security-phase-n5.md`.

#### P3.4 — Misc — **done for shippable items**

- `certificate-error` → deny + log  
- Auto-updater HTTPS + signing: when a public feed ships (not this plan)  
- `WebContentsView` migration: optional later  
- Node deprecation hygiene: ongoing, not a security gate  

---

## Electron security checklist (post-0.6.0)

| Rule | Status | Plan item |
|------|--------|-----------|
| Only load secure content | Good enough | P1.1, P2.4 |
| No Node for remote content | Page OK; preload Node by design | P1.2, Phase S |
| `contextIsolation` | Yes editor; no workers | Phase S / utilityProcess |
| Sandbox | Guests yes; editor/workers no | Phase S |
| Session permission handlers | Yes | keep |
| `webSecurity` on | Yes | keep |
| CSP | Fair (not wide-open) | P1.1 |
| No insecure content | Yes | keep |
| Avoid experimental features | Default off | P1.3 |
| Filter `openExternal` | Yes | keep |
| Validate IPC | Good | P0.2, P0.3, P2.1 |
| Limit navigation | Good | P0.1, P2.4 |
| Limit `window.open` | Yes | keep |
| Current Electron | 43.1.0 | keep current |
| Fuses / ASAR integrity | Partial (mac integrity; Windows/Linux cookie+NODE_OPTIONS) | P3.2 |

---

## Suggested PR sequencing (historical)

Shipped as a single track in PR #48 (+ Windows fuse fix), then released as **0.6.0**.

| PR | Scope | Outcome |
|----|-------|---------|
| **PR-A–C** | P0 protocol + bw-id + wc-send | done |
| **PR-D–E** | P1 CSP / flag / community policy | done |
| **PR-F** | P2 FS IPC + guest file + worker Node flag | done |
| Later | P2.2 invoke migration; P3.3 sandbox declined (Option C) | P3.1 shipped |

## Verification

```bash
node --check src/main-process/atom-protocol-handler.js
node --check src/main-process/register-renderer-ipc.js
node --check src/main-process/register-fs-ipc.js
# relevant specs
./script/with-modern-env ./script/build --no-bootstrap
node script/ci/smoke-test.js out/Chevron-linux-x64
# if github/worker touched: open a git project, exercise status/branch/diff
```

## Explicit non-goals (this plan)

- Turning off editor Node for **bundled** packages before Phase S  
- Full `sendSync`→`invoke` conversion (boot-critical; see §P2.2)  
- Full Avalonia / non-Electron rewrite  
- Pulsar rebase  
- Enabling auto-update against a public feed without signing plan  

## Status board (final)

| ID | Item | Priority | Status |
|----|------|----------|--------|
| P0.1 | Protocol path confinement | P0 | **done** |
| P0.2 | bw-id method + ownership allowlist | P0 | **done** |
| P0.3 | wc-send ownership / channels | P0 | **done** |
| P0.4 | Smoke + github dogfood | P0 | **done** (CI green) |
| P1.1 | CSP tighten | P1 | **done** |
| P1.2 | Community require default/policy | P1 | **done** (default on + config/env escape) |
| P1.3 | Experimental flag | P1 | **done** (default off) |
| P1.4 | Threat model doc | P1 | **done** |
| P2.1 | FS IPC roots | P2 | **done** (strict default on) |
| P2.2 | sendSync → invoke | P2 | **closed** — inventory only; follow-on Phase S prep |
| P2.3 | nodeIntegrationInWorker | P2 | **done** (false) |
| P2.4 | Guest file: roots | P2 | **done** |
| P3.1 | utilityProcess workers | P3 | **done** (Phase S3; BW emergency-only) |
| P3.2 | Fuses / ASAR integrity | P3 | **done** (platform-aware) |
| P3.3 | Phase S sandbox | P3 | **follow-on** (blocked on natives) |
| P3.4 | Cert deny | P3 | **done** |

**Plan exit:** terminal goals 1–4 met; checklist above current; Phase S items tracked elsewhere.

## Resume (next epic — not this plan)

1. **Phase S prep** — migrate/replace in-process natives (`src/preload-natives.js`); redesign package host so community code cannot load arbitrary `.node` in editor preload.  
2. Optional: shrink `remote-compat`; migrate non-boot `sendSync` to `invoke` (inventory §11).  
3. GitHub workers → `utilityProcess` — **done** (Phase S3).  
4. Do **not** set editor `sandbox: true` — Option C (see `security-phase-s-decision.md`).
