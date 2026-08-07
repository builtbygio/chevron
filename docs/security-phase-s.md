# Security Phase S — editor sandbox prep & package host redesign

**Status:** **complete** (prep goals + Option C product decision)  
**Decision:** [security-phase-s-decision.md](./security-phase-s-decision.md) — editor `sandbox: false` permanent under current architecture  
**Depends on:** Phase N0–N5.1 (done), Electron BP P0–P3 shippable (done, 0.6.0)  
**Related:** [security-phase-s-package-host.md](./security-phase-s-package-host.md), [security-phase-s-utilityprocess.md](./security-phase-s-utilityprocess.md), [security-threat-model.md](./security-threat-model.md), [package-node-policy.md](./package-node-policy.md)  
**Inventory:** `src/preload-natives.js`  
**Handoff:** `GROK.md`

## Goal (achieved under Option C)

Ship a **default-secure, honest** model for a hackable Electron editor:

1. Performance-critical editor natives stay in a **defined host** (editor preload).  
2. **Community** packages cannot load arbitrary `.node` / privileged Node by default.  
3. **Bundled** packages prefer Atom/IPC; ownership under `builtbygio/*` + in-repo packages.  
4. GitHub git workers use **`utilityProcess`**, not Node `BrowserWindow`s.  
5. Editor Chromium **`sandbox: true` is explicitly declined** until Option A is funded (see decision doc).

## Why editor sandbox stays false

Electron sandboxed preload cannot `require()` arbitrary native addons. Hot path today:

| Class | Examples |
|-------|----------|
| **renderer-hot** | `superstring`, `tree-sitter`, `oniguruma` |
| **renderer** | pathwatcher family, scrollbar-style, keyboard-layout, git-utils |
| **package-t1** | keytar, fuzzy-native, spellchecker |
| **main-only** | `nslog`, `fs-admin` (not package sandbox blockers) |

Authoritative list: **`src/preload-natives.js`** (`phaseSDecision: Option C`).

## Product posture

| Surface | Status |
|---------|--------|
| Editor page world | No Node, `contextIsolation` |
| Editor preload | Node + natives, **`sandbox: false` (Option C)** |
| Community packages | Privileged + native require **restricted** (default on) |
| Guest webview | Sandboxed, no Node |
| Package git workers | **utilityProcess** (BW emergency-only) |
| Hackable motto | T0/T1 Node OK; T2 no Node guarantee |

## Architecture options (resolved)

| Option | Outcome |
|--------|---------|
| **A** Full editor sandbox + natives over IPC | **Declined** for current architecture (no proven spike) |
| **B** Package host isolation | **Shipped v1** (in-process require policy); v2 process host is post–Phase S |
| **C** Hybrid | **Accepted** — editor unsandboxed; isolation elsewhere |

## Status board

| ID | Item | Status |
|----|------|--------|
| S0 | Inventory + plan | **done** |
| S1.0 | Community native / `.node` block | **done** |
| S1.1 | Audit messaging for natives | **done** (`native/` prefix in audit logs) |
| S1.2 | Package host design | **done** |
| S2 | Main-only tags / easy moves | **done** under Option C (`nslog`/`fs-admin` main-only; hot-path stay) |
| S3 | utilityProcess git workers | **done** (product path; BW emergency env only) |
| S4 | sendSync → invoke | **deferred** (optional hygiene, not Phase S gate) |
| S5 | Option A vs C | **done — Option C** |
| S6 | Sandbox product decision | **done — `false`** |

## Emergency / expert knobs

| Knob | Effect |
|------|--------|
| `CHEVRON_RESTRICT_PACKAGE_REQUIRES=0` | Allow community privileged/native requires |
| `CHEVRON_ALLOW_PACKAGE_WORKER_BROWSERWINDOW=1` | Emergency Node BrowserWindow git workers |
| `CHEVRON_GITHUB_UTILITY_WORKERS=0` | Deprecated alias for emergency BW path |
| `CHEVRON_DISABLE_LEGACY_TRANSPILE=1` | Refuse Coffee/Babel-5 compile-cache |

## Post–Phase S (not blocking)

- Package host **v2** (utility process for community activation)  
- Optional **S4** sendSync→invoke cleanup  
- Owned-package SCA forks (#58)  
- Option A buffer-host project if ever funded  

## Verification

```bash
node --check src/preload-natives.js
node --check src/package-require-audit.js
node --test script/ci/package-require-audit.test.js
node --test script/ci/package-utility-worker.test.js
node --test script/ci/git-utility-host-integration.test.js
# product path: utility workers on unless emergency env
```
