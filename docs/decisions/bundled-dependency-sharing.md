# Which dependencies a bundle may inline

**Status:** proposed (2026-09-01) — blocks the next slice of step 2
**Related:** [build-architecture.md](./build-architecture.md),
[../reference/package-artifact-format.md](../reference/package-artifact-format.md)

## The decision

A bundled package inlines its dependencies, **except** a small runtime-provided
set that the app ships once and every artifact marks external.

Membership in that set is decided by **correctness, not size**. A module
belongs in it when instances or state cross a package boundary. Everything else
is inlined, even when several packages use it.

## Why correctness and not size

Size says share. Measured across the 32 packages that bundle cleanly today:

| | bundles | shipped once | total |
|---|---|---|---|
| A — inline everything | 9.26 MB | — | **9.26 MB** |
| B — shared set external | 3.67 MB | 2.00 MB | **5.67 MB** |

3.6 MB, in favour of sharing. That is a real number and a weak argument: 3.6 MB
is not worth an ABI the app has to honour forever.

The argument that decides it is `grim`.

`grim` is a global deprecation registry. `src/atom-environment.js`, `src/pane.js`,
`autocomplete-plus` and `status-bar` all *write* deprecations into it.
`deprecation-cop` *reads* it — `grim.getDeprecations()`, and `grim.on('updated')`
to refresh.

Inline a copy per package and each writes to a different registry.
`deprecation-cop` reads its own, finds nothing, and shows an empty list. The
package still loads, still opens, still renders. Nothing fails; it just stops
telling the truth, and the only way to notice is to know what should have been
in the list.

`event-kit` is the same shape and already external for it: core hands back
`Disposable`s and checks them, so a package holding a different `Disposable`
class fails `instanceof` against core's.

Both are invisible in a green build. That is what makes this a design rule
rather than a build flag.

## The set

**Runtime-provided (external in every bundle):**

| Module | Why |
|---|---|
| `event-kit` | `Disposable` / `Emitter` instances cross every service boundary |
| `grim` | one global deprecation registry, written by core and read by a package |

**Inlined**, on the evidence that nothing crosses: `underscore-plus`, `fs-plus`,
`atom-select-list`, `etch`, `dompurify`, `marked`, `async`, `semver`,
`minimatch`, `humanize-plus`, `fuzzaldrin`, `fuzzaldrin-plus`. Scanned for
module-level containers; the only two hits were an internal defaults object in
`marked` and a cache in `minimatch`, neither of which is shared state.

**`temp` — undecided, and deliberately not defaulted.** It keeps module-level
`tracking`, `filesToDelete` and `dirsToDelete`, and registers a process exit
listener the first time it is used. Ten packages depend on it. Duplicated
copies each track their own files and each add their own exit handler, which is
not obviously wrong — every copy cleans up after itself — but this repository
has just spent a PR on 1719 leaked temp directories, so "probably fine" is not
the standard. It needs someone to read what the exit handlers actually do under
duplication before it is inlined.

## The counts, corrected

Two earlier figures in [build-architecture.md](./build-architecture.md) were
wrong, both because they were measured against the source tree rather than the
built app.

**Native dependencies are transitive.** Checking each package's direct
`dependencies` said 27 packages were blocked. Bundling them says **7**:

    bracket-matcher -> oniguruma      github      -> keytar
    fuzzy-finder    -> @atom/…        spell-check -> spellchecker
    symbols-view    -> ctags          tree-view   -> pathwatcher
    lsp-ui          -> fs-admin

`bracket-matcher` reaches `oniguruma` through a dependency, not directly, so a
direct-dependency scan cannot see it. `lsp-ui` turns out to be blocked twice
over — it also reaches into `src/`.

**The tree-sitter language packages are not a bundling problem at all.** 22
`language-*` packages depend on native tree-sitter grammars, and I counted them
as blocked. They have no `main`: the grammars are loaded by core's grammar
registry, not required by package JavaScript. There is nothing to bundle, so
nothing is blocked.

**`markdown-preview`** fails for its own reason — esbuild cannot parse
`htmlparser2/dist/commonjs/Parser.js`. Unread, and not a native-module problem.

So the frontier is: **10 bundled**, **32 ready**, **7 behind the native track**,
**1 behind an esbuild parse failure**, **1 behind an API question** (`lsp-ui`),
and the rest grammar-only or themes.

## What this costs

An ABI. The app must ship `event-kit` and `grim` at versions every artifact can
use, and changing either becomes a compatibility event rather than a bump. That
is acceptable for two modules chosen because sharing them is the only correct
option; it would not be acceptable for fourteen chosen to save 3.6 MB.

Worth noting the tree already pays part of this without deciding to:
`node_modules/atom-keymap/node_modules/grim` is a second copy of grim today.
