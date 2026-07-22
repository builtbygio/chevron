# Security Phase N — narrow package Node surface

**Status:** active epic — N0–N4.1 done; **N5.1 done** (secondary window hardening, hackable-compatible); Phase S (editor sandbox) still blocked on natives
**Depends on:** Phase R (remote removal) and Phase I (contextIsolation + preload boot) — both done.  
**Follows:** `docs/remote-ipc-inventory.md` §4 / §9.  
**Handoff:** `GROK.md`

## Goal

Reduce how much **unrestricted Node** package code can use, without breaking the editor. The page world already has `nodeIntegration: false`. Atom and packages still run with Node in the **preload / isolated world**. Phase N shrinks that privilege over time.

Terminal state (aspirational):

- Packages prefer Atom APIs / main-process IPC over raw `fs` / `child_process` / `electron`.
- Hidden worker windows (github) do not need a full Node renderer, or are tightly allowlisted.
- Guest content (webviews) never gets Node.
- `sandbox: true` where preload does not need natives (Phase S starts here).

## Current architecture (privilege map)

| Realm | Node? | Isolation | Role today |
|-------|-------|-----------|------------|
| Main process | Yes | n/a | Windowing, IPC handlers, shell, dialogs |
| Editor preload / isolated world | **Yes** | `contextIsolation: true` | Boots Atom + loads packages |
| Editor page world | **No** | (same partition) | Empty shell / upgraded custom elements |
| GitHub worker `BrowserWindow` | **Yes** | **false** | Hidden git workers via `remote-compat` |
| Packaged natives | on disk under `app.asar.unpacked` | n/a | `.node`, dugite, github lib/bin, … |

Main editor flags (`src/main-process/atom-window.js`):

- `nodeIntegration: false` (page)
- `contextIsolation: true`
- `sandbox: false` (preload loads superstring / pathwatcher / tree-sitter natives)
- `nodeIntegrationInWorker: true`

## Inventory snapshot (2026-07-16)

Rough file-count hits (require/import of the API). Nested `node_modules` and specs skipped. Counts are directional, not a complete call graph.

| Area | child_process | fs | net | http(s) | electron.remote traces | electron | notes |
|------|---------------|----|----|---------|--------------------------|----------|-------|
| core `src/` | 4 | 29 | 1 | 0 | 7 | 26 | Expected; migrate hot paths to IPC over time |
| core `static/` | 0 | 0 | 0 | 0 | 2 | 2 | preload boot |
| **bundled github** | **6** | **4** | **3** | **1** | **10** | **14** | Largest package surface; workers |
| bundled tree-view | 0 | 7 | 0 | 0 | 0 | 2 | FS-heavy UI |
| bundled fuzzy-finder | 1 | 5 | 0 | 0 | 0 | 0 | spawn + fs |
| bundled settings-view | 0 | 2 | 0 | 0 | 0 | 5 | paths / electron |
| bundled markdown-preview | 0 | 3 | 0 | 0 | 0 | 0 | |
| bundled find-and-replace | 0 | 2 | 0 | 0 | 0 | 0 | |
| bundled tabs / status-bar | 0 | 1 | 0 | 0 | 0 | 0–1 | light |
| in-repo `packages/*` | low | low | 0 | 0 | 0 | low | about, dalek, … |

**Hotspots for Phase N work (priority):**

1. **github** — workers, dig dugite, menus, net; already on `remote-compat` + main IPC for BrowserWindow.
2. **tree-view / fuzzy-finder** — filesystem browsing and process spawn.
3. **Core `src/`** — residual `require('electron')` and `fs` outside ApplicationDelegate IPC.
4. **settings-view** — app paths / protocol handlers.

## Package policy (draft)

### Tiers

| Tier | Who | Node policy |
|------|-----|-------------|
| **T0 Core** | Atom preload + `src/` | Node allowed; new privileged ops should prefer main IPC |
| **T1 Bundled** | Ship-in packages (github, tree-view, …) | Prefer Atom services; raw Node allowed only with documented allowlist; no new `electron.remote` |
| **T2 Community** | User-installed packages | **No** guaranteed Node; no `electron.remote`; use published Atom APIs only |

### Rules of thumb

1. **Do not use** `electron.remote` / `@electron/remote` — use Atom APIs or documented IPC (`remote-compat` is a temporary bridge for bundled packages only).
2. **Do not call** `shell.openExternal` from package code with arbitrary URLs — go through Atom so main can enforce scheme allowlists.
3. **Prefer** `atom.project`, `atom.workspace`, `atom.file`, `BufferedProcess` / task APIs over ad-hoc `child_process` + `fs`.
4. **Natives** must rebuild for the current Electron ABI; packaging must unpack `.node` (and any `file://` worker assets).
5. **New packages** should assume Phase N end-state (no Node in package context).

### Compatibility promise

- Bundled packages remain working on each Electron rung.
- Community packages that only use stable `atom.*` APIs keep working.
- Packages that `require('fs')` or `require('electron')` may break as Phase N advances; document in release notes.

## Workstreams (ordered)

### N0 — Hygiene (done / in progress)

- [x] Phase R + I complete
- [x] IPC hardening: openExternal scheme filter, no `executeJavaScript` over webContents IPC, fixed worker `webPreferences` (PR #5)
- [x] Unpack `github/lib/**` for packaged worker `file://` loads (see `package-application.js`)
- [x] CDP / smoke: git repo open with no `renderer.html` ERR_FILE_NOT_FOUND (verified 2026-07-16)

### N1 — Finish github worker reliability

1. Packaged worker assets on disk under `app.asar.unpacked` (unpack glob).
2. Verify dugite git binary still unpacked.
3. Live test: status bar branch, github package tab, no worker crash loops.
4. Later: replace hidden BrowserWindow workers with main/utility-process git (large).

### N2 — IPC remaining privileged package paths

For each hotspot package:

1. List concrete `fs` / `child_process` / `electron` call sites.
2. Add or reuse main IPC / Atom service.
3. Patch package (or maintain patch script under `script/lib/`).
4. Regression test (smoke + package-specific).

Suggested order: **settings-view paths** → **fuzzy-finder spawn** → **tree-view fs** → **github residual electron**.

| Item | Status |
|------|--------|
| settings-view shell.openExternal | Done (N2) |
| settings-view avatar cache FS | **Done N2.1 (0.4.0)** — main IPC `atom-settings-view-cache-*` |
| tree-view shell / trash / DND | Done (N2) |
| fuzzy-finder UI path probes | **Done N2.2** — path kind / realpath |
| tree-view bulk fs-plus | **Done N2.3** — `fs-via-main` + `register-fs-ipc` |
| github residual electron/remote | **Done N2.4** — app path, webContents id, menus; workers already IPC |
| N3.1 inventory + session perms + require audit | **Done** |
| N3.2 opt-in community require restrict | **Done** — `CHEVRON_RESTRICT_PACKAGE_REQUIRES=1` |
| N4.1 guest WebContents nav + permissions | **Done** — see [security-phase-n4.md](./security-phase-n4.md) |
| settings-view pack.version / cpm view contract | **Done** — cpm `--compatible` + apm-shaped JSON; settings-view `b47814b` null-safe |
| N3 default-on allowlist | Later (must not break T2 overnight) |

### N3 — Shrink preload default privilege

1. ~~Document what preload must load (natives list)~~ **done** (`src/preload-natives.js`, n3.md)  
2. ~~contextBridge to page~~ **explicit non-goal for now** (page stays empty; no bridge)  
3. ~~Stop expanding package Node as a feature~~ **policy** ([package-node-policy.md](./package-node-policy.md))  
4. Optional require inventory: `CHEVRON_AUDIT_PACKAGE_REQUIRES=1`  
5. ~~Opt-in community restrict~~ **done N3.2** (`CHEVRON_RESTRICT_PACKAGE_REQUIRES=1`)  
6. Long-term: default-on allowlist / package host (research; may need custom loader)

### N4 — Guest content

1. ~~Audit `webviewTag: true` and package webviews~~ — tag kept; guests forced safe  
2. ~~Ensure guest webPreferences: no Node, no shared preload~~ **done N3**  
3. ~~Navigation / permissions on guest WebContents~~ **done N4.1** (`did-attach-webview`)  
4. Optional later: stricter CSP injection for remote-only guests

### N5 — Toward Phase S (sandbox)

1. ~~Sandbox guest windows first~~ **done N3/N4** (`sandbox: true` on `<webview>`)  
2. ~~Harden package secondary BrowserWindows~~ **done N5.1** — Node kept (hackable); fixed prefs, file: nav, deny open/perms — [security-phase-n5.md](./security-phase-n5.md)  
3. Core editor stays `sandbox: false` until natives move (`src/preload-natives.js` Phase S prerequisites)  
4. Re-evaluate editor sandbox only as **Phase S** (not a one-shot flip)

## Verification checklist

| Check | Command / method |
|-------|------------------|
| Smoke | `node script/ci/smoke-test.js "out/<App>.app"` |
| Worker files on disk | `ls …/app.asar.unpacked/node_modules/github/lib/renderer.html` |
| openExternal filter | CDP: `atom.applicationDelegate.openExternal('file:///…') === false` |
| executeJavaScript IPC | window proxy `webContents.executeJavaScript` → `null` |
| Git path | Open repo; github active; no `ERR_FILE_NOT_FOUND` for renderer.html |
| No fatals | `atom.notifications` error/fatal empty at idle |

## Explicit non-goals (this phase)

- Full rewrite to Avalonia / Pulsar rebase
- Removing the `atom` JS API name
- New package registry
- Enabling `sandbox: true` on the main editor in one shot

## References

- `docs/remote-ipc-inventory.md` — Phase R/I history and IPC map
- `GROK.md` — live handoff and Electron ladder notes
- `src/main-process/register-renderer-ipc.js` — main trust boundary
- `src/remote-compat.js` — temporary package bridge
- `script/lib/package-application.js` — asar unpack globs
- `script/lib/patch-github-remote.js` — worker sendTo → main relay
