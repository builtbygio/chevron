# Phase S3 — GitHub workers → utilityProcess

**Status:** design + migration plan (implementation not complete)  
**Parent:** [security-phase-s.md](./security-phase-s.md), BP P3.1 deferred  
**Code today:** `src/main-process/register-renderer-ipc.js` (`atom-create-browser-window-sync`), owned `github` package WorkerManager  
**Issue:** #61

## Problem

The github package still creates **hidden Node `BrowserWindow`s** for git workers:

| Pref (N5.1) | Value |
|-------------|--------|
| `nodeIntegration` | `true` |
| `contextIsolation` | `false` |
| `sandbox` | `false` |
| partition | `chevron-package-worker` |
| navigation | `file:` only |
| window.open / permissions | denied |

This is intentional for dugite + `worker.js`, but it keeps a full Chromium renderer with Node — larger attack surface and memory cost than a headless Node utility process.

## Target architecture

```text
Editor renderer (github package)
        │  IPC: git-job request/response
        ▼
Main process (broker, allowlist)
        │  utilityProcess.fork(workerEntry)
        ▼
utilityProcess (Node, no DOM)
        dugite / git exec / worker protocol
```

### Why utilityProcess (not BrowserWindow)

- No DOM, no webRequest, no accidental navigation surface  
- Still Node for dugite native/git child processes  
- Lifecycle owned by main (crash isolation from editor UI)  
- Aligns with Electron guidance for background Node work  

### Why not pure main-process dugite only

Main can run dugite, but long git operations and crash isolation favor a child; utilityProcess matches “worker” mental model already in the github package.

## Migration steps (implementation PRs)

### PR1 — Main-side utility worker scaffold (Chevron monorepo)

1. Add `src/main-process/package-utility-worker.js` (or similar):  
   - `utilityProcess.fork` entry under `src/main-process/workers/git-utility-host.js`  
   - Message protocol: `{ id, type, payload }` / `{ id, ok, result|error }`  
2. Register IPC from renderer:  
   - `atom-utility-worker-create`  
   - `atom-utility-worker-send`  
   - `atom-utility-worker-destroy`  
3. **Do not** remove BrowserWindow path yet; feature-flag:  
   - `CHEVRON_GITHUB_UTILITY_WORKERS=1` or config `core.githubUtilityWorkers`  

### PR2 — github package WorkerManager dual-path (owned fork)

1. Detect flag via IPC capability query.  
2. If utility path available, skip `atom-create-browser-window-sync`.  
3. Map existing worker message shapes 1:1 where possible to limit churn.  
4. Keep BrowserWindow fallback until dogfood passes.

### PR3 — Default-on + remove BrowserWindow workers

1. Default utility path on.  
2. Delete package-worker BrowserWindow creation for github.  
3. Narrow or remove `atom-create-browser-window-sync` if nothing else needs it (audit callers first).  
4. Smoke + manual github package flows (clone, fetch, commit UI).

## Protocol sketch

```json
// renderer → main → utility
{ "id": "1", "channel": "git", "method": "exec", "args": ["status", "--porcelain"] }

// utility → main → renderer
{ "id": "1", "ok": true, "stdout": "...", "stderr": "", "exitCode": 0 }
```

Deny any method not on an allowlist (`exec` with argv policy, filesystem under project roots only — reuse FS IPC roots concepts).

## Security properties

| Property | BrowserWindow worker today | utilityProcess target |
|----------|----------------------------|------------------------|
| Node | yes | yes (required for dugite) |
| DOM / web APIs | yes (unused) | no |
| Navigation surface | hardened file: | N/A |
| Crash isolation from editor | separate renderer | separate process |
| Arbitrary BrowserWindow IPC | allowlisted (P0.2) | N/A if path removed |

Node in the utility process remains **trusted code we ship** (T1), not community code.

## Risks

- dugite + environment / PATH / credential helper behavior differences  
- Windows process lifetime and stdio  
- Message size for large git output — may need streaming  
- github package is large; dual-path period will be multi-week  

## Exit criteria (#61)

- [ ] Utility path feature-flagged and dogfooded  
- [ ] Default-on on all CI platforms  
- [ ] No github use of `atom-create-browser-window-sync`  
- [ ] Smoke + documented manual github checklist green  

## Non-goals

- Running **community** packages inside this git utility process  
- Replacing renderer `git-utils` in one step (may follow S2/S3 jointly)  
