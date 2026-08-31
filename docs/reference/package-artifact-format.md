# Chevron package artifact (`.chevpkg`)

**Status:** proposed (2026-08-31) — step 0 of
[build-architecture.md](../decisions/build-architecture.md)
**Related:** [cpm-design.md](./cpm-design.md),
[package-ecosystem-strategy.md](../decisions/package-ecosystem-strategy.md)

A Chevron package is one signed artifact. The same bytes are either extracted
into the app at build time or fetched from the first-party registry — which is
the point of writing this before either exists. Steps 2 and 4 of the build
architecture both produce this thing; without the contract they produce two
different things that drift.

**Community packages remain cancelled.** This format serves owned packages
only. Nothing here reopens third-party install.

## What has to be captured

Measured against the tree as it stands, not assumed.

`src/package.js` reads eighteen manifest fields:

| Field | What it drives |
|---|---|
| `name`, `version`, `main` | identity and entry point |
| `theme` | `ui` / `syntax`, changes how the package is loaded |
| `styleSheets`, `mainStyleSheet` | explicit stylesheet selection |
| `activationCommands`, `activationHooks`, `workspaceOpeners` | deferred activation |
| `providedServices`, `consumedServices` | the services graph |
| `deserializers`, `viewProviders` | state restore and view registration |
| `configSchema` | settings contributions |
| `keymaps`, `menus` | explicit ordering of those files |
| `uriHandler` | `chevron://` routing |
| `atomTranspilers` | runtime transpilation — see *Not carried* |

and six directory conventions: `grammars/`, `keymaps/`, `menus/`, `settings/`,
`styles/`, and a top-level `index` stylesheet. `snippets/` is a seventh, read
by the snippets package rather than by core — a package-level contribution, and
the manifest must not pretend core owns it.

Every one of those asset directories is already JSON across the catalog: 99
grammars, 28 keymaps, 28 menus, 30 settings, 24 snippet files, no CSON left.
90 of 92 packages declare `engines`.

Of 86 bundled packages, 8 are themes, 23 have no runtime dependencies, and 55
have at least one. The zero-dependency set is the starting point for step 2,
and half of it is simpler than that number suggests: 12 of the 23 are
grammar-only `language-*` packages with no JavaScript at all.

## Layout

```
tree-view-2.4.0.chevpkg          zip, deflate, no encryption
├── manifest.json                the schema below
├── index.js                     one esbuild bundle; deps inlined, tree-shaken
├── styles.css                   compiled; references var(--<theme-variable>)
├── assets/
│   ├── grammars/*.json
│   ├── keymaps/*.json
│   ├── menus/*.json
│   ├── settings/*.json
│   └── snippets/*.json
└── signature                    detached, over manifest.json only
```

A zip rather than a directory: the registry serves one file per version, and
one file is what gets hashed, signed, cached and resumed. The bundled case
extracts at build time, so the app on disk keeps the shape the loader already
understands.

There is no `node_modules`. Dependencies are inlined by the bundler, which is
what makes an artifact self-contained and what makes step 1 a prerequisite —
until a stylesheet compiled without knowing the active theme, a package could
not carry its own CSS.

## `manifest.json`

```jsonc
{
  "formatVersion": 1,              // this document; bump on breaking change
  "id": "tree-view",               // was package.json "name"
  "version": "2.4.0",              // semver, exact
  "engines": { "chevron": "^1.2.0" },

  "main": "index.js",              // always the bundle; null for grammar-only
  "theme": null,                   // null | "ui" | "syntax"
  "styles": "styles.css",          // null when the package ships none

  "contributes": {
    "grammars":  ["assets/grammars/tree-view.json"],
    "keymaps":   ["assets/keymaps/tree-view.json"],   // order is significant
    "menus":     ["assets/menus/tree-view.json"],     // order is significant
    "settings":  ["assets/settings/tree-view.json"],
    "snippets":  [],
    "configSchema": { }
  },

  "activation": {
    "commands": ["tree-view:toggle"],
    "hooks":    ["core:loaded-shell-environment"],
    "workspaceOpeners": ["chevron://tree-view"],
    "uriHandler": { "method": "handleURI" }
  },

  "services": {
    "provides": { "file-icons.element-icons": { "versions": { } } },
    "consumes": { }
  },

  "registers": {
    "deserializers":  { "TreeView": "deserialize" },
    "viewProviders":  true
  },

  "integrity": {
    "index.js":   "sha256-…",       // every shipped file, by path
    "styles.css": "sha256-…"
  }
}
```

`keymaps` and `menus` stay arrays because their order decides which binding
wins; a map would lose that. `integrity` lists every file except `manifest.json`
and `signature`, so the signature over the manifest transitively covers the
whole artifact — one signature check, then cheap per-file hash checks on
extract.

### Not carried

* **`atomTranspilers`** — a package that transpiles at runtime is the premise
  this whole migration removes. Bundling is the transpile step. An artifact
  declaring it is rejected at build time rather than honoured.
* **`dependencies`** — inlined. A manifest that lists them is a bundler bug.
* **`rootDirPath` / `styleSheetPaths`** — build-time cache fields from
  `generate-metadata.js`. The artifact is already resolved; nothing to cache.

## Signing

Ed25519 detached signature over the bytes of `manifest.json`. Not the zip:
archive bytes vary with compression settings and file ordering, and a format
whose signature depends on which zip implementation wrote it is a format that
will eventually fail to verify for no reason.

```
signature = Ed25519(sk, sha256(manifest.json bytes))
```

* The public key ships in the app. Rotation is an app update — acceptable
  because the catalog is first-party; it would not be acceptable for a store.
* `cpm install` verifies the signature, then verifies every file against
  `integrity` while extracting. A failure at either point removes the partial
  install and reports which file, never "signature invalid" alone.
* Bundled packages are signed by the same tooling and verified in CI, so the
  path that ships to users is the path that gets exercised on every build,
  rather than a second path that is only tested when someone installs something.
* Unsigned artifacts load only when `CHEVRON_DEV=1`, and the app records it.
  A silent unsigned-load escape hatch is how signing becomes decorative.

## Loader contract

**Most of this already exists**, which was not obvious from the sketch and is
worth stating plainly before anyone plans work around it.

`generate-metadata.js` already emits `_atomPackages` into the app's
`package.json`: one entry per bundled package — all 86 — carrying the full
`metadata`, `keymaps`, `menus` and `settings` inlined as objects,
`grammarPaths`, `main`, `rootDirPath` and `styleSheetPaths`. `Package` reads it
through `packageManager.packagesCache` and skips the directory scan entirely;
the `fs.list(grammarsDirPath, …)` branch is the fallback for packages that are
not bundled, not the normal path.

So the editor already loads bundled packages from a manifest. What
`manifest.json` adds is not the idea:

| | `_atomPackages` today | `.chevpkg` manifest |
|---|---|---|
| Scope | one blob for all 86 packages | one file per package |
| `main` | relative path into a source tree | the package's own bundle |
| Assets | paths into the app tree | paths inside the artifact |
| Integrity | none | hash per shipped file |
| Signature | none | Ed25519 over the manifest |
| Installable | no — build output only | yes, same bytes either way |

The practical consequence: the loader change in step 2 is small. Both shapes
are already accepted, because `packagesCache` *is* the second shape. What
changes is where `main` points and that the entry becomes per-package and
verifiable.

During the transition the resolution order is:

1. Directory has `manifest.json` with `formatVersion` — load as an artifact.
2. Package appears in `packagesCache` — today's bundled path, unchanged.
3. Otherwise scan directories — today's unbundled path, unchanged.

Nothing needs more than one. Step 2's work is therefore the bundle and the
container, not the contract; the contract is mostly a rename of something that
ships already.

The spec harness is the known landmine: Jasmine loads packages from their
directories, so bundled packages need either a dev mode that skips bundling or
a harness that loads artifacts. Cheap to solve, easy to discover late —
recorded here so it is discovered early.

## Delivery

| | Bundled | Registry |
|---|---|---|
| Built by | `script/build` | same tooling, same bytes |
| Verified | in CI, every build | on install by `cpm` |
| Location | extracted into the app | `~/.chevron/packages/<id>/<version>/` |
| Index | the app's `packageDependencies` | signed JSON index on a static host |

The registry is a static file host plus a signed index. No server, no database,
no review queue — that cost came from accepting third-party code, and this
catalog does not.

## Open, and deliberately so

These need a decision before implementation, not before this document lands:

1. **Key custody.** Where the signing key lives and who can use it. A key in
   CI secrets signs whatever CI is told to sign; a key held offline means
   releases block on a human. First-party-only makes the weaker option
   defensible, but it should be chosen rather than defaulted into.
2. **Version pinning across the catalog.** Whether bundled packages pin exact
   versions in the app manifest or float within a range. Exact is what makes a
   build reproducible; floating is what makes a security patch one-line.
3. **Downgrade and rollback.** Whether `cpm` may install an older version over
   a newer one, and whether the app tolerates a version below its `engines`
   floor rather than refusing to load.
