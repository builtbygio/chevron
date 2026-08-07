# Phase S3 — GitHub workers → utilityProcess

**Status:** **PR1+ default-on** — utilityProcess is the default git worker path; BrowserWindow remains fallback when flag is off
**Parent:** [security-phase-s.md](./security-phase-s.md), BP P3.1 deferred  
**Code:**  
- `src/main-process/package-utility-worker.js`  
- `src/main-process/workers/git-utility-host.js`  
- IPC in `register-renderer-ipc.js`  
- dual-path `BrowserWindow` in `src/remote-compat.js` (no github pin bump required for trial)  
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

### PR1 — Main-side utility worker scaffold (Chevron monorepo) — **done**

1. `package-utility-worker.js` + `workers/git-utility-host.js` (dugite in utilityProcess)  
2. IPC: create/load/send/destroy + capabilities; `atom-bw-id-call-sync` dual-path for synthetic ids  
3. **Default ON:** `core.githubUtilityWorkers` default `true`; env unset → on. Opt out: `CHEVRON_GITHUB_UTILITY_WORKERS=0` or config `false`.  
4. **Transparent dual-path:** when enabled, `remote-compat` `BrowserWindow` constructs a utility worker proxy so `github` WorkerManager works **without** a package pin bump  
5. **Integration tests:** `script/ci/git-utility-host-integration.test.js` (real dugite via forked host)

Opt out / legacy BrowserWindow workers:

```bash
CHEVRON_GITHUB_UTILITY_WORKERS=0 ./out/Chevron-*/chevron
# or Settings → Core → disable "utilityProcess git workers" + relaunch
```

### PR2 — github package WorkerManager dual-path (owned fork) — **optional now**

Transparent proxy covers the common path. Optional follow-up: explicit capability check in WorkerManager + cleanup of `electron.remote` BrowserWindow construction for clarity.

1. Detect flag via `atom-utility-worker-capabilities`.  
2. Prefer utility path explicitly; keep BrowserWindow fallback.

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

- [x] Utility path feature-flagged (scaffold + unit tests)  
- [x] Integration tests with real dugite (`git-utility-host-integration.test.js`)  
- [x] Default-on (opt-out via env/config)  
- [ ] Manual dogfood of full github package UI flows (push/clone edge cases)  
- [ ] Remove BrowserWindow worker path when fallback no longer needed  
- [ ] Smoke + documented manual github checklist green

## Non-goals

- Running **community** packages inside this git utility process  
- Replacing renderer `git-utils` in one step (may follow S2/S3 jointly)  
