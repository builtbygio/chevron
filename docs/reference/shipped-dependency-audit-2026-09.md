# What the packaged app actually ships, September 2026

**Status:** measurement (2026-09-01)
**Related:** [build-architecture.md](../decisions/build-architecture.md),
[nested-package-modules.md](../decisions/nested-package-modules.md)

## The numbers

Measured against the built `out/app` tree and the shipped `app.asar`:

| | |
|---|---|
| asar contents | **461.5 MB** |
| packages in `node_modules` | **756** |
| packages nothing declares a dependency on | **248** |
| their share of the asar | **34.9 MB — 8%** |

Largest, inside the shipped asar:

```
pyright                     12.9 MB     5459 files
rxjs                         4.4 MB
es-abstract                  2.7 MB
eslint                       2.4 MB      382 files
typescript-language-server   2.1 MB
regexpp, acorn, ajv,
eslint-plugin-react, esquery ~3.4 MB combined
```

`mocha` and `chai` also ship; they are declared, so they are not in the
undeclared figure, but they are test tooling in a shipped editor.

## What happened since (2026-09-01, later the same day)

| | when audited | now |
|---|---|---|
| undeclared content in the asar | 34.9 MB (8%) | **6.0 MB (1%)** |
| asar on disk | 384 MB | **373 MB** |

Three changes, in order:

1. **Language servers removed.** `pyright` and `typescript-language-server`
   contradicted a written policy -- the distribution doc says Chevron does not
   ship language-server binaries -- and no code path could reach them anyway.
2. **Nested versions preserved.** This audit called packaging's handling of the
   module tree "both directions of the same problem"; the flattening half is
   fixed, and the 126 unsatisfied ranges are down to one that is not shipped.
   That cost 24 MB.
3. **Lint and test tooling removed.** Fifteen packages, 19 MB, named
   individually and checked against a require trace rather than derived from
   the declared graph -- for the reason this document gives below.

The remaining 6 MB is 217 small packages. The reasoning below still applies to
them: a static require scan cannot see a module loaded through a computed name,
and none of them is large enough to be worth that risk.

## Why it happens

Two things compound.

**The root `package.json` has 152 dependencies and no `devDependencies`.** Test
and lint tooling is therefore indistinguishable from runtime code by
declaration alone. `mocha` and `chai` are dependencies.

**`copy-assets.js` copies every top-level `node_modules/*` into the app.** It
dereferences symlinks and copies each entry; there is no notion of "what does
the app actually need". `include-path-in-packaged-app.js` then removes paths by
denylist -- specific vendor directories, `nan`, `native-mate`, `loophole`,
`pegjs` and so on. A denylist shrinks what was copied; it does not decide what
should have been.

So the app ships the hoisted dependency tree of the repository, minus whatever
anyone has thought to exclude, rather than the closure of what it requires.

`pyright` is the clearest case: `src/lsp/builtin-servers.js` finds language
servers with `which()` on PATH, and the editor's own notification tells users
to install them with cpm. The 12.9 MB copy in the asar is not the one that gets
used.

## Why this is not a one-line fix

The obvious change -- ship the declared dependency closure instead -- would be
wrong today, and the reason is already documented in this repository.

Packages require things they do not declare. Every one of the bundled packages
with "no runtime dependencies" requires `event-kit`; it resolves from the
hoisted tree, which is exactly why it is easy to miss. See
[bundled-dependency-sharing.md](../decisions/bundled-dependency-sharing.md).
An allowlist built from `package.json` graphs would drop modules that are
genuinely required and the failure would be a runtime `MODULE_NOT_FOUND` in
whichever code path reached them first -- possibly not at startup, possibly not
in CI.

The same tree also demonstrates the opposite failure. `entities` was nested
correctly by pnpm and flattened away during packaging, and markdown preview
broke in shipped builds while working in dev, until
[#273](https://github.com/builtbygio/chevron/pull/273). 91 top-level packages
lose nested dependencies that way and 129 of those get a hoisted replacement
that does not satisfy the declared range.

Both directions of that problem have the same root: packaging manipulates the
module tree without a model of what the app requires.

## What would settle it

A require-graph trace rather than a declaration walk: run the app, record every
module actually loaded, and compare that against what ships. Bundling has
already narrowed the question -- 49 of 50 catalog packages now resolve their
dependencies at build time, so the runtime graph is much smaller than it was.

Until then, the specific cases are worth taking individually. `pyright` and
`typescript-language-server` are the largest, are not required by anything, and
duplicate something the product asks users to install separately.

## Method

`out/app/package.json` `dependencies` + `packageDependencies` as roots, closed
transitively over each shipped package's own `dependencies` and
`optionalDependencies`; anything unreached is "declared by nothing". Sizes are
real file sizes inside `app.asar`, read from its header, not directory sizes
before packaging -- packaging drops roughly half the tree, so the pre-package
figure would have overstated this by a wide margin.
