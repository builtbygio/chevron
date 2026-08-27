# Package Node policy (Chevron)

**Status:** Phase N3 + Phase S complete (Option C); **Chevron-only** product policy  
**Audience:** package authors and Chevron maintainers  
**Related:** [REBRANDING.md](./REBRANDING.md), [package-ecosystem-strategy.md](./package-ecosystem-strategy.md), [chevron-architecture-modernization.md](./chevron-architecture-modernization.md), [security-phase-n.md](./security-phase-n.md), [security-phase-s-decision.md](./security-phase-s-decision.md)

This doc is **privilege and Node policy**, not a dual-product promise. Names and config home follow [REBRANDING.md](./REBRANDING.md).

## Product names (legacy aliases only)

| Surface | Supported | Legacy (unsupported; may warn) |
|---------|-----------|--------------------------------|
| Editor env | `global.chevron` | `global.atom` |
| Package module | `require('chevron')` | `require('atom')` (one-shot warning) |
| Engines | `engines.chevron` | `engines.atom` alone → cpm warning |
| Protocol | `chevron://` | `atom://` still registered |
| Config home | **`~/.chevron`** | `ATOM_HOME` only if **explicitly** set — **no default to `~/.atom`** |

Config home order: `CHEVRON_HOME` → explicit `ATOM_HOME` → portable `.chevron` → **`~/.chevron`**.

That is **not** a promise that packages get unrestricted Node forever.

## Privilege tiers

| Tier | Who | Node in package code |
|------|-----|----------------------|
| **T0 Core** | Editor preload + `src/` | Allowed; new privileged ops should use main IPC |
| **T1 Bundled** | Ship-in packages (github, tree-view, …) | Prefer `chevron.*` / applicationDelegate IPC; no new `electron.remote` |
| **T2 Community** | User-installed packages | **No guaranteed Node** long-term; published editor APIs only. Catalog is **owned-only** until package host v2. The host is where T2 runs — not a store ([package host design](./security-phase-s-package-host.md)) |

Today (0.6.x): T1/T2 still share the **preload Node world** for compatibility. Community (T2) privileged requires and **native addon** loads are **blocked by default**. Phase S Option C keeps editor Chromium `sandbox` false; isolation is utilityProcess + restrict, not a full guest sandbox.

## Do / don’t

**Do**

- Use `chevron.workspace`, `chevron.project`, `chevron.packages`, `chevron.notifications`, `BufferedProcess`
- Long work: spawn via `BufferedProcess` or a main / `utilityProcess` host. **Do not add new `Task` callers.** `Task` is a wrap-then-delete leftover (`child_process.fork` + fake DOM) used only by existing owned pins (fuzzy-finder, symbols-view, `Workspace.replace`)
- Open external URLs via `applicationDelegate.openExternal` (scheme allowlist in main)
- File manager / trash via `showItemInFolder` / `moveItemToTrash` on applicationDelegate
- Declare **`engines.chevron`**

**Don’t**

- `require('electron').remote` / `@electron/remote` (removed; temporary compat only for some bundled code)
- `shell.openExternal` with arbitrary schemes
- Assume `require('fs')` / `child_process` / `net` will keep working for community packages
- Use the editor preload as a webview preload or enable Node for guest content
- Assume `~/.atom` is the config or package home
- Add new `Task` callers or treat `require('atom')` as a supported API

## Writing a host-eligible package (T2 authors)

Package host v2 (Epic 21) runs **logic-only** community packages in a restricted `utilityProcess` instead of the editor preload. It is gated behind `core.packageHostV2`, **default off**. When the flag is on, `PackageManager` routes eligible T2 packages to the host.

"T2 is the host" is the direction of travel. It is **not** "install anything from Pulsar" — the catalog stays owned-only ([package-ecosystem-strategy.md](./package-ecosystem-strategy.md)). The host is the isolation model that has to exist *before* community install can reopen.

**Your package can run in the host if it:**

- uses only `chevron.*` APIs — config, commands (selector-string targets), notifications, `workspace.open` by URI
- provides/consumes services through `providedServices` / `consumedServices`
- never touches `document`, `window`, `createElement`, `customElements`, etch, React, `add*Panel`, or the view registry
- never requires privileged Node, native addons, or `.node` bindings

**It cannot if it builds UI.** That is fine and supported — DOM packages keep activating in the editor preload under the v1 require policy. Hybrid is the design, not a transition state.

**Declaring intent.** `chevronPackageHost` in `package.json` overrides the heuristics in both directions:

```json
{ "chevronPackageHost": "eligible" }
```

```json
{ "chevronPackageHost": "editor" }
```

**Two behaviour differences to design for:**

- `chevron.config.get()` inside the host reads a **snapshot** taken at activate time, refreshed as the editor pushes changes. It is not a live read of the editor's config.
- Privileged requires throw **unconditionally** in the host. The `CHEVRON_RESTRICT_PACKAGE_REQUIRES=0` escape applies only to the in-process policy, which guards an already-privileged process.

## Auditing / restricting privileged requires (developers)

```bash
# Log only (inventory)
CHEVRON_AUDIT_PACKAGE_REQUIRES=1 ./out/Chevron-linux-x64/chevron --no-sandbox

# Restrict is ON by default (P1.2). Explicit enable still works:
CHEVRON_RESTRICT_PACKAGE_REQUIRES=1 ./out/Chevron-linux-x64/chevron --no-sandbox

# Escape hatch (allow community privileged/native requires)
CHEVRON_RESTRICT_PACKAGE_REQUIRES=0 ./out/Chevron-linux-x64/chevron --no-sandbox
```

| Env | Effect |
|-----|--------|
| `CHEVRON_AUDIT_PACKAGE_REQUIRES=1` | Log **one warning per caller path + module** for privileged / native requires |
| `CHEVRON_RESTRICT_PACKAGE_REQUIRES` unset / `1` | **Throw** on blocked requires from **community** packages (`~/.chevron/packages`, or `~/.atom/packages` only if that path is used). Core + bundled (app.asar) still allowed |
| `CHEVRON_RESTRICT_PACKAGE_REQUIRES=0` | **Disable** restrict (escape hatch) |

**Blocked for community (default on):**

1. **Privileged modules** — `fs`, `child_process`, `electron`, `net`, … (`privilegedModuleIds` in `src/preload-natives.js`)
2. **Native addon packages** — inventory names such as `superstring`, `keytar`, `@atom/fuzzy-native`, … (`nativeAddonModuleIds`)
3. **Direct `.node` bindings** — e.g. `require('./binding.node')`

**Default is on** (Electron BP P1.2 + Phase S1.0). Main process sets the env from `core.restrictCommunityPackageRequires` (default `true`) unless the env is already set.

Threat model: [security-threat-model.md](./security-threat-model.md).

## Classification edge cases (known failure modes)

`classifyCallerPath` in `src/package-require-audit.js` uses **path heuristics**. Coverage: `spec/package-require-audit-spec.js` and `script/ci/package-require-audit.test.js`.

| Situation | Classification today | Notes |
|-----------|----------------------|--------|
| Path under `app.asar/` or `resources/app/` | `bundled` | Correct for packaged app |
| Path under monorepo `…/packages/<name>/` (not user home) | `bundled` | Dev resource-path |
| Path under `~/.chevron/packages/` | `community` | Enforced restrict |
| Path under `~/.atom/packages/` | `community` | Only if that tree exists (not the default home) |
| Path `…/atom/packages/…` (legacy absolute) | `community` | Older install layouts |
| Path under `node_modules/` outside asar | `bundled` | Treats dep as core/bundled helper |
| Symlinked community package into monorepo `packages/` | may be `bundled` | **Known gap** — prefer real paths under user package homes |
| `unknown` caller (no stack path) | not restricted | Restrict only when `kind === 'community'` |
| Windows paths | supported via stack parser | Drive-letter + backslash frames |

Do not rely on restrict alone for untrusted code execution; it is a package-policy layer, not a Chromium sandbox.

## Install / rebuild

Use **cpm** (or the `apm` shim → cpm). Prefer prebuilds for natives. See [cpm-cutover.md](./cpm-cutover.md) and [cpm-prebuilds.md](./cpm-prebuilds.md).

## Owned package CI

Bundled Tier-1 packages live in `builtbygio/*` forks and are **git-pinned** from the Chevron monorepo.

- **Package-repo CI** may only check metadata (`package.json`, `repository`, `engines.chevron`). Do not install Atom or run `atom --test` there.
- **Integration gate** is Chevron CI: bootstrap, build, and smoke with the pinned SHAs.

See `GROK.md` § Owned package CI.

## End state (aspirational)

- Packages use Chevron services and main IPC only
- Guest content never has Node
- Community cannot load natives or privileged Node (S1 — default on)
- Logic-only community packages activate in the **package host**, not the editor preload; UI packages stay in-process under the v1 policy (Epic 21)
- Editor Chromium `sandbox` stays **false** under Phase S **Option C** until a later host/natives design says otherwise ([security-phase-s-decision.md](./security-phase-s-decision.md))
