# Package ecosystem strategy

**Status:** locked product decision (2026-08); **superseded 2026-08-28 — see "Community packages: never" below**  
**Related:** [package-ownership-inventory.md](../reference/package-ownership-inventory.md), [REBRANDING.md](./REBRANDING.md), [security-phase-s-package-host.md](../reference/security-phase-s-package-host.md), [cpm-design.md](../reference/cpm-design.md)

## Community packages: never (2026-08-28)

The "Later" horizon is **cancelled by owner decision**. Chevron ships an owned catalog and nothing
else. There is no future in which third-party packages are installed into the product.

**Why this is recorded rather than assumed:** the original decision deferred community packages
rather than refusing them, and a deferral quietly becomes a commitment. Several things exist only to
serve that deferred future, and they are now dead weight rather than groundwork.

**What this unlocks** — none of it done yet, all of it now legitimate:

| Now removable | Reason it existed |
|---|---|
| ~~The 65 npm-published owned packages~~ **— done 2026-08-28** | A distribution model for users installing packages individually. Measured cost: **29 of 83 pins had drifted** from what they ship. All 94 editor packages are now `workspace:` in `packages/`; the 18 owned libs/natives stay npm pins. The drift class is retired |
| Author-facing devtools — `dalek`, `deprecation-cop`, `incompatible-packages`, `timecop`, `package-generator`, `update-package-dependencies`, `styleguide`, `dev-live-reload` | Tools for *community package authors*. There is no community |
| Package host v2 spine (`core.packageHostV2`, default off) | Sandboxing for untrusted third-party packages |
| cpm's registry client (Pulsar search / install-by-name) | Installing packages the product does not ship |

**What this does not change:** `cpm` still installs and rebuilds the owned catalog, and the T2
privileged-`require` restrictions stay — they are defence in depth for the code we do ship, not only
for code we do not.

## Decision

| Horizon | Package source | Access model |
|---------|----------------|--------------|
| **Now** | **Closed core — owned catalog only** | Ship and maintain packages under `builtbygio/*` + monorepo `packages/*` / `packageDependencies`. No product commitment to open community install from Pulsar (or any public registry). |
| ~~**Later**~~ | ~~Sandboxed community packages~~ | **Cancelled (2026-08-28).** See below. |

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
