# Phase S3 — GitHub workers → utilityProcess

**Status:** **complete** (product path = utilityProcess only)  
**Parent:** [security-phase-s.md](./security-phase-s.md), [security-phase-s-decision.md](../decisions/security-phase-s-decision.md)  
**Code:**  
- `src/main-process/package-utility-worker.js`  
- `src/main-process/workers/git-utility-host.js`  
- IPC in `register-renderer-ipc.js`  
- utility proxy in `src/remote-compat.js`  
**Issue:** #61  

## Product path

```text
Editor renderer (github package WorkerManager)
        │  BrowserWindow surface → utility proxy
        ▼
Main process (broker)
        │  utilityProcess.fork(git-utility-host.js)
        ▼
utilityProcess (Node, no DOM) — dugite GitProcess
```

Node **BrowserWindow** workers are **not** the product path.  
The Node BrowserWindow emergency path is **gone** (architecture H1 PR 9). `atom-create-browser-window-sync` **always refuses**.

## Why utilityProcess

- No DOM / navigation surface  
- Still Node for dugite  
- Crash isolation from editor UI  
- Matches Electron guidance for background Node work  

## Migration history

| Step | Outcome |
|------|---------|
| PR1 scaffold + dual-path | done |
| Default-on + integration tests | done |
| Remove product BW path | **done** (this close-out) |

## Protocol

Same logical messages as legacy `worker.js`: `init`, `git-exec`, `git-cancel` → `renderer-ready`, `git-data`, … bridged on `github:renderer-ipc`.

## Exit criteria (#61)

- [x] Utility path feature-flagged / always-on product path  
- [x] Integration tests with real dugite  
- [x] Default-on  
- [x] Product BrowserWindow worker path removed (emergency env only)  
- [ ] Optional: delete emergency path entirely in a later cleanup  
