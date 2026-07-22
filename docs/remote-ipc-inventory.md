# Remote / IPC inventory (Electron security ladder)

**Date:** 2026-07-13  
**Baseline (current):** Electron **43.1.0**, `contextIsolation: true`, page `nodeIntegration: false`, preload boots Atom (`static/preload.js`), **no** `@electron/remote` — `src/remote-compat.js` over IPC.  
**Historical goal (met for remote):** Replace `electron.remote` with **main-process IPC + preload**, enable isolation, remove `@electron/remote`.

This doc began as an inventory/kill-list. Sections 1–8 describe the pre-migration surface; **§9 is the source of truth for current status**.

---

## Executive summary

| Layer | Remote dependency | Notes |
|-------|-------------------|--------|
| **Core boot path** | **Critical** | Window cannot start without `remote.getCurrentWindow()` (load settings, markers, show) |
| **ApplicationDelegate** | **High** | Mix of remote (reads/dialogs) and existing IPC (most window mutators) |
| **Bundled packages** | **Medium** | `github`, `settings-view`, `tabs`, `tree-view` use remote for menus / app paths |
| **Specs / test runners** | **Low** (dev-only) | Can stay on remote longer |
| **Community packages** | **Unknown / large** | Assume many use `electron.remote` or renderer Node |

**Good news:** A large fraction of window control is **already IPC** via `ipcHelpers` + `atom-application` handlers. The remaining remote surface is **concentrated** and mappable.

**Hard part:** `ApplicationDelegate.getCurrentWindow()` returns a live `BrowserWindow` proxy used for sync reads, dialogs, and save dialogs — not a single method, but a **capability**. Isolation needs either richer IPC or a thin facade.

---

## Current architecture (simplified) — post P0–P4 + isolation

```text
┌─ Main ─────────────────────────────────────────────────────────┐
│  register-renderer-ipc.js: load-settings, dialogs, Menu.popup,  │
│    BrowserWindow workers, clipboard, screen, shell, …           │
│  atom-application.js: existing ipcHelpers + window channels     │
│  atom-window.js: preload=static/preload.js, isolation true      │
└────────────────────────────┬────────────────────────────────────┘
                             │ IPC (remote-compat + legacy channels)
┌─ Preload (Node) ───────────┴────────────────────────────────────┐
│  static/preload.js → static/index.js                            │
│  electron.remote = src/remote-compat.js → renderer-ipc.js       │
│  ApplicationDelegate / get-window-load-settings via IPC         │
│  create-custom-element for pane/workspace/styles under isolation│
└─────────────────────────────────────────────────────────────────┘
┌─ Page (no Node) ────────────────────────────────────────────────┐
│  static/index.html (empty shell; custom elements upgraded from  │
│  preload-side factories)                                        │
└─────────────────────────────────────────────────────────────────┘
```

*Pre-migration diagram (historical): main `@electron/remote` enable + renderer polyfill + `contextIsolation: false`.*

---

## Difficulty key

| Tag | Meaning |
|-----|---------|
| **E** (easy) | Already has IPC peer, or 1:1 replace with `invoke` / existing channel |
| **M** (medium) | Needs new IPC method(s); pure data in/out; no live object |
| **H** (hard) | Sync API, live `BrowserWindow` proxy, or package-private patterns |
| **P** (package) | Change lives in bundled package (git dep or `file:`) |
| **D** (dev-only) | Specs / test / benchmark windows only |

---

## 1. Core: remote call sites

### 1.1 Boot / process entry

| Location | API | Why | Difficulty | Replacement sketch |
|----------|-----|-----|------------|-------------------|
| `static/index.js` | `remote.getCurrentWindow().startupMarkers` | Import main-process startup markers | **M** | Pass markers via `webPreferences.additionalArguments` or IPC once, or inject on `loadSettingsJSON` |
| `static/index.js` | `remote.getCurrentWindow()` (error UI / DevTools) | Show window + open DevTools on setup failure | **E** | Existing `window-method` / `show-window` + `openDevTools` IPC |
| `static/index.js` | `remote.getCurrentWindow().webContents` (profileStartup) | DevTools profile path | **D/M** | IPC or skip under isolation |
| `src/get-window-load-settings.js` | `remote.getCurrentWindow().loadSettingsJSON` | **Every** window needs load settings | **H** | **Must** move off remote: inject JSON via preload/query/custom protocol, or `ipcRenderer.sendSync('get-load-settings')` registered before first paint |
| `src/main-process/start.js` | `@electron/remote/main`.initialize | Remote bridge setup | — | Remove when polyfill gone |
| `src/main-process/atom-window.js` | `@electron/remote/main`.enable | Per-window remote | — | Remove when polyfill gone |
| `exports/remote.js` | re-export `electron.remote` | Package compat shim | **H/P** | Deprecate; document replacement for authors |

### 1.2 `ApplicationDelegate` (primary facade)

Already **IPC** (no remote):

- `open`, `pickFolder`, `closeWindow`, size/position **setters**, center/focus/show/hide  
- maximize/unmaximize/fullscreen **setters**, DevTools toggles, reload, document edited, represented filename  
- temporary window state, user settings write, recent documents, path wait sessions  
- update manager state (sendSync), proxy, history manager events  

Still **remote**:

| Method | API | Difficulty | Notes |
|--------|-----|------------|-------|
| `getCurrentWindow()` | `remote.getCurrentWindow()` | **H** | Callers may hold proxy; audit consumers |
| `getWindowSize()` | `getSize()` | **E** | `invoke('get-window-size')` |
| `getWindowPosition()` | `getPosition()` | **E** | same pattern as setters |
| `isWindowMaximized()` | `isMaximized()` | **E** | |
| `isWindowFullScreen()` | `isFullScreen()` | **E** | |
| `setWindowMenuBarVisibility` | `setMenuBarVisibility` | **E** | extend `window-method` |
| `getPrimaryDisplayWorkAreaSize` | `remote.screen…` | **E** | main `screen` + invoke |
| `getUserDefault` | `remote.systemPreferences` | **E** | macOS only; invoke |
| `confirm` (async) | `remote.dialog.showMessageBox` | **M** | main dialog + window id |
| `confirm` (sync) | `showMessageBoxSync` | **H** | Sync dialog from renderer; prefer async-only migration or `sendSync` |
| `showSaveDialog` | via `getCurrentWindow().showSaveDialog` | **H** | Custom method on AtomWindow; move to main-only dialog IPC |

Uses **shell** (not remote, but still privileged):

| Method | API | Isolation impact |
|--------|-----|------------------|
| `playBeepSound` | `shell.beep()` | May need main or remain in preload |
| `openExternal` | `shell.openExternal` | **Must** leave renderer when sandboxed; IPC to main |

### 1.3 Other core modules

| Location | API | Difficulty | Notes |
|----------|-----|------------|-------|
| `src/context-menu-manager.coffee` | `remote.getCurrentWindow().emit('context-menu', …)` | **M** | Already have main `context-menu` path; emit via IPC |
| `src/reopen-project-menu-manager.js` | `remote.app` (get/set recent?) | **E** | IPC for app paths / recent projects |
| `src/clipboard.js` | `require('electron').clipboard` | **M** | Not remote, but **renderer clipboard** is deprecated/removed in later Electron; plan IPC or `navigator.clipboard` |
| `src/text-editor-component.js` | `ipcRenderer.send` for selection clipboard | **E** | Already IPC for one path |
| `src/electron-shims.js` | wraps `remote.require` | **D** | Legacy deprecations; delete with remote |
| `src/initialize-test-window.js` | remote process I/O, show, exit | **D** | Test harness |
| `src/initialize-benchmark-window.js` | same | **D** | Benchmarks |
| `src/protocol-handler-installer.js` | `ipcRenderer.invoke` | **E** | Already modern IPC |

### 1.4 Specs

| Location | Difficulty |
|----------|------------|
| `spec/atom-paths-spec.js`, `spec/auto-update-manager-spec.js`, `spec/integration/helpers/start-atom.js` | **D** |

---

## 2. Existing IPC surface (main process)

Registered mainly in `src/main-process/atom-application.js` (`handleEvents` / IPC setup):

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `open` | → main | Open paths/options |
| `pick-folder` | → main | Folder picker |
| `open-chosen-*` | → main | Dialog helpers |
| `window-method` | → main | Dynamic method on AtomWindow |
| `set-window-size` / `set-window-position` | → main | Geometry |
| `center-window`, `focus-window`, `show-window`, `hide-window` | → main | Visibility |
| `get-temporary-window-state` / `set-temporary-window-state` | ↔ | Window state blob |
| `set-user-settings` | → main | Persist config |
| `will-save-path` / `did-save-path` | → main | File recovery |
| `write-text-to-selection-clipboard` | → main | Selection clipboard |
| `write-to-stdout` / `write-to-stderr` | → main | Test output |
| `add-recent-document` | → main | OS recent docs |
| `execute-javascript-in-dev-tools` | → main | DevTools |
| `get-auto-update-manager-state` / `-error` | sync ← | Updater |
| `command` / `window-command` | → main | Menu / window commands |
| `run-package-specs` / `run-benchmarks` | → main | Dev |
| `resolve-proxy` | ↔ | Network proxy |
| `did-change-history-manager` | both | History |
| `restart-application` | → main | Relaunch |
| `isDefaultProtocolClient` / `setAsDefaultProtocolClient` | handle | Protocol (modern) |
| `prepare-to-unload` / `did-prepare-to-unload` | both | Close confirm |

**Gap list** (needed for remote kill, not present as dedicated IPC yet):

- get window size / position / maximized / fullscreen (reads)  
- get load settings / startup markers (boot)  
- message box (async + optional sync)  
- save dialog  
- screen work area  
- systemPreferences user defaults  
- menu bar visibility  
- app paths (`userData`, etc.) for packages that use `remote.app.getPath`  
- optional: BrowserWindow id for menu.popup  

`ipcHelpers.call` already implements request/response over a generated channel — good base for new methods.

---

## 3. Bundled packages using remote

| Package | Usage | Difficulty | Migration notes |
|---------|--------|------------|-----------------|
| **github** | `remote.getCurrentWindow()` for `Menu.popup`; `remote.app.getPath`; window visibility; worker webContents | **H/P** | Largest bundled consumer; fork or patch when vendoring; menu.popup needs window from main or webContents id |
| **settings-view** | `remote.app` cache path; protocol client via remote | **M/P** | Protocol already has core IPC (`protocol-handler-installer`); cache path → `app.getPath` IPC |
| **tabs** | `remote.BrowserWindow` | **M/P** | Window list / focus; IPC |
| **tree-view** | `remote.BrowserWindow` + ipc for DND across windows | **M/P** | Partial IPC already (`tree-view:project-folder-dropped`) |
| **atom-pathspec** | `electron.remote.app` | **E/P** | Path helper only |
| **devtron** | heavy remote | **D** | Dev tooling; optional disable under isolation |
| **atom-mocha-test-runner** | remote | **D** | Specs |

In-repo `packages/*` (about, link, …) mostly use **`shell`**, not remote — still needs attention when `nodeIntegration` goes false (shell via preload or IPC).

---

## 4. Renderer Node / non-remote Electron APIs

Isolation and sandbox also break **direct** renderer access to:

| Pattern | Examples | Strategy |
|---------|----------|----------|
| `require('electron').clipboard` | `src/clipboard.js` | IPC or Clipboard API |
| `require('electron').shell` | about, link, ApplicationDelegate | Main-only IPC |
| `require('fs')` / `fs-plus` | Entire editor model | **Long-term hard:** Atom assumes Node in renderer; packages too. Options: keep Node only in preload worker, or dual-mode (core IPC + package host with Node for “trusted” packages) |
| `require('path')`, `child_process` | Widespread | Same as fs |
| Native addons in renderer | superstring, pathwatcher, tree-sitter, … | Stay in renderer process only if Node integration remains for trusted code, or move to utility process (huge) |

**Implication:** Killing **remote** is step 1. Killing **renderer Node** is step 2 and much larger. Inventory for remote can complete without solving fs-in-renderer.

Suggested phased security:

1. **Phase R** — eliminate `remote` / `@electron/remote` (this doc).  
2. **Phase I** — `contextIsolation: true` + preload bridge; Node may still exist in isolated world carefully (Electron nuances).  
3. **Phase N** — `nodeIntegration: false` for editor windows; package compatibility policy.  
4. **Phase S** — sandbox where possible.

---

## 5. Kill-list (priority order)

### P0 — Boot blockers (window never loads without these)

1. **Load settings** without remote (`get-window-load-settings.js` + main inject).  
2. **Startup markers** (optional for boot; can fold into load settings).  
3. **Show / DevTools on error** via existing IPC.

### P1 — ApplicationDelegate remote reads & dialogs

4. Window geometry / state **getters** (size, position, maximized, fullscreen).  
5. `confirm` → async dialog IPC; deprecate sync confirm or `sendSync`.  
6. Save dialog IPC.  
7. `screen` work area + `systemPreferences.getUserDefault`.  
8. Menu bar visibility.  
9. Stop returning live `BrowserWindow` from `getCurrentWindow()`; replace callers.

### P2 — Core remaining

10. Context menu emit via IPC.  
11. `reopen-project-menu-manager` app access.  
12. Clipboard module off renderer Electron API.

### P3 — Bundled packages

13. **settings-view** protocol + cache path.  
14. **tabs** / **tree-view** BrowserWindow.  
15. **github** menus + paths + workers (largest).  

### P4 — Cleanup

16. Remove `@electron/remote` dep, polyfill, main initialize/enable.  
17. Remove/repurpose `exports/remote.js` with deprecation period.  
18. Specs / benchmarks / devtron.

---

## 6. Proposed target IPC / preload shape (sketch)

Not implemented — design intent only:

```text
preload (isolated):
  contextBridge.exposeInMainWorld('atomNova', {
    getLoadSettings: () => ipcRenderer.sendSync('get-load-settings'),
    window: { getBounds, setBounds, show, … },  // thin, serializable
    dialog: { showMessageBox, showSaveDialog },
    app: { getPath, getVersion, … },
    shell: { openExternal, beep },
    clipboard: { readText, writeText },
  })

main:
  ipcMain.on / handle matching the above
  never expose raw BrowserWindow or ipcMain to page
```

Core `ApplicationDelegate` becomes a thin client of `atomNova` / IPC instead of `remote`.

Packages: document `atomNova` (or keep `atom` APIs that already abstract Electron) and treat raw `electron.remote` as unsupported.

---

## 7. Effort estimate (rough)

| Slice | Effort | Unblocks |
|-------|--------|----------|
| P0 boot inject + load settings IPC | 1–3 days | Isolation experiments on empty window |
| P1 ApplicationDelegate | 3–7 days | Core editor without remote |
| P2 core leftovers | 1–2 days | Core complete |
| P3 settings/tabs/tree-view | 2–4 days | Common packages |
| P3 github | 3–7 days | Full bundled UX |
| P4 remove remote package | 1 day | Dependency cleanup |
| Phase N (no renderer Node) | weeks–months | Real Electron security model |

**Electron 18 bump** can proceed **in parallel** with P0–P1 design; does not require finishing P3.

---

## 8. Risks & open questions

1. **Sync APIs** — Atom and packages use sync dialogs and `getCurrentWindow()` properties. Prefer async + UX changes; use `sendSync` only as temporary bridge.  
2. **Live proxies** — `@electron/remote` returns objects with methods; IPC returns data. Any code doing `getCurrentWindow().on(...)` must be found and rewritten.  
3. **github package** — heavy remote + workers; may need a maintained fork.  
4. **Community packages** — cannot inventory fully; need compatibility layer + docs + gradual breakage.  
5. **Snapshot** — preload/load-settings must work with startup snapshot (no requiring `@electron/remote` inside snapshot graph).  
6. **shell / clipboard** — not remote but same security boundary; include in Phase R/I.

---

## 9. Implementation status (2026-07-13)

| Phase | Status | Notes |
|-------|--------|--------|
| **P0** Boot load-settings / markers / error UI | **Done** | `renderer-ipc` + `register-renderer-ipc` |
| **P1** ApplicationDelegate | **Done** | Window proxy + dialog/screen/shell IPC |
| **P2** Context menu, jump list, clipboard | **Done** | Core paths on IPC |
| **P3** Bundled packages | **Done** | settings-view, atom-pathspec patches; github via full `remote-compat` (Menu, BrowserWindow workers) + `patch-github-remote.js` |
| **P4** Remove `@electron/remote` | **Done** | Dependency removed; `electron.remote` = `src/remote-compat.js` only |

### Architecture after P4

- Core + packages: `src/remote-compat.js` (Menu, BrowserWindow, dialog, app, webContents) over `src/renderer-ipc.js`
- Main: `register-renderer-ipc.js` (worker windows, popup menus, dialogs, clipboard, …)
- Bootstrap: `patch-packages-remote-ipc.js` + `patch-github-remote.js`

### Preload + contextIsolation (done 2026-07-13)

| Setting | Value |
|---------|--------|
| `contextIsolation` | `true` |
| `nodeIntegration` (page) | `false` |
| `sandbox` | `false` (preload needs natives) |
| Boot | `static/preload.js` → `static/index.js` in preload world |
| Page | `index.html` has no Node scripts |
| Custom elements | `src/create-custom-element.js` (`new Class()` under isolation) |
| GitHub workers | Still Node + `sandbox: false` (hackable dugite); N5.1 hardens prefs/nav/perms + `chevron-package-worker` partition |

### Recommended next actions

1. ~~**Electron ladder to current stable**~~ **done** (43.1.0 as of 2026-07-14).  
2. ~~**IPC trust boundary hardening**~~ **done** (scheme filter, drop webContents `executeJavaScript` IPC, lock worker prefs).  
3. ~~**Packaged github worker assets**~~ **done** — asar unpack includes `github/lib/**` for `file://` workers.  
4. **Phase N** (active): narrow package Node surface — see **`docs/security-phase-n.md`**.  
   - N2–**N5.1** done (guests sandboxed; package secondary windows hardened).  
   - Tier-1 packages pinned to `builtbygio` forks.  
   - Next: fold bootstrap patches into forks; Phase S prep (natives).  
5. Phase S later: core editor sandbox still blocked on in-process natives.

---

## 10. File index (remote)

**Core:**  
`static/index.js`, `src/get-window-load-settings.js`, `src/application-delegate.js`, `src/context-menu-manager.coffee`, `src/reopen-project-menu-manager.js`, `src/electron-shims.js`, `src/initialize-test-window.js`, `src/initialize-benchmark-window.js`, `exports/remote.js`, `src/main-process/start.js`, `src/main-process/atom-window.js`

**Bundled:**  
`github` (multiple), `settings-view`, `tabs`, `tree-view`, `atom-pathspec`, `devtron`, `atom-mocha-test-runner`

**Specs:**  
`spec/atom-paths-spec.js`, `spec/auto-update-manager-spec.js`, `spec/integration/helpers/start-atom.js`

---

*Sections 1–8 are historical inventory. §9 reflects implemented architecture as of 2026-07-13.*
