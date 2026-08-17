# Phase S1.2 — Package host design

**Status:** design locked; **host v2 slices 21.1–21.4 implemented** (see "Implementation status")  
**Parent:** [security-phase-s.md](./security-phase-s.md)  
**Related:** [package-node-policy.md](./package-node-policy.md), [security-threat-model.md](./security-threat-model.md)

## Decision summary

| Choice | Decision |
|--------|----------|
| Spine | **Option B** first: isolate **community (T2)** privilege; keep editor preload Node for T0 natives |
| Product timing | **Deferred:** closed **owned catalog only** until base Chevron is ready; then host v2 for sandboxed community — [package-ecosystem-strategy.md](./package-ecosystem-strategy.md) |
| Editor Chromium `sandbox: true` | **Not** the near-term goal; likely **Option C** (sandbox stays false for editor hot-path natives) unless Option A spike succeeds |
| Host model v1 (now) | **In-process policy** — `package-require-audit` (privileged + native + `.node` block, default on) |
| Host model v2 (target) | **Restricted package host** utilityProcess for T2 activation (VS Code “extension host” intuition). **Built** — see "Implementation status" |
| T1 bundled packages | Stay in editor preload until individually migrated; owned forks only |

This note is the **S1.2 deliverable**. Host v2 implementation is **deferred** until base Chevron is ready ([package-ecosystem-strategy.md](./package-ecosystem-strategy.md)); product uses **owned catalog only** until then.

## Goals

1. Malicious or compromised **community** packages cannot get raw Node, `electron`, or arbitrary `.node` loads when defaults are on (and when community install returns).  
2. Packages that only use the **supported Chevron package API** (`global.chevron` / `require('chevron')`) keep working without privileged Node.  
3. **Hackable** remains true for core + owned bundled packages (T0/T1).  
4. Clear upgrade path toward a separate host without a big-bang rewrite.  
5. Until host v2: product **owned catalog only** (no open community install promise).

## Non-goals (this design)

- Moving superstring / tree-sitter / oniguruma out of the editor process (that is S5 Option A).  
- Full Chromium sandbox on the editor window (S6).  
- Breaking `engines.atom` dual-support names.

## Trust placement

```text
┌─────────────────────────────────────────────────────────┐
│ Main process (T0)                                         │
│  IPC allowlists, FS roots, openExternal, protocols        │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ Editor BrowserWindow                                      │
│  page world: no Node, contextIsolation                    │
│  preload: Node + natives (T0) — sandbox:false (Option C)  │
│                                                           │
│  T1 bundled packages ── activate in preload (owned)       │
│  T2 community ────────── activate in preload TODAY        │
│       └─ require-audit blocks privileged/native/.node     │
│       └─ v2: move activation into Package Host process    │
└───────────────────────────────────────────────────────────┘
```

## Host v1 (shipped) — in-process require policy

**Mechanism:** `Module.prototype.require` hook in `src/package-require-audit.js`, installed early from preload boot.

| Caller class | Privileged / native / `.node` |
|--------------|-------------------------------|
| `core` (`src/`, `static/`) | allow |
| `bundled` (asar, monorepo `packages/`, app `node_modules`) | allow |
| `community` (`~/.atom/packages`, `~/.chevron/packages`) | **deny** (default) |
| `unknown` | allow (fail-open for odd stacks; do not treat as community) |

**Escape hatches:** `CHEVRON_RESTRICT_PACKAGE_REQUIRES=0` / `core.restrictCommunityPackageRequires: false`.

**Limits (documented honestly):**

- Same process as editor: a community package that only uses Atom APIs is fine; one that abuses a **bundled** package bug still runs as user.  
- Path classification is heuristic ([package-node-policy.md](./package-node-policy.md) edge cases).  
- Does not replace Chromium sandbox or OS process isolation.

## Host v2 (target) — restricted package host

### Process shape

| Component | Role |
|-----------|------|
| **Editor host** | TextBuffer, grammars, UI, T0 natives, T1 until migrated |
| **Package host** | Load and run **T2** package JS only; no `dlopen` of arbitrary natives; no privileged Node; talk to editor via IPC |
| **Main** | Trusted broker; may own git/utility workers (S3) |

Preferred Electron primitive: **`utilityProcess`** (Node, no DOM) for package host and for github workers (S3). Avoid new Node `BrowserWindow`s.

### Activation flow (v2)

1. `PackageManager` resolves package path + metadata in editor/main.  
2. If package is **community** and host v2 enabled: send `package:activate` to package host with path, name, config snapshot.  
3. Host loads package main with a **stub `atom` proxy** implementing the published Atom API surface needed for activate/deactivate/commands/services.  
4. UI contributions (views, panels) either:  
   - **(A) DOM stays in editor** — package returns serializable contribution descriptors; editor creates views (largest API change), or  
   - **(B) Hybrid** — pure logic packages fully on host; UI packages stay in-process under v1 policy until rewritten.  

**Recommended first slice:** **(B) Hybrid** — host runs non-UI packages and “logic-only” services; UI packages remain v1 + require restrict. Document which `package.json` activations need DOM.

### Implementation status (Epic 21)

Landed behind `core.packageHostV2` / `CHEVRON_PACKAGE_HOST_V2`, **default off**.

| Slice | What exists | Where |
|-------|-------------|-------|
| 21.1 | Supervised `chevron-package-host` utilityProcess: boot handshake, `requestId` correlation, exit broadcast, subscriber fan-out | `src/main-process/package-host-manager.js`, `workers/package-host.js` |
| 21.2 | Activation of logic-only packages behind a restricted loader + stub `chevron` proxy | `workers/package-host-require.js`, `workers/package-host-stub.js` |
| 21.3 | `providedServices` / `consumedServices` across the boundary as descriptors + RPC proxies, both directions | `workers/package-host-services.js` |
| 21.4 | Hybrid routing: which packages may run in the host | `src/package-host-eligibility.js` |
| 21.5 | This documentation pass + author guidance | docs |

**Not yet done.** The editor-side `PackageManager` call site is *not* switched — nothing is routed to the host at runtime yet. That is a behaviour change wanting its own review and a dogfood window. Everything above is the mechanism plus its gate.

Two properties the tests pin down, because they are the ones that would rot quietly:

- The host has **no DOM** (`hasDocument` / `hasWindow` are false). Hybrid routing depends on it.
- The restricted loader is installed **before** activation is even defined, so package code cannot load ahead of the sandbox.

#### Require policy in the host vs in-process

The in-process v1 policy can be disabled (`CHEVRON_RESTRICT_PACKAGE_REQUIRES=0`) because it guards a process that is privileged anyway. Inside the host the block is **unconditional** — the host exists precisely so T2 code cannot reach privileged Node, so there is no escape hatch.

#### Which packages are host-eligible

`src/package-host-eligibility.js`, in precedence order:

1. `package.json` `chevronPackageHost: "eligible" | "editor"` — explicit author intent wins both ways.
2. Community (T2) only. Core and bundled stay in-process, per "T1 bundled packages stay in editor preload until individually migrated".
3. Any DOM signal in the package's own sources — `document`, `window`, `createElement`, `customElements`, etch, React, `add*Panel`, view registry — keeps it in-process.
4. A privileged require keeps it in-process. The host would refuse it, and routing there would convert a policy error into an activation failure.

Detection is deliberately conservative. A false "needs DOM" costs nothing — the package keeps working exactly as it does today. A false "host-eligible" blanks a UI at activation.

### `atom.*` proxy surface (minimum for host packages)

Must be RPC-friendly (structured clone / JSON). Implemented surface is in `workers/package-host-stub.js`:

| API area | Proxy notes |
|----------|-------------|
| `atom.config` | get/set/observe over IPC |
| `atom.commands` | add/dispatch by name |
| `atom.workspace` | open paths, pane items by URI (not raw DOM) |
| `atom.project` | paths, repositories by id |
| `atom.notifications` | add* only |
| `atom.packages` | limited (no nested requires of other packages’ Node) |
| `atom.styles` / themes | prefer editor-side for CSS injection |
| `BufferedProcess` / `Task` | main-owned process spawn with allowlists |

Anything that returns a live DOM node stays editor-side.

### Compatibility promise

| Package style | v1 | v2 host |
|---------------|----|---------|
| Atom APIs only, no Node | works | works (goal) |
| `require('fs')` / natives | blocked by default | blocked |
| Custom elements / direct DOM in activate | works (preload) | hybrid: stay editor-side or rewrite |
| TextMate grammar only | works | works (no host needed) |

Package authors guidance remains [package-node-policy.md](./package-node-policy.md).

## Sequencing after this note

1. **S2** — Confirm main-only natives (`nslog`, `fs-admin`) are not preload sandbox blockers; optional small IPC moves (`keytar`).  
2. **S3** — github workers → utilityProcess ([security-phase-s-utilityprocess.md](./security-phase-s-utilityprocess.md)).  
3. **Host v2 spike** — activate one pure-logic community package in utilityProcess with stub `atom` (time-boxed).  
4. **S5** — Option A latency spike **or** write Option C decision (sandbox stays false).  
5. **S6** — Product release notes only after S5 decision.

## Explicit product recommendation (pre-S5)

Unless Option A proves buffer-class natives over IPC, **ship Option C permanently for the editor window**: security value comes from T2 host isolation, guest lockdown, IPC allowlists, and BP fuses — not from checking `sandbox: true` on a process that must `dlopen` superstring.

## Verification

- Policy: `script/ci/package-require-audit.test.js` + Jasmine specs.  
- Dogfood: community packages that only use Atom APIs under default restrict.  
- Host v2 (Epic 21), all on bare Node via `node --test`:
  - `script/ci/package-host-bootstrap.test.js` — process lifecycle, DOM-free sandbox, loader-before-activation
  - `script/ci/package-host-activate.test.js` — activation, stub proxy, refused privileged require
  - `script/ci/package-host-services.test.js` — services both directions, late offers, range matching
  - `script/ci/package-host-eligibility.test.js` — hybrid routing decisions
- Still owed before routing is switched on: a dogfood window with a real community package, and an acceptance pass on activation ordering against the in-process path.

## Related issues

- Audit tracking #51, Phase S #60  
- utilityProcess workers #61  
