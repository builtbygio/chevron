# Package ecosystem strategy

**Status:** locked product decision (2026-08)  
**Related:** [package-ownership-inventory.md](../reference/package-ownership-inventory.md), [REBRANDING.md](./REBRANDING.md), [security-phase-s-package-host.md](../reference/security-phase-s-package-host.md), [cpm-design.md](../reference/cpm-design.md)

## Decision

| Horizon | Package source | Access model |
|---------|----------------|--------------|
| **Now** | **Closed core — owned catalog only** | Ship and maintain packages under `builtbygio/*` + monorepo `packages/*` / `packageDependencies`. No product commitment to open community install from Pulsar (or any public registry). |
| **Later** | **Sandboxed community packages** | After base Chevron is stable enough, implement **package host v2** (utility process / restricted Node) so third-party packages can run without full editor privilege. |

This pairs with **Chevron-only** API policy (no dual-support product goal). Community Atom-era packages are **not** a supported extension path until host v2 exists.

## Near term: owned catalog only

### In scope

- Bundled packages listed in root `package.json` `packageDependencies` / owned git pins  
- In-repo `file:packages/*` (welcome, themes, natives, …)  
- Forks under `builtbygio/<name>` modernized with [owned-package-modernization-checklist.md](../orientation/owned-package-modernization-checklist.md)  
- `engines.chevron`, `require('chevron')`, `global.chevron` for new work  

### Out of scope (product)

- Guaranteeing Pulsar / Atom registry packages install and run  
- Dual-support of `engines.atom` / `require('atom')` as a first-class authoring path  
- Treating unowned `atom/*` language packs as a product path — they are owned `builtbygio` pins (#79)

### Engineering notes

- **cpm** and registry client code may remain in the tree for future host v2 / curated registry work; product UX and docs should not promise open community install.  
- Privileged-require restrict for community paths remains useful if a user forces a package into `~/.chevron/packages` (defense in depth), but that is not a supported product path.  
- Expanding the catalog = **fork → own → pin**, not “search Pulsar and install.”
- Registry name for owned packages: **`@builtbygio/<id>`** on npmjs.com. Editor id remains unscoped `<id>` (see [owned-package-modernization-checklist.md](../orientation/owned-package-modernization-checklist.md) §D0). Git pins stay until each fork is published.

## Later: sandboxed community packages

When the owner is happy with **base Chevron** (core APIs, owned catalog, security defaults), resume **package host v2** from [security-phase-s-package-host.md](../reference/security-phase-s-package-host.md):

1. Activate community packages outside the full editor privilege model (utilityProcess / host process).  
2. Stub or proxy a **Chevron** package API surface (not Atom dual-support).  
3. Keep T0/T1 (core + bundled) in-process as today.  
4. Optional curated registry or allowlist on top of (or instead of) raw Pulsar.

Until that ships, treat “community packages” as a **post–base-Chevron** track, not a current milestone.

## Alternatives considered (and not chosen for now)

| Option | Why not now |
|--------|-------------|
| Full Pulsar reopen with hard gates | Stabilization cost while API/names are still moving |
| Private registry immediately | Ops + review load before core is “done enough” |
| Git/path install as product feature | Fine for developers; not the supported end-user catalog story |
| Closed forever | Rejected as permanent; sandboxed community is the planned reopen path |

## Summary for authors and contributors

- **Today:** extend Chevron by contributing to **owned** packages or proposing new **builtbygio** forks for the core catalog.  
- **Not today:** “publish to Pulsar and users install in Chevron.”  
- **Later:** sandboxed community packages after base product sign-off.
