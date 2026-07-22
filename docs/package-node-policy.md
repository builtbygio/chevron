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

## Auditing privileged requires (developers)

```bash
CHEVRON_AUDIT_PACKAGE_REQUIRES=1 ./script/with-modern-env out/Chevron.app/Contents/MacOS/Chevron
# or Linux packaged binary / --dev resource-path
```

When enabled, the preload logs **one warning per package+module** when package code requires a privileged module (`fs`, `child_process`, `electron`, …). This does **not** block loads; it is inventory tooling for Phase N.

## Install / rebuild

Use **cpm** (or the `apm` shim → cpm). Prefer prebuilds for natives. See [cpm-cutover.md](./cpm-cutover.md) and [cpm-prebuilds.md](./cpm-prebuilds.md).

## End state (aspirational)

- Packages use Atom services and main IPC only
- Guest content never has Node
- Editor may enable `sandbox: true` only after natives move out of unsandboxed preload (Phase S)
