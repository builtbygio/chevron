# Security Phase S — editor sandbox prep & package host redesign

**Status:** **prep active** (S0 + S1.0 started 2026-08-01)  
**Depends on:** Phase N0–N5.1 (done), Electron BP P0–P3 shippable (done, 0.6.0)  
**Related:** `docs/security-phase-n.md`, `docs/security-phase-n5.md`, `docs/electron-best-practices-plan.md`, `docs/package-node-policy.md`, `docs/security-threat-model.md`  
**Inventory:** `src/preload-natives.js`  
**Handoff:** `GROK.md`

## Goal

Get Chevron to a state where enabling Chromium **`sandbox: true`** on the **main editor** window is an explicit, reversible product decision — not a one-line flip that breaks TextBuffer, grammars, and packages.

**Phase S is multi-release.** Prep does not promise `sandbox: true` in the next minor.

Terminal state (aspirational):

1. Performance-critical editor natives run in a **defined host** (still may be the editor process if Electron cannot load them under sandbox).
2. **Community** package code cannot load arbitrary `.node` addons or privileged Node modules in the editor host (default).
3. **Bundled** packages prefer Atom/IPC; remaining Node is allowlisted and owned.
4. GitHub git workers do not need full Node `BrowserWindow`s (utility process / main).
5. Only then: evaluate `webPreferences.sandbox = true` on the editor `BrowserWindow`.

## Why we cannot flip sandbox today

Electron sandboxed preload **cannot** `require()` arbitrary native addons the way Atom expects. The editor preload currently loads:

| Class | Examples | Why hard |
|-------|----------|----------|
| **Hot path renderer** | `superstring`, `tree-sitter`, `oniguruma` | Typing / parse latency; same-process with TextEditor |
| **FS watch** | `pathwatcher`, `@atom/watcher`, `@atom/nsfw` | High event volume; core Directory/File |
| **Editor chrome** | `scrollbar-style`, `keyboard-layout` | Small; still `.node` in renderer |
| **Git core** | `git-utils` | `GitRepository` in renderer |
| **Main / rare** | `nslog`, `fs-admin` | Already main-ish; easy to keep out of preload narrative |
| **T1 package** | `keytar`, `@atom/fuzzy-native`, `spellchecker` | Owned packages; candidates for utility process later |

Authoritative list + migration tags: **`src/preload-natives.js`**.

## Product posture (do not regress)

| Surface | Today | Phase S target |
|---------|-------|----------------|
| Editor page world | No Node, isolation | Keep |
| Editor preload | Full Node, `sandbox: false` | Shrink; sandbox only if natives strategy allows |
| Community packages | Privileged require **restricted** (default on) | + **native addon block** (S1.0); long-term host split |
| Guest webview | Sandboxed, no Node | Keep |
| Package workers (github) | Node BW, hardened prefs | → utilityProcess (S3) |
| Hackable motto | Core + T1 can use Node | Keep for **T0/T1**; T2 no Node guarantee |

## Architecture options

### Option A — Full Chromium sandbox on editor (hard)

Move **all** hot-path natives out of the editor process (main or utility) and talk over IPC.

| Pros | Cons |
|------|------|
| Matches Electron security tutorial | Superstring/tree-sitter over IPC is a **rewrite** of TextBuffer + language modes; latency risk |
| Cleanest checklist box | Months–years; high regression risk |

**Use when:** native host IPC is proven for buffer ops (spike required).

### Option B — Package host split, editor stays unsandboxed (recommended spine)

Keep editor preload Node for T0 natives; run **community** (and eventually some T1) code in a **restricted host** that cannot `dlopen` arbitrary `.node` or use privileged modules.

| Pros | Cons |
|------|------|
| Incremental; aligns with existing require restrict | Does not alone set `sandbox: true` |
| Real security win for T2 | Still one process for core natives |
| Matches VS Code “extension host” intuition | Host redesign + package activation changes |

**S1–S2 focus.** Treat full sandbox as optional endgame after Option A spike.

### Option C — Hybrid (likely end state)

- Hot-path natives stay in editor process → **sandbox may remain false permanently** for the editor window, documented as intentional.
- Package host isolation + utilityProcess workers deliver most of the threat-model win.
- Revisit sandbox if Electron gains sandboxed native loading or we prove Option A.

**Document honesty over checkbox compliance.** Threat model already allows editor Node for T0/T1.

## Recommended sequencing

```text
S0  Inventory + plan (this doc) ──────────────────────────┐
S1  Package host isolation v1 (native block, policy)      │  prep
S2  Easy native relocation / ownership (main-only tags)   │
S3  GitHub workers → utilityProcess (large)               │  can parallel after S1
S4  Non-boot sendSync → invoke (optional, inventory §11)  │
S5  Option A spike (superstring-in-main) OR accept Option C
S6  Product decision: sandbox true / false + release notes
```

Do **not** start S6 until S1 is default-on and dogfooded, and S5 has a written decision.

---

## Workstreams

### S0 — Inventory & plan — **in progress / this PR**

**Do:**

1. Author this plan; link from `GROK.md` and Phase N docs.  
2. Expand `src/preload-natives.js`: migration class, load sites, process affinity per native.  
3. Add `nativeAddonModuleIds` for policy enforcement.  
4. Document architecture options and recommended spine (B → C, A optional).

**Done when:** Maintainers can answer “why sandbox is false” and “what is next” from this doc + inventory alone.

### S1 — Package host isolation v1

Community code already cannot `require('fs')` / `child_process` / `electron` by default (BP P1.2). Phase S tightens **native** loading.

#### S1.0 — Block community native addons — **this PR**

When require-restrict is on (default):

- Community callers cannot `require()` modules listed as **native addons** in `preload-natives.js`.  
- Community callers cannot `require()` ids that resolve as **`.node` bindings** (path ends with `.node`).  
- Core + bundled (app.asar / monorepo packages) unchanged.

**Files:** `src/package-require-audit.js`, `src/preload-natives.js`, specs, `docs/package-node-policy.md`.

#### S1.1 — Audit mode for natives (follow-up)

Log community attempts to load natives under `CHEVRON_AUDIT_PACKAGE_REQUIRES` (already logs privileged; extend messaging for native class).

#### S1.2 — Package host design note (follow-up)

Short design: activation in-process vs separate utility process; what `atom.*` must be proxied; compatibility for packages that only use Atom APIs.

### S2 — Easy native relocation

Tag natives as `main-only` / `renderer-hot` / `package-t1` and move what is cheap:

| Native | Target | Notes |
|--------|--------|-------|
| `nslog` | main only | Already main-process logging |
| `fs-admin` | main only | command-installer; never needed in package world |
| `keytar` | main IPC or utility | github credentials |
| `scrollbar-style` / `keyboard-layout` | evaluate | small surface; optional IPC |
| `superstring` / `tree-sitter` / `oniguruma` | **stay** until S5 | hot path |
| `pathwatcher` family | evaluate async main fanout | medium |
| `git-utils` | evaluate with S3 | may move with git worker redesign |
| package natives | T1 owned process or keep | fuzzy-native, spellchecker |

**Done when:** inventory tags match reality; at least main-only natives are documented and not cited as sandbox blockers for package code.

### S3 — GitHub workers → utilityProcess

Replace hidden Node `BrowserWindow` workers with Electron `utilityProcess` (or main-process dugite). Large rewrite of owned `github` package. See BP plan P3.1.

**Prerequisite:** S1 so community cannot recreate the old worker pattern with Node BWs (already constrained by IPC allowlists).

### S4 — Optional IPC hygiene

Migrate non-boot `sendSync` → `invoke` per `docs/remote-ipc-inventory.md` §11. Not a sandbox gate.

### S5 — Option A spike **or** accept Option C

Time-boxed spike: can TextBuffer operate with superstring in main/utility without unacceptable latency?

- **If yes:** plan multi-PR buffer IPC.  
- **If no:** write decision in this doc + threat model: editor `sandbox: false` is **permanent** for T0; security rests on package host + guest lockdown + BP allowlists.

### S6 — Product decision

Flip or not; release notes; update Electron checklist in BP plan.

---

## Status board

| ID | Item | Status |
|----|------|--------|
| S0.1 | Plan doc | **done** (this file) |
| S0.2 | Expanded `preload-natives.js` inventory | **done** |
| S1.0 | Community native addon / `.node` block | **done** (this PR) |
| S1.1 | Audit messaging for natives | pending |
| S1.2 | Package host design note | pending |
| S2.* | Easy native relocation | pending |
| S3 | utilityProcess github workers | pending (large) |
| S4 | sendSync → invoke | pending (optional) |
| S5 | Option A spike / Option C decision | pending |
| S6 | sandbox product decision | blocked on S1 + S5 |

---

## Verification

```bash
node --check src/preload-natives.js
node --check src/package-require-audit.js
# specs
# (from built app or test runner)
CHEVRON_AUDIT_PACKAGE_REQUIRES=1  # optional log
# Restrict default on: community require('keytar') / require('./x.node') must throw
./script/with-modern-env ./script/build --no-bootstrap
node script/ci/smoke-test.js out/Chevron-linux-x64
```

## Explicit non-goals (prep)

- Flipping editor `sandbox: true` in this phase alone  
- Breaking T1 bundled packages  
- Pulsar rebase / Avalonia  
- Dropping dual-support Atom API names  

## Resume

1. Land S0 + S1.0 (this PR).  
2. Next: **S1.2** package host design note, then pick one **S2** easy move (`fs-admin` / `nslog` clarity) or start **S3** spike on github utilityProcess.  
3. Do not schedule S6 until S5 decision exists.
