# Plan: Electron best-practices hardening

**Status:** P0–P3 implementation in progress (2026-07-26); Phase S / utilityProcess still deferred  
**Depends on:** Phase R + I (done), Phase N0–N5.1 (done)  
**Related:** `docs/security-phase-n.md`, `docs/security-phase-n5.md`, `docs/package-node-policy.md`, `docs/remote-ipc-inventory.md`  
**Handoff:** `GROK.md`  
**Baseline:** Electron [Security Tutorial](https://www.electronjs.org/docs/latest/tutorial/security) + Electron 43 process model

## Goal

Close concrete gaps between Chevron’s current Electron surface and Electron best practices **without** abandoning the hackable-editor motto until Phase S is ready.

Terminal state for **this plan** (not full Phase S):

1. Custom protocols cannot escape package/asset roots.
2. Window / webContents IPC is method- and ownership-allowlisted.
3. CSP and Chromium flags are tightened where compatible.
4. Community package privilege is opt-out (or install-time explicit), not silent full Node.
5. Longer tracks (utilityProcess workers, editor sandbox) stay sequenced under Phase S.

## Product posture (do not regress)

| Surface | Policy (current) | This plan |
|---------|------------------|-----------|
| Editor page world | No Node, `contextIsolation: true` | Keep |
| Editor preload + packages | Node allowed, `sandbox: false` | Keep until Phase S; shrink trust for **community** |
| Guest `<webview>` | Sandboxed, no Node (N3/N4) | Keep; optional tighter file roots |
| Package secondary windows | Node kept for dugite (N5.1) | Keep Node; tighten IPC ownership |
| Shell / openExternal | Scheme allowlist | Keep; extend patterns |

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
| Protocols | `src/main-process/atom-protocol-handler.js` |
| Preload boot | `static/preload.js` |
| remote bridge | `src/remote-compat.js` |
| Require policy | `src/package-require-audit.js`, `docs/package-node-policy.md` |
| Natives blocking sandbox | `src/preload-natives.js` |

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

## Audit summary (2026-07-26)

| Area | Grade | Notes |
|------|-------|--------|
| Editor page isolation | Good | Isolation + empty page |
| Guest webviews | Good | N3/N4 |
| Package workers | Fair | N5.1 prefs; full Node remains |
| IPC trust boundary | Fair | Shell/cache good; bw-id / wc-send / protocol weak |
| Editor sandbox / package Node | Weak (intentional) | Phase S |
| CSP | Weak | `default-src *`, `unsafe-eval` |
| Protocols | Weak | Path escape |
| Currency | Good | E43.1.0 |

---

## Workstreams

### P0 — Concrete security bugs (ship first)

#### P0.1 — Confine `atom://` / `chevron://` resolution

**Finding:** H1  
**File:** `src/main-process/atom-protocol-handler.js`  
**Problem:** `path.normalize` + `path.join(loadPath, relativePath)` allows `atom://../../…` to escape package roots.  
**Do:**

1. After resolving a candidate path, require it stays under the chosen root (`path.resolve` + `relative` / prefix check, handle Windows roots).  
2. Reject `..` segments in the URL path before join (defense in depth).  
3. Only serve regular files (already partially true via `stat.isFile()`).  
4. Specs: traversal cases (`atom://../../etc/hosts`, assets escape, symlink-out if practical).

**Done when:** Traversal fixtures return 404 / empty; legitimate package assets still load.

#### P0.2 — Allowlist `atom-bw-id-call-sync`

**Finding:** H3  
**File:** `src/main-process/register-renderer-ipc.js`  
**Problem:** `resolveWindow` falls back to `BrowserWindow.fromId`; any method with `typeof === 'function'` is callable on **any** window.  
**Do:**

1. For privileged ops, resolve only from `createdWindows` (package workers), not global `fromId`.  
2. Explicit method allowlist, e.g. `loadURL` (with existing file: check), `destroy`, `isDestroyed`, and any methods `remote-compat` actually needs.  
3. Reject unknown methods with log + null.  
4. Audit `src/remote-compat.js` for every `atom-bw-id-call-sync` usage; expand allowlist only with justification.

**Done when:** Main editor window cannot be driven via this channel; worker loadURL/destroy still work; github package dogfood OK.

#### P0.3 — Scope `atom-wc-send`

**Finding:** H4  
**File:** `src/main-process/register-renderer-ipc.js`  
**Problem:** Open relay: any renderer can `webContents.fromId(id).send(channel, …args)`.  
**Do:**

1. Allow send only to webContents IDs created for **this** manager (`event.sender`) / registered worker map.  
2. Optional channel allowlist for worker protocol (start permissive log mode, then tighten).  
3. Specs for cross-window injection denial.

**Done when:** Arbitrary webContents ID + channel from a test sender is blocked; github worker messaging still works.

#### P0.4 — Verify after P0

```bash
node --check src/main-process/atom-protocol-handler.js
node --check src/main-process/register-renderer-ipc.js
# unit specs for protocol + IPC allowlists
./script/with-modern-env ./script/build --no-bootstrap
node script/ci/smoke-test.js out/Chevron-linux-x64
# manual: open git project — github status/branch still works
```

**P0 exit:** smoke green; no new package activation fatals; traversal + bw-id + wc-send regressions covered by specs.

---

### P1 — Trust defaults and surface hygiene

#### P1.1 — Tighten CSP

**Finding:** M1  
**File:** `static/index.html`  
**Do:**

1. Replace `default-src *` with `'self' atom: chevron: data: blob:` (iterate if packages break).  
2. Keep `script-src 'self' 'unsafe-eval'` only if compile-cache / eval paths still need it; document why.  
3. Prefer `style-src 'self' 'unsafe-inline'` until less pipeline allows stricter.  
4. Smoke + markdown-preview / settings-view visual check.

#### P1.2 — Community require restrict: default or install-time

**Finding:** H2 (strategic)  
**Files:** `src/package-require-audit.js`, `docs/package-node-policy.md`, settings-view/cpm UX  
**Do (pick one path):**

| Option | Behavior | Risk |
|--------|----------|------|
| **A (recommended first)** | Default `CHEVRON_RESTRICT_PACKAGE_REQUIRES` **on** for new installs; env/config to disable | May break some T2 packages |
| **B** | cpm install warns + writes config opt-in | Softer |
| **C** | Keep opt-in only; improve audit logging in dogfood | Lowest churn |

Ship A or B with escape hatch in `config.cson` / env. Core + bundled (app.asar) remain unrestricted.

#### P1.3 — Drop or gate experimental Chromium flag

**Finding:** M7  
**File:** `src/main-process/start.js`  
**Do:** Remove `enable-experimental-web-platform-features` unless a tracked feature needs it; if needed, gate on `devMode` or config with a comment linking the issue.

#### P1.4 — Document threat model in one page

Short `docs/security-threat-model.md` (or a section here) stating:

- Trusted: main, core, bundled T1  
- Semi-trusted: community packages (policy)  
- Untrusted: guest webview content, remote http(s) in guests  

Link from `GROK.md` and `package-node-policy.md`.

**P1 exit:** CSP not wide-open; experimental flag decision landed; community policy path chosen and documented.

---

### P2 — Defense in depth + reliability

#### P2.1 — FS IPC root allowlist

**Finding:** M2  
**File:** `src/main-process/register-fs-ipc.js`  
**Do:**

1. Allow paths under: open project roots, `ATOM_HOME` / chevron home, `resourcePath`, temp, and explicit config.  
2. Deny (or log + fail closed in strict mode) absolute paths outside those roots.  
3. Config flag `core.fsIpcStrict` default off first, then on after dogfood.  
4. Regression: tree-view, fuzzy-finder path probes, find-and-replace.

#### P2.2 — Shrink `sendSync`

**Finding:** M3  
**Do:** Inventory sync channels; migrate non-boot-critical paths to `ipcMain.handle` / `invoke`. Keep sync only where Atom boot or remote-compat must stay sync. Track list in `docs/remote-ipc-inventory.md`.

#### P2.3 — `nodeIntegrationInWorker: false` after audit

**Finding:** M4  
**File:** `atom-window.js`  
**Do:** Grep packages for Worker + `require`; flip flag; smoke + package tests.

#### P2.4 — Guest `file:` confinement (optional)

**Finding:** M6  
**Do:** For guests, allow `file:` only under project roots / package preview temp dirs when practical.

**P2 exit:** Strict FS mode dogfoodable; fewer sync IPCs; worker Node flag decision landed.

---

### P3 — Phase S and release hardening (later)

#### P3.1 — GitHub workers → `utilityProcess` (or equivalent)

**Finding:** M5  
**Outcome:** No Node `BrowserWindow` for git workers; dugite runs in utility process; IPC for status/branch. Large rewrite of github package.

#### P3.2 — Electron fuses + ASAR integrity on release builds

**Finding:** L1  
**Do:** Wire `@electron/fuses` in package pipeline (disable dangerous runAsNode / nodeCliInspect where compatible; enable ASAR integrity if packaging supports it). Document fuse matrix per channel.

#### P3.3 — Phase S: editor `sandbox: true`

Blocked on natives in `src/preload-natives.js`. Prerequisites:

1. Move or replace in-process natives.  
2. Split package host so community code cannot load arbitrary `.node` in editor preload.  
3. Re-enable sandbox only after (1)–(2).

Authoritative Phase S notes remain in `docs/security-phase-n.md` / `security-phase-n5.md`.

#### P3.4 — Misc low priority

- Explicit `certificate-error` → deny + log  
- Auto-updater: HTTPS feed + platform code signing when a feed ships  
- Prefer `WebContentsView` over `webviewTag` for first-party hosts over time  
- Runtime Node deprecations (`url.parse`, `fs.Stats`, `punycode`) hygiene

---

## Electron security checklist (tracking)

| Rule | Status | Plan item |
|------|--------|-----------|
| Only load secure content | Partial | P1.1, P2.4 |
| No Node for remote content | Page OK; preload Node by design | P1.2, P3.3 |
| `contextIsolation` | Yes editor; no workers | P3.1 |
| Sandbox | Guests yes; editor/workers no | P3.3 |
| Session permission handlers | Yes | keep |
| `webSecurity` on | Yes | keep |
| CSP | Weak | P1.1 |
| No insecure content | Yes | keep |
| Avoid experimental features | Fail today | P1.3 |
| Filter `openExternal` | Yes | keep |
| Validate IPC | Partial | P0.2, P0.3, P2.1 |
| Limit navigation | Mostly | P0.1, P2.4 |
| Limit `window.open` | Yes | keep |
| Current Electron | 43.1.0 | keep current |
| Fuses / ASAR integrity | Missing | P3.2 |

---

## Suggested PR sequencing

| PR | Scope | Depends |
|----|-------|---------|
| **PR-A** | P0.1 protocol confinement + specs | — |
| **PR-B** | P0.2 bw-id allowlist + remote-compat audit | — |
| **PR-C** | P0.3 wc-send ownership (+ optional channel log) | PR-B nice-to-have |
| **PR-D** | P1.1 CSP + P1.3 experimental flag | PR-A (reload paths) |
| **PR-E** | P1.2 community require policy | independent |
| **PR-F** | P2.1 FS IPC strict (flagged) | PR-C optional |
| Later | P2.2–P2.3, P3.* | after P0/P1 stable |

P0 PRs can land in parallel if carefully reviewed; merge order A → B → C is safest for bisect.

## Verification (every PR)

```bash
node --check <touched main-process files>
# relevant specs
./script/with-modern-env ./script/build --no-bootstrap
node script/ci/smoke-test.js out/Chevron-linux-x64
# if github/worker touched: open a git project, exercise status/branch/diff
```

## Explicit non-goals (this plan)

- Turning off editor Node for **bundled** packages before Phase S  
- Full Avalonia / non-Electron rewrite  
- Pulsar rebase  
- Enabling auto-update against a public feed without signing plan  

## Status board

| ID | Item | Priority | Status |
|----|------|----------|--------|
| P0.1 | Protocol path confinement | P0 | **done** |
| P0.2 | bw-id method + ownership allowlist | P0 | **done** |
| P0.3 | wc-send ownership / channels | P0 | **done** |
| P0.4 | Smoke + github dogfood | P0 | **done** locally (72 packages); CI on PR |
| P1.1 | CSP tighten | P1 | **done** |
| P1.2 | Community require default/policy | P1 | **done** (default on + config/env escape) |
| P1.3 | Experimental flag | P1 | **done** (default off) |
| P1.4 | Threat model doc | P1 | **done** (`docs/security-threat-model.md`) |
| P2.1 | FS IPC roots | P2 | **done** (strict default on) |
| P2.2 | sendSync → invoke | P2 | **deferred** (inventory only; boot/remote-compat still sync) |
| P2.3 | nodeIntegrationInWorker | P2 | **done** (false) |
| P2.4 | Guest file: roots | P2 | **done** |
| P3.1 | utilityProcess workers | P3 | **deferred** (github rewrite) |
| P3.2 | Fuses / ASAR integrity | P3 | **done** (`flip-electron-fuses.js`, soft-fail) |
| P3.3 | Phase S sandbox | P3 | **blocked** on natives |
| P3.4 | Cert deny | P3 | **done** (`certificate-error` → false) |

---

## Changelog note (when landing)

Under Unreleased / next release:

- **Security:** Electron best-practices plan — protocol confinement, window/webContents IPC allowlists, CSP/flag hygiene (link this doc).

## Resume

1. Start **PR-A** (protocol) or **PR-B** (bw-id) — both P0, independent.  
2. After P0, pick **P1.1** or **P1.2** for user-visible policy.  
3. Do not start Phase S sandbox until `src/preload-natives.js` has a migration path.
