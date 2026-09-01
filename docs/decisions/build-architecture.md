# Build architecture: leaving the Atom-era pipeline

**Status:** proposed (2026-08-29) — direction agreed, no step scheduled
**Related:** [package-ecosystem-strategy.md](./package-ecosystem-strategy.md),
[../reference/build-modernization.md](../reference/build-modernization.md),
[../reference/startup-snapshot-plan.md](../reference/startup-snapshot-plan.md),
[../reference/cpm-design.md](../reference/cpm-design.md),
[../reference/package-artifact-format.md](../reference/package-artifact-format.md),
[bundled-dependency-sharing.md](./bundled-dependency-sharing.md)

## The decision

Chevron moves to a **compiled build**: core and every catalog package are bundled ahead of
time, styling moves to CSS custom properties, and a package becomes a single signed artifact
that is either shipped inside the app or downloaded from a first-party registry.

This supersedes the "private registry immediately — ops + review load" rejection in
[package-ecosystem-strategy.md](./package-ecosystem-strategy.md). That cost was a consequence
of accepting third-party code. A first-party registry serving only owned packages carries no
review or moderation load, so the objection does not apply to it.

**Community packages remain cancelled.** Nothing here reopens them.

## Why

Atom's premise was that the editor reads its own source at runtime, which is what made it
live-hackable. Hackability was the product. Every expensive piece of the current build follows
from that one premise:

| No build step means | So the tree carries |
|---|---|
| Resolution across 749 `node_modules` dirs is slow at boot | `src/module-cache.js` + `generate-module-cache.js` |
| Boot executes thousands of loose files | `generate-startup-snapshot.js`, `snapshot-exclude.js`, `run-mksnapshot.js` (~660 lines) |
| Packages ship `.ts` (17 of them) | `src/compile-cache.js` + `src/typescript.js`, transpiling on the user's machine |
| `"use babel"` pragmas survive | ~~`precompile-babel-prefix-files.js` (302 lines)~~ — **deleted 2026-09-01**; it had no caller, and babel-core@5 was already gone from app dependencies, so its fallback could not have run |
| Stylesheets need the active theme's variables | `prebuild-less-cache.js`, warmed across every theme pair |

Chevron abandoned the premise when it closed the catalog. It still pays for it — five caches
and roughly 5,700 lines under `script/lib`.

The cost is not only maintenance. The startup snapshot, the most intricate piece, **shipped
disabled in 1.1.0** and nobody noticed: the build catches the failure, prints one `NOTE:`, and
exits 0. See [#240](https://github.com/builtbygio/chevron/pull/240).

## The constraint that orders the work

`prebuild-less-cache.js` compiles every stylesheet once per UI-theme × syntax-theme pair —
16 passes over 323 `.less` files — because, in its own words, *"themes assign variables which
may be used in any style sheet."* Any combination not precompiled falls back to compiling LESS
**at runtime, inside the editor**.

This is what makes a downloadable theme impossible today: a theme that was not in the build
matrix can only ever be compiled on the user's machine.

CSS custom properties resolve this exactly, and did not exist when Atom was designed. Compile
each stylesheet once against `var(--chevron-*)`; a theme stops being a compile input and
becomes one CSS file setting values on `:root`. Theme switching becomes a stylesheet swap. A
downloadable theme becomes an inert CSS file.

The catalog currently has **one** file using a custom property.

## The artifact

One format, two delivery paths — so the bundled and installed cases cannot drift:

```
tree-view-2.4.0.chevpkg
  manifest.json   id, version, engines, activation events, contributions
  index.js        one esbuild bundle, dependencies inlined and tree-shaken
  styles.css      compiled from LESS, references var(--chevron-*)
  assets/         grammars as JSON, keymaps, menus, icons
  signature       detached, verified on install
```

* **Bundled** — extracted into the app at build time. First-paint packages, default themes.
* **Registry** — the same bytes on a static host behind a signed index. `cpm install` fetches,
  verifies, unpacks.

The registry is then a static file host and a signed JSON index. No server, no database, no
review queue.

## Sequence

Order is forced by dependency, not preference. Each step ships alone and leaves the tree working.

0. **Write the artifact spec.** Manifest schema, layout, signing, loader contract. Steps 2 and
   4 both produce this thing; without the contract they produce two different things.
   *Written:* [package-artifact-format.md](../reference/package-artifact-format.md).
1. **Theming → CSS custom properties.** Mechanical across 323 files, but needs visual
   verification, not a green build. *Deletes:* `prebuild-less-cache.js`, the 16× matrix,
   runtime `less-cache`, the snapshot's `lessSourcesByRelativeFilePath` payload.
   **Must precede step 2:** until a stylesheet compiles without knowing the active theme, a
   package artifact cannot be self-contained.
2. **Bundle the catalog** — **done 2026-09-01: 50 of 50, nothing blocked.** The
   loader half turned out to be already built (`_atomPackages`); the work was the
   bundle and the container. Four packages were held up not by dependencies but by
   deriving their own root from `__dirname`, which moves once the code is bundled at
   the package root; `lsp-ui` needed `chevron.lsp` to exist. *Originally:* starting
   with the 23 packages that have no runtime dependencies,
   then the 55 that do. The loader accepts both shapes during the transition. (Counted
   2026-08-31 against `packageDependencies`: 86 bundled packages, of which 8 are themes.
   The zero-dependency set is easier than 23 suggests — 12 of them are grammar-only
   `language-*` packages with no JavaScript at all. Re-measured against the built app
   2026-09-01, which corrects the native count below: 10 bundled, 32 ready, 7 blocked by a
   native module, 1 by an esbuild parse failure, 1 by an API question. See
   [bundled-dependency-sharing.md](./bundled-dependency-sharing.md). The loader half of this step is
   smaller than "the loader accepts both shapes" implies: `generate-metadata.js` already
   emits `_atomPackages`, a manifest for all 86 bundled packages that `Package` reads
   instead of scanning directories. The work is the bundle and the container, not the
   contract.) *Deletes:*
   `transpile-typescript-paths`, `transpile-peg-js-paths`, `src/typescript.js`.
   (`precompile-babel-prefix-files` is already gone — it turned out to have no caller at all.
   `transpile-typescript-paths` cannot follow yet: 109 `.ts` files sit in bundled packages,
   which esbuild could compile directly, plus 14 in `src/` and 4 in `markdown-preview`.)
3. **Bundle core, then re-measure startup.** Measured 2026-09-01 for the 47 already-bundled
   packages: no clear startup win, and the instrumented phases run slightly slower bundled —
   see [startup-measurement-2026-09.md](../reference/startup-measurement-2026-09.md). Bundling
   core should not be expected to pay for itself in startup time. *Deletes, if measurement
   agrees:* `module-cache`,
   `compile-cache`, `native-compile-cache`, and the whole snapshot chain.
4. **Stand up the registry.** Cheapest step, and only cheap once 1–3 have made the artifact real.

## What ships that should not

Measured 2026-09-01: **8% of the asar (34.9 MB of 461.5 MB) is packages nothing declares
a dependency on**, led by a 12.9 MB copy of `pyright` — a language server the editor tells
users to install separately. See
[shipped-dependency-audit-2026-09.md](../reference/shipped-dependency-audit-2026-09.md)
for why this is not a one-line fix: packaging manipulates the module tree without a model
of what the app requires, and it fails in both directions.

## Explicitly not in scope

| Not doing | Why |
|---|---|
| Forcing ESM | Electron 43 supports it and esbuild emits it, but coupling a module-system migration to a bundling migration doubles the debugging surface for no user-visible gain |
| Reworking the native-module pipeline | It solves a real problem bundling does not remove. Prebuilt binaries per platform/ABI fetched by checksum would be an improvement, but it is a separate track |
| Treating bundling as a security fix | Tree-shaking shrinks the reachable surface and makes the 154 open alerts auditable. It does not patch a vulnerability in code that actually executes |
| Deleting the snapshot on faith | It must be measured against a bundle first. See below |

## Landmines

**The snapshot is not a free deletion.** It is currently gated off on every platform
(`shouldSkipCustomSnapshot`): darwin for a boot crash, arm64 because `mksnapshot` is x64-only,
linux for an unexplained spell-check activation flake. Only win32 generates one, and only when
forced. Before removing the chain in step 3, measure a bundled boot against a *forced,
working* snapshot — `CHEVRON_FORCE_MKSNAPSHOT=1`.

**The spec harness reads source.** Jasmine loads packages from their directories. Bundled
packages need either a dev mode that skips bundling or a harness that loads artifacts. Cheap
to solve, easy to discover late.

**`script/ci/snapshot-startup-packages.test.js`** guards the invariant that broke in 1.1.0: no
`SNAPSHOT_STARTUP_PACKAGES` entry may be snapshot-excluded. Keep it until the snapshot chain
is actually gone.

## What #239 removed, and whether it comes back

[#239](https://github.com/builtbygio/chevron/pull/239) removed cpm's registry client and
settings-view's install UI under "community packages is never happening". Most of it stays
removed: `registry.js` talked to a public registry, and `search` / `view` / `featured` /
`outdated` are discovery over an open catalog nobody curates. A fixed first-party catalog
needs a list, not a search engine.

`install.js` (347 lines) is the only piece with reusable shape, and it assumed npm tarball
semantics. Recoverable at `1506693a2^`; expect to rewrite against the artifact format instead.
