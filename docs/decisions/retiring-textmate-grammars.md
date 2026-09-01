# Dropping `season`, and what TextMate has to do with it

**Status:** plan (2026-09-01)
**Related:** [build-architecture.md](./build-architecture.md)

## The premise this started from, and why it does not hold

The goal was to drop `season` → `cson-parser` → `coffee-script`, the last
CoffeeScript in the product. The assumed blocker was TextMate: `first-mate`
requires `season` to read grammars, and eleven packages ship TextMate grammars
with no tree-sitter equivalent, so the path looked like "write eleven
tree-sitter grammars, then drop first-mate, and season falls out with it."

Measuring it says otherwise.

**`season` has sixteen consumers, and first-mate is one of them.**

| Consumer | Sites | What it reads |
|---|---|---|
| `src/` core | 12 files | menus, keymaps, grammars, settings, config, package metadata |
| `packages/snippets` | 1 | user and bundled snippets |
| `packages/settings-view` | 1 (dep) | — |
| `script/lib/generate-metadata.js` | 4 | build-time keymaps, menus, settings |
| `first-mate` | 3 | grammar files |

Writing eleven tree-sitter grammars would remove **three of those sites**. The
other thirteen would be untouched, `season` would still ship, and the
CoffeeScript would still be there.

So the tree-sitter work does not achieve the thing it was proposed for. It has
to be judged on its own merits instead, and the `season` removal is a separate,
much smaller job.

## What actually removes `season`

Two facts make this straightforward.

**Nothing in the repository is CSON any more.** All 100 grammar files across
all packages are `.json`, and `find packages -name '*.cson'` returns zero
results. `season` is not parsing CSON for anyone — it is being used as "resolve
`foo.cson` or `foo.json`, then parse whichever exists", and only the second
branch is ever taken.

**The replacement is already written.** `src/keymap/read-keymap-file.ts` was
written during the atom-keymap vendoring to do exactly this: `JSON.parse` plus
duplicate-key detection, covering the `allowDuplicateKeys: false` option that
is the one part of `season`'s behaviour `JSON.parse` does not give for free.

**And both packages are already ours.** `package.json` pins
`first-mate: npm:@builtbygio/first-mate@7.4.3` and
`season: npm:@builtbygio/season@6.0.2`. Patching first-mate off `season` is
editing our own fork, not carrying a patch against upstream.

### Sequence

1. Generalise `src/keymap/read-keymap-file.ts` into a shared reader exposing
   the four members callers actually use: `readFileSync`, `readFile`,
   `resolve`, `isObjectPath`. Everything else in `season`'s surface is unused
   here.
2. Replace the 12 `src/` sites and the 4 in `script/lib/generate-metadata.js`.
3. Replace the `snippets` and `settings-view` sites and drop their deps.
4. Patch `@builtbygio/first-mate`'s three sites.
5. Drop `season` from `package.json`; `cson-parser` and `coffee-script` fall
   out with it.

### The one behavioural change

`CSON.resolve()` currently means a user's `~/.chevron/snippets.cson` would
still be read. After this, it would not be. That is the same decision already
taken for user config, where CSON reading was removed and `strandedCsonFiles()`
was added to report files left unread — so the work should extend that
reporting to snippets rather than failing silently.

## The tree-sitter question, on its own merits

Separate decision, no longer load-bearing for `season`.

Of 33 packages shipping grammars: 21 have both engines and would fall back to
tree-sitter cleanly, 1 is tree-sitter only, and 11 are TextMate only. Those 11
are not one problem:

**Real grammars, would need a parser (7)** — `language-gfm` (`source.gfm`; the
one that matters, and the hardest, since tree-sitter markdown splits into block
and inline parsers), `language-coffee-script`, `language-git` (3 small
grammars), `language-make`, `language-mustache`, `language-objective-c`,
`language-property-list` (plist is XML; likely an injection over an XML grammar
rather than its own parser).

**Not grammars — injections (3)** — `language-hyperlink` (3 patterns, URLs
inside any text), `language-todo` (2 patterns, TODO/FIXME inside comments),
`language-ruby-on-rails` (an overlay on `text.html.ruby`). These match inside
other languages and never parse a file of their own. Core already supports
tree-sitter injections via `GrammarRegistry::addInjectionPoint` and
`injectionRegex`, so they need porting to that mechanism, not a parser.

**Trivial (1)** — `language-text`, `text.plain`, 4 patterns.

None of the seven has a tree-sitter grammar in the tree today; 22 others do, so
adopting an existing upstream grammar is a pin and a test, while writing one is
a project. Which of the seven have usable upstream grammars is the first thing
to establish, and it should be established before committing to any of this.

**Recommendation: do not start this now.** It is a language-support project
that costs eleven languages' highlighting if it is done wrong, and it no longer
buys the dependency removal that motivated it. Keep first-mate. If tree-sitter
coverage is worth extending later, extend it because tree-sitter is the better
engine, not to delete 0.38 MB of CoffeeScript that step 1 above deletes anyway.
