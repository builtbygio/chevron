# Security Phase N3 — preload privilege map + guest content

**Status:** N3.1 shipped (inventory, package policy, session permission lockdown, optional require audit)  
**Date:** 2026-07-16 · **Update:** 2026-07-22  
**Depends on:** Phase I (contextIsolation + preload boot), Phase N2 (package shell / fs IPC).

## Goal

Make the **privilege boundaries explicit** and **lock down guest content**, without yet removing Node from the Atom preload (that is a multi-month N3→N5 arc).

## Privilege map (current)

| Realm | Node | Isolation | Sandbox | Role |
|-------|------|-----------|---------|------|
| Main process | Yes | n/a | n/a | Windows, IPC trust boundary |
| Editor **page** world | **No** | yes | n/a (same process) | Empty HTML shell / custom elements |
| Editor **preload** world | **Yes** | yes | **false** (needs natives) | Boots Atom + packages |
| Guest **`<webview>`** | **No** (forced) | **yes** (forced) | **true** (forced) | Untrusted embed; attrs cannot re-enable Node |
| GitHub worker `BrowserWindow` | Yes | **false** | false | Trusted hidden git workers (exception) |

### Why editor `sandbox: false`

Preload loads native addons. Authoritative list: **`src/preload-natives.js`** (`editorNatives`).

Non-exhaustive summary:

- `superstring` (text buffer)
- `pathwatcher` / `@atom/watcher` / `@atom/nsfw`
- `tree-sitter` + language grammars
- `oniguruma` (TextMate modes)
- package natives (`keytar`, `@atom/fuzzy-native`, `spellchecker`, …)

Electron’s sandboxed preload cannot `require()` arbitrary `.node` binaries the way Atom expects. Full sandbox for the editor window is **Phase S / later N**, after natives move or a package host splits.

### Preload “default deny” policy (product)

1. **Do not** add new privileges to the page world.
2. **Do not** expose the Atom preload as a guest webview preload.
3. **Do not** add `contextBridge` exports of Node/`atom` to the page unless there is a concrete product need (none today).
4. **New packages** should assume no Node long-term; use `atom.*` / IPC — see [package-node-policy.md](./package-node-policy.md).
5. **Bundled packages** still run with Node in preload today (T1); reduce over N2–N4.
6. **window.open** from the renderer is **denied**; open windows via main IPC.

## What shipped in code

### N3.0 (earlier) — guest + window.open

#### `AtomWindow` (`src/main-process/atom-window.js`)

1. **`will-attach-webview`** — overwrites guest `webPreferences`:
   - no `preload` / `preloadURL`
   - `nodeIntegration` / workers / subframes **false**
   - `contextIsolation: true`, `sandbox: true`
   - `webSecurity: true`, no insecure content / experimental flags
2. **`setWindowOpenHandler` → deny** — blocks `window.open` / `target=_blank` child BrowserWindows from the renderer.
3. **`will-navigate`** — prevent in-window navigation away from the editor document URL.

### N3.1 (this slice) — inventory + session permissions + audit

| Deliverable | Location |
|-------------|----------|
| Natives / privileged module inventory | `src/preload-natives.js` |
| Optional require audit | `src/package-require-audit.js` (env `CHEVRON_AUDIT_PACKAGE_REQUIRES=1`) |
| Wired from preload | `static/preload.js` |
| Session permission deny-list | `AtomWindow.handleEvents` (`setPermissionRequestHandler` / `setPermissionCheckHandler`) |
| Package author policy | [package-node-policy.md](./package-node-policy.md) |

**Permission policy (editor session):** deny media, geolocation, notifications, midi, pointerLock, fullscreen, openExternal, serial/hid/usb, display-capture, idle-detection, window-management, clipboard-sanitized-write. Allow `clipboard-read` for paste. Unknown permissions default **deny**.

**Require audit:** when enabled, wraps `Module.prototype.require` and logs one warning per package path + privileged module (`fs`, `child_process`, `electron`, …). Does **not** block.

## Package tiers (summary)

| Tier | Node policy |
|------|-------------|
| T0 Core | Node allowed; prefer IPC for new privileged ops |
| T1 Bundled | Prefer Atom/IPC; no new remote |
| T2 Community | No guaranteed Node long-term |

Full write-up: [package-node-policy.md](./package-node-policy.md).

## Audit notes

- No first-party bundled package in the default set was found creating `<webview>` elements; `webviewTag: true` remains for community packages, with guest lockdown above.
- No first-party `window.open` call sites found in core/default packages; deny is low risk.
- `nodeIntegrationInWorker: true` kept for package/Web Worker `require` until audited off (later N3/N4).

## Not in this phase (still later)

- Enforcing a require **allowlist** that breaks community packages
- `sandbox: true` on the main editor window
- Replacing GitHub worker BrowserWindows with utility process
- Moving fuzzy-finder Task crawl to main/utility process

## Verify

```bash
node --check src/main-process/atom-window.js
node --check src/package-require-audit.js
node --check src/preload-natives.js
node -e "require('./src/package-require-audit').installPackageRequireAudit()"
# Smoke after build:
node script/ci/smoke-test.js
# Optional audit run:
CHEVRON_AUDIT_PACKAGE_REQUIRES=1 node script/ci/smoke-test.js
```

Manual / CDP (optional):

- From isolated world, `window.open('https://example.com')` should not create a BrowserWindow (denied).
- If a package inserts `<webview>`, guest should not have `require` / Node.
- Permission prompt for notifications/media should not be grantable from editor session.

## Related

- `docs/security-phase-n2.md` — package shell / fs IPC  
- `docs/remote-ipc-inventory.md` — historical remote kill list  
- `docs/security-phase-n.md` — full Phase N plan  
- `docs/package-node-policy.md` — package author policy  
