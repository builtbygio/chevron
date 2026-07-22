# Security Phase N5 — toward Phase S (hackable-compatible)

**Status:** N5.1 shipped (secondary package window hardening)  
**Date:** 2026-07-22  
**Depends on:** N3 guest lockdown, N4 guest WebContents polish  
**Handoff:** `GROK.md`, `src/preload-natives.js`

## Motto alignment

Chevron stays a **hackable** editor:

| Surface | Policy |
|---------|--------|
| Editor preload + packages | **Node allowed**; `sandbox: false` (natives) |
| Guest `<webview>` | **Sandboxed**, no Node (N3/N4) |
| Package secondary windows (github workers) | **Node kept** for dugite/worker.js; hardened prefs + nav + perms (N5) |
| Community require lockdown | Still **opt-in** (`CHEVRON_RESTRICT_PACKAGE_REQUIRES=1`) |

N5 does **not** enable editor `sandbox: true`. That is **Phase S**, blocked on natives.

## What shipped (N5.1)

### Guest webviews (already N3/N4)

Reaffirmed: `will-attach-webview` forces `sandbox: true`, no Node, no package preload; N4 adds nav scheme allowlist, permission deny, `chevron-guest` partition.

### Package secondary `BrowserWindow`s (`atom-create-browser-window-sync`)

Caller-supplied `webPreferences` remain **ignored**. Fixed set:

| Pref | Value | Why |
|------|-------|-----|
| `nodeIntegration` | `true` | worker.js / dugite (hackable) |
| `contextIsolation` | `false` | same legacy worker contract |
| `sandbox` | `false` | natives in worker page |
| `nodeIntegrationInWorker` / `InSubFrames` | `false` | shrink surface |
| `webSecurity` | `true` | no insecure mixed content |
| `allowRunningInsecureContent` | `false` | |
| `experimentalFeatures` | `false` | |
| `partition` | `chevron-package-worker` | isolate from editor session |

After create:

- `setWindowOpenHandler` → deny  
- `will-navigate` / `will-redirect` → **file:** (and `about:blank`) only  
- Permission request/check → **deny all**  
- `loadURL` via IPC for worker windows → same file: allowlist  

## Explicit non-goals (N5)

- Editor `sandbox: true`  
- Removing Node from github workers (needs utility-process rewrite)  
- Default-on community require block  
- Turning off `webviewTag` or `nodeIntegrationInWorker` on the editor  

## Phase S path (later)

1. Move or replace in-process natives listed in `src/preload-natives.js`.  
2. Split package host so community code cannot load arbitrary `.node` in the editor preload.  
3. Re-evaluate editor `sandbox: true` only after (1)–(2).  

## Verify

```bash
node --check src/main-process/register-renderer-ipc.js
node --check src/main-process/atom-window.js
# Manual: open a git project; github package status/branch still works
# (worker windows still Node, but cannot navigate to https: or open children)
```

## Related

- [security-phase-n.md](./security-phase-n.md) — full Phase N plan  
- [security-phase-n3.md](./security-phase-n3.md) — guests + inventory  
- [security-phase-n4.md](./security-phase-n4.md) — guest WebContents  
- [package-node-policy.md](./package-node-policy.md) — package tiers  
