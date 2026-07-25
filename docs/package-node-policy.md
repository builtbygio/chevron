# Package Node policy (Chevron)

**Status:** Phase N3 product policy  
**Audience:** package authors and Chevron maintainers  
**Related:** [security-phase-n.md](./security-phase-n.md), [security-phase-n3.md](./security-phase-n3.md)

## Dual-support forever (API names)

Chevron keeps **Atom package compatibility** for stable surfaces:

- `global.atom` / `require('atom')`
- `engines.atom` (and optional `engines.chevron`)
- URI scheme `atom://` (+ `chevron://` alias)
- Config home dual-resolution (`ATOM_HOME` / `CHEVRON_HOME` / `~/.atom` / `~/.chevron`)

That is **not** a promise that packages get unrestricted Node forever.

## Privilege tiers

| Tier | Who | Node in package code |
|------|-----|----------------------|
| **T0 Core** | Editor preload + `src/` | Allowed; new privileged ops should use main IPC |
| **T1 Bundled** | Ship-in packages (github, tree-view, …) | Prefer `atom.*` / applicationDelegate IPC; no new `electron.remote` |
| **T2 Community** | User-installed packages | **No guaranteed Node** long-term; use published `atom.*` APIs only |

Today (0.4.x): T1/T2 still share the **preload Node world** for compatibility. Phase N is shrinking raw `fs` / `child_process` / `electron` use in bundled packages and documenting the end state.

## Do / don’t

**Do**

- Use `atom.workspace`, `atom.project`, `atom.packages`, `atom.notifications`, `BufferedProcess` / `Task`
- Open external URLs via `atom.applicationDelegate.openExternal` (scheme allowlist in main)
- File manager / trash via `showItemInFolder` / `moveItemToTrash` on applicationDelegate
- Declare `engines.atom` (and optionally `engines.chevron`)

**Don’t**

- `require('electron').remote` / `@electron/remote` (removed; temporary compat only for some bundled code)
- `shell.openExternal` with arbitrary schemes
- Assume `require('fs')` / `child_process` / `net` will keep working in future releases
- Use the Atom preload as a webview preload or enable Node for guest content

## Auditing / restricting privileged requires (developers)

```bash
# Log only (inventory)
CHEVRON_AUDIT_PACKAGE_REQUIRES=1 ./out/Chevron-linux-x64/chevron --no-sandbox

# Opt-in enforcement for community packages only (N3.2)
CHEVRON_RESTRICT_PACKAGE_REQUIRES=1 ./out/Chevron-linux-x64/chevron --no-sandbox
```

| Env | Effect |
|-----|--------|
| `CHEVRON_AUDIT_PACKAGE_REQUIRES=1` | Log **one warning per caller path + module** for privileged requires |
| `CHEVRON_RESTRICT_PACKAGE_REQUIRES=1` | **Throw** on privileged require from **community** packages (`~/.atom/packages`, `~/.chevron/packages`). Core + bundled (app.asar) still allowed |

Privileged module set: see `src/preload-natives.js` (`fs`, `child_process`, `electron`, `net`, …).

**Default is off** — community packages keep working until authors migrate. Restrict is for dogfooding and CI experiments, not the default product path.

## Install / rebuild

Use **cpm** (or the `apm` shim → cpm). Prefer prebuilds for natives. See [cpm-cutover.md](./cpm-cutover.md) and [cpm-prebuilds.md](./cpm-prebuilds.md).

## Owned package CI (Option B)

Bundled Tier-1 packages live in `builtbygio/*` forks and are **git-pinned** from the Chevron monorepo.

- **Package-repo CI** may only check metadata (`package.json`, `repository`, `engines.chevron`). Do not install Atom or run `atom --test` there (Atom download channels are dead; patches target Chevron IPC).
- **Integration gate** is Chevron CI: bootstrap, build, and smoke with the pinned SHAs. Bump the pin in Chevron to validate package changes.

See `GROK.md` § Owned package CI.

## End state (aspirational)

- Packages use Atom services and main IPC only
- Guest content never has Node
- Editor may enable `sandbox: true` only after natives move out of unsandboxed preload (Phase S)
