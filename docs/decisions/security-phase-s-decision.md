# Phase S product decision (S5 / S6)

**Status:** **decided**  
**Date:** 2026-08  
**Option:** **C** (hybrid)  
**Editor `webPreferences.sandbox`:** **`false` (permanent for this architecture)**  

Related: [security-phase-s.md](../process/security-phase-s.md), [security-phase-s-package-host.md](../reference/security-phase-s-package-host.md), [security-threat-model.md](../reference/security-threat-model.md), `src/preload-natives.js`.

## Decision

Chevron **does not** flip the main editor window to Chromium `sandbox: true` as part of Phase S.

Security for the shippable product rests on:

1. **T2 community package restrict** (privileged Node + native addons + `.node` blocked by default)  
2. **Guest `<webview>` lockdown** (sandbox, no Node, scheme/path limits)  
3. **IPC / protocol allowlists** (Electron BP P0–P3)  
4. **Git workers in `utilityProcess`** (Phase S3 — not Node BrowserWindows)  
5. **Production Electron fuses** and no default telemetry  

Editor preload keeps Node + hot-path natives (`superstring`, `tree-sitter`, `oniguruma`, pathwatcher family) for performance and Atom package compatibility.

## Why not Option A (full sandbox)

Option A requires relocating buffer/grammar natives out of the editor process and talking over IPC. That is a multi-release rewrite of TextBuffer + language modes with latency and correctness risk. No time-boxed spike has proven acceptable performance; we **decline Option A for the current architecture** rather than leave S5 open indefinitely.

Revisit only if:

- Electron gains first-class sandboxed native loading for our addon set, or  
- A deliberate multi-quarter project funds buffer-host IPC with benchmarks.

## Why not pretend sandbox:true

Checking the Electron tutorial box while still loading `.node` from preload would be dishonest. **Option C is the documented, intentional end state** for Chevron’s hackable editor host.

## Package host (Option B spine)

In-process require policy (v1) remains the T2 isolation model. A future **utility package host** (host v2 in the package-host design note) is **post–Phase S** product work, not a gate for this decision.

## Release notes (copy)

> **Security Phase S complete (prep goals):** community packages cannot load privileged Node or native addons by default; github git work runs in an Electron utility process; guests and IPC stay hardened. The main editor remains deliberately unsandboxed so hot-path native modules and the hackable package model continue to work. See `docs/decisions/security-phase-s-decision.md`.

## Exit criteria checklist

| Item | Status |
|------|--------|
| S0 inventory + plan | done |
| S1 community native/privileged restrict | done |
| S1.2 package host design | done |
| S2 main-only tags match reality | done |
| S3 utilityProcess git workers (no product BW path) | done |
| S5 written Option C decision | **this doc** |
| S6 sandbox product decision + notes | **this doc** + CHANGELOG |
| S4 sendSync→invoke | **out of Phase S** (optional hygiene) |
| Package host v2 process isolation | **post–Phase S** |
