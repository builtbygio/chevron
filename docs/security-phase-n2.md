# Security Phase N2 — package shell / remote IPC

**Date:** 2026-07-16  
**Branch theme:** route privileged package Electron shell calls through main-process IPC.

## What shipped

### Main process (`register-renderer-ipc.js`)

| Channel | Behavior |
|---------|----------|
| `atom-shell-open-external` | Existing; scheme allowlist `http:` / `https:` / `mailto:` |
| `atom-shell-show-item-in-folder` | **New**; absolute path only → `shell.showItemInFolder` |
| `atom-shell-move-item-to-trash` | **New**; absolute path only → `shell.trashItem` (async; Electron 43 removed sync `moveItemToTrash`) |

### Renderer facade

- `renderer-ipc.js` + `ApplicationDelegate`: `showItemInFolder`, `moveItemToTrash` (Promise-returning).

### Package patches (`script/lib/patch-packages-remote-ipc.js`)

Applied on every `bootstrap-modern` (idempotent):

| Package | Change |
|---------|--------|
| **settings-view** | `shell.openExternal` → `atom.applicationDelegate.openExternal` |
| **tree-view** | `showItemInFolder` / trash via applicationDelegate; trash loop is async |
| **tree-view** DND | Drop `remote.BrowserWindow.fromId`; use `atom-webcontents-send-to-window-id` + `atom-get-current-window-id-sync` |
| **github** | Direct `shell.openExternal` sites → applicationDelegate (issueish / review / remotes) |

## Why

Packages previously called `electron.shell` in the preload/isolated world, bypassing the main-process scheme filter and using removed sync trash APIs. Cross-window tree-view DND used `remote` + `getCurrentWindow().id`, which is unreliable under the IPC window proxy.

## Deferred (later N2 / N3)

- fuzzy-finder `child_process.spawn` (ripgrep) and path crawl `fs` — already in `atom.Task`
- tree-view bulk `fs-plus` for file ops UI
- settings-view avatar cache `fs` under userData
- Full package require allowlist (N3)

## Verify

```bash
# After bootstrap or re-run:
node script/lib/patch-packages-remote-ipc.js

# Smoke (packaged or dev):
node script/ci/smoke-test.js "out/Atom.app"   # or Atom Dev.app

# Manual:
# - Settings → package card / Learn more → opens https in browser (not file://)
# - Tree view → Show in Finder / Move to Trash
# - Drag project root between two Atom windows (if multi-window)
```

## Related

- Phase N overview: `docs/security-phase-n.md` (when present) / `docs/remote-ipc-inventory.md`
- IPC inventory: `docs/remote-ipc-inventory.md` §9
