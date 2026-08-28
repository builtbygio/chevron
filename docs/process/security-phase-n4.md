# Security Phase N4 — guest content polish

**Status:** N4.1 shipped (guest WebContents navigation + permissions + partition)  
**Date:** 2026-07-22  
**Depends on:** N3 guest `will-attach-webview` lockdown.

## Goal

Finish guest-content hardening for `<webview>` embeds (community packages / previews) beyond “no Node.”

## What shipped (N4.1)

In `AtomWindow` (`src/main-process/atom-window.js`):

| Control | Behavior |
|---------|----------|
| `will-attach-webview` | Existing N3 prefs (no preload, no Node, sandbox, contextIsolation, webSecurity) |
| Default `partition` | `chevron-guest` when unset — isolates cookies/storage from editor session |
| `did-attach-webview` | Configures the guest `WebContents` after attach |
| Guest `setWindowOpenHandler` | Deny `window.open` / new windows from guest |
| Guest `will-navigate` / `will-redirect` | Allow only `http(s)`, `data`, `blob`, `about`, `file` |
| Guest permission handlers | Deny all Chromium permission prompts |

## Allowed guest navigation schemes

`http:`, `https:`, `data:`, `blob:`, `about:`, `file:`

Denied (examples): `javascript:`, `atom:`, `chevron:`, `file` is allowed for local markdown assets; protocol-relative oddities fail URL parse → deny.

## Non-goals

- Removing `webviewTag` entirely (still needed for some previews / community)
- Editor window `sandbox: true` (N5 / Phase S; blocked on natives)
- Full CSP injection on every guest response (risk of breaking data: previews)

## Verify

```bash
node --check src/main-process/atom-window.js
# Manual: package that embeds <webview>; guest cannot open windows or use media perms
```

## Related

- [security-phase-n3.md](./security-phase-n3.md) — preload privilege + first guest lockdown  
- [security-phase-n.md](./security-phase-n.md) — full Phase N plan  
