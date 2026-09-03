# TextMate retirement — what it would actually take

**Status: open.** Scoping only; no code has moved. This exists because
"make the editor tree-sitter-first" keeps coming up as an idea, and the
answer is not one PR — it is one cheap PR, four real ones, and an owner
decision that has already been made once.

Context that is not re-litigated here:
[chevron-architecture-modernization.md](../reference/chevron-architecture-modernization.md)
(G4, H2, H3) and [language-stack.md](../reference/language-stack.md), which
holds the exception list. H3 already says first-mate is removable **only if
that list is empty**. This document measures the list and prices emptying it.

---

## What is true today

| | Count |
|---|---|
| tree-sitter grammar files shipped | **30** |
| TextMate grammar files shipped | **69**, across 32 packages |
| …**shadowed**: a tree-sitter grammar already owns that `scopeName` | **27** |
| …**unique**: TextMate is the only grammar for that scope | **42** |
| …of the unique, injection-only (`injectionSelector`) | **2** — `hyperlink`, `todo` |
| packages carrying a tree-sitter parser dependency | 23, versions 0.23–0.25 |

`core.useTreeSitterParsers` defaults to **true** (`src/config-schema.js`), and
`GrammarRegistry#languageModeForGrammarAndBuffer` picks `TreeSitterLanguageMode`
whenever the selected grammar is tree-sitter. first-mate and oniguruma are
already lazy (H2 PR 14, `src/load-first-mate.ts`): a session that never opens a
TextMate file never loads the NAN addon.

So "tree-sitter-first" is **done**. What is left is TextMate *coverage*, and
that splits into two very different problems.

### Marker layers are not part of this

A related idea — replacing text-buffer's marker layers with a tree-sitter
pipeline — does not survive contact with the code. Marker layers track
arbitrary ranges through edits: selections, decorations, folds, diagnostics,
snippet tab stops. Tree-sitter produces a syntax tree, not user ranges. The
tree-sitter language mode is itself *built on* marker layers —
`src/tree-sitter-language-mode.js` opens `buffer.addMarkerLayer()` for
injections in its constructor. Removing them means writing them again.

---

## The two problems

**1. The 27 shadowed fallbacks** are only reachable with
`core.useTreeSitterParsers: false`. Deleting them needs one owner decision (is
that escape hatch supported?), not new grammars.

**They are not free to delete.** Ten of the 27 claim file types the tree-sitter
grammar does not:

| Scope | Lost without a merge |
|---|---|
| `source.js` | `cjs`, `es`, `es6`, `_js`, `gs`, `htc`, `jscad`, `jscript` |
| `source.shell` | `PKGBUILD`, `bashrc`, `bash_profile`, `bats`, … |
| `source.ruby` | `Fastfile`, `Capfile`, `Guardfile`, `Berksfile`, … |
| `source.python` | `Snakefile`, `kv`, `rpy`, `tac`, `wscript`, … |
| `text.html.basic` | `htm`, `xhtml`, `shtml`, `tpl`, `tmpl`, `kit` |
| `source.c`, `source.clojure`, `source.css`, `source.java`, `text.html.erb` | `xpm`, `org`, `css.erb`, `bsh`, `rhtml` |

Opening `foo.cjs` or `PKGBUILD` would fall back to plain text. The file types
have to move onto the tree-sitter grammars first.

**2. The 42 unique scopes** are the exception list. Every row already has a
written owner decision of **keep TextMate**. Shrinking it means porting
grammars — and each port is hand-authored: Chevron uses Atom-style tree-sitter
grammars (`type: "tree-sitter"`, `parser: "<npm package>"`, a `scopes` map of
node queries, `folds`, `comments`), not upstream `.scm` query files. A port is
a day of scope-mapping per language, not an npm install.

Parser availability for the interesting rows:

| Package | Parser | Note |
|---|---|---|
| `language-property-list` | `@tree-sitter-grammars/tree-sitter-xml@0.7.0` | **already installed** for `language-xml` |
| `language-gfm` | `@tree-sitter-grammars/tree-sitter-markdown@0.3.2` | split block/inline — needs two injection points |
| `language-make` | `tree-sitter-make@1.1.1` | peer `^0.22.1`, unverified against 0.25.1 |
| `language-objective-c` | `tree-sitter-objc@3.0.2` | peer `^0.22.1`, unverified; prebuild coverage unknown |
| `language-ruby-on-rails` | `tree-sitter-embedded-template@0.25.0` | **already installed** for ERB; overlays still need scope maps |
| `language-hyperlink`, `language-todo` | none, and none possible | regex injections *into other grammars' scopes*; tree-sitter has no equivalent |
| `language-coffee-script`, `language-git`, `language-mustache`, long tail | none maintained | convert-or-drop decision |

---

## The PRs

Sized for one sitting each unless noted. Every one carries a gate that fails
without it, per house rule.

### PR A — grammar inventory ratchet · **done**

`script/ci/grammar-inventory.test.js`: classify every shipped grammar as
tree-sitter, TextMate-shadowed, TextMate-unique or injection-only; assert the
TextMate counts never rise. Records the 42 unique scopes with their package, so
the exception list stops being prose. Lands whatever else is decided, and makes
every later PR measurable.

### PR B — merge file types, retire the flag, delete what is orphaned · **done, and not as planned**

D1 was answered: remove the flag. The deletion it was supposed to unlock
mostly cannot happen, and the reason is worth recording.

**The 27 shadowed grammars are not a fallback. They are a library.** first-mate
resolves `{"include": "source.js"}` through its own registry, so a tree-sitter
grammar can never answer one. **26 of the 42 surviving TextMate grammars
include a shadowed scope** — `source.gfm` alone includes 21 of them for fenced
code blocks (`js`, `python`, `ruby`, `css`, `html`, …), `source.objc` includes
`source.c`, `source.makefile` includes `source.shell`, `text.python.traceback`
includes `source.python`. Delete those files and Markdown's code fences go
plain.

Only **3** were reachable from nothing and could go: `source.tsx`,
`text.html.erb`, `text.html.php`. What landed instead:

- 89 file types moved onto the tree-sitter grammars, so `cjs`, `mjs`, `es6`,
  `PKGBUILD`, `bashrc`, `zshrc`, `Fastfile`, `gemspec`, `Vagrantfile`,
  `Snakefile`, `htm`, `xhtml` and 77 others open on tree-sitter rather than
  reaching a TextMate grammar that is no longer selectable. `install` and
  `profile` deliberately stayed with PHP, which claims them for Drupal and
  wins them today.
- `core.useTreeSitterParsers` is gone: tree-sitter always wins a tie, and the
  TextMate grammar for a shadowed scope survives only as an include target.
- Two new gates in `script/ci/grammar-inventory.test.js`: the moved file types
  must stay claimed, and **no TextMate grammar may be deleted while another
  one includes it**.

That last gate found a bug on its first run: `source.gfm` includes
`source.rust`, and `language-rust-bundled` ships only a tree-sitter grammar —
so ```` ```rust ```` fences in Markdown have no highlighting today. Recorded as
a known gap; PR C closes it.

Driving the built app then found a second one. **HTML was reaching TextMate for
any file that starts with a doctype** — most real HTML. Grammar selection adds
0.5 for a first-line match and 0.1 for being tree-sitter, and only the TextMate
grammar declared one. The tree-sitter grammar now declares the equivalent, and
a third gate compiles every regex a tree-sitter grammar declares: they are
built with `new RegExp(value)`, so a TextMate-style `(?i)` prefix throws at
construction and takes the whole grammar with it, silently handing the language
back to TextMate. That is exactly what a first attempt at this fix did.

### PR C — Markdown on tree-sitter · **done**

`language-gfm` is the most-used language on the exception list. The parser is
split (`markdown` + `markdown_inline`), so the block grammar must inject the
inline one, and fenced code blocks must inject the language they name — both
through `addInjectionPoint`, which `language-html` already uses for ERB. The
scope map is the work; expect a full day plus review of headings, emphasis,
links, lists, tables and code fences against the TextMate output.
Gate: `script/ci/smoke-test.js` asserted `probe.md` loads as the TextMate
*GitHub Markdown*; it now asserts the engine as well, and a `Makefile` probe
took over as the first-mate check — markdown was the only one.

**What it actually took**, beyond the scope maps:

- Two grammars, not one: `source.gfm` (block) and `source.gfm.inline`, with
  the block grammar injecting the inline one. The parser package exposes the
  second language on a subpath, which the `parser` field already supports
  (`tree-sitter-typescript/typescript` set the precedent).
- `includeChildren: true` on the injection. Without it `NodeRangeSet` hands the
  injected parser only the *gaps between* a node's children, so the inline
  layer was created, parsed an empty tree, and every **bold** and `code` stayed
  unhighlighted while nothing errored.
- **22 tree-sitter grammars gained an `injectionRegExp`.** Fenced code resolves
  the info string against that pattern, and only four grammars had one, so
  ```` ```js ```` would have matched nothing. This is also what closes the Rust
  fence gap PR B found: ```` ```rust ```` now parses as Rust.

### PR D — plist, make, objc · **done**

Same procedure as PR C, smaller surfaces. plist first: the XML parser is
already in the tree, so it costs a scope map and nothing else. `make` and
`objc` need their parsers proven against `tree-sitter@0.25.1` on all five CI
platforms first — their published peer range is `^0.22.1`, and a parser that
needs a source build changes the bootstrap story. Spike that in the same PR
and abandon the row if it does not hold.

### PR E — drop hyperlink and todo · **done**

These two cannot be ported: they are regex patterns injected into *other*
grammars' scopes (`injectionSelector: "comment, text.plain"`), which
tree-sitter has no equivalent for. Rebuilding them as decoration providers was
the alternative; the owner call was to drop them. Both packages are gone —
the catalog is 34 language packages, now 32.

What that costs, stated plainly: a URL in a code comment is no longer scoped
`markup.underline.link`, so the `link` package's **Open Link** does not fire
there, and `TODO:` / `FIXME:` are no longer highlighted anywhere. **Markdown
links are unaffected** — the tree-sitter grammar from PR C scopes them itself,
verified in the built app.

With these gone, the "cannot be ported" set in the inventory gate is empty.

### PR F — the long tail: convert or drop · **in progress, one tranche landed**

**Landed:** CoffeeScript dropped (dead language; its grammars moved to
`spec/fixtures/packages/` because the TextMate specs need a TextMate grammar to
tokenize, and they go together at PR G). Mustache and Handlebars dropped as a
*grammar*, but `hbs`, `handlebars`, `mustache`, `mst`, `mu`, `stache`,
`ractive` moved onto the tree-sitter **HTML** grammar — the markup highlights
and `{{tags}}` read as plain text, which beat depending on a 0.1.x parser
published twice. Old-style (NeXTSTEP) plists dropped: nothing emits that format
and no tree-sitter grammar exists for it; a `.plist` still opens on the XML
grammar ported in PR D.

**Remaining, and the shape of it:** several rows are not grammars to write at
all, but **file types to move onto a grammar already in the tree** — `csx` and
`cake` onto C#, `mm` onto Objective-C, `xsl`/`xslt` onto XML, `Gemfile` onto
Ruby. Several more are overlay scopes with no file types of their own
(`source.js.regexp.replacement`, `source.regexp.python`, the rails overlays),
which cost nothing to delete. What is left after that is a handful of real
decisions: `text.plain`, `source.sass`, the git commit/rebase buffers, and Go's
`go.mod` / `go.sum`.

### PR F (original framing) — the long tail: convert or drop · owner call, then one PR

~30 niche scopes: `source.gotemplate`, `text.html.jsp`, `text.junit-test-report`,
`text.python.traceback`, `text.shell-session`, `source.sassdoc`, `source.perl6`,
`source.cake`, `source.csx`, `source.litcoffee`, the rails overlays, git
commit/config/rebase, mustache. Most have no maintained tree-sitter grammar.
With community packages cancelled and the catalog owned, **dropping** a row is
as legitimate as porting it — but it is a product decision per row, and the
list belongs in `language-stack.md` next to the existing owner column.

### PR G — delete the engine · small, and last

Only when PR A's ratchet reads zero unique TextMate scopes. Deletes
`first-mate`, `oniguruma`, `src/text-mate-language-mode.js`,
`src/pending-text-mate-grammar.ts`, `src/tokenized-line.ts`,
`src/load-first-mate.ts` and its gate, and drops one NAN native from
`preload-natives.js`. This is the payoff; everything above is the price.

---

## Decisions this needs

- ~~**D1** — Is `core.useTreeSitterParsers: false` a supported escape hatch?~~
  **Answered: leftover, removed in PR B.** It unlocked 3 deletions, not 27 —
  the rest are an include library, not a fallback.
- ~~**D2** — Is Markdown worth a day of scope-mapping?~~ **Done in PR C.**
- ~~**D3** — Are `make`, `objc` and plist worth porting?~~ **Answered: port
  all three, done in PR D.** Both new parsers ship N-API prebuilds, so neither
  needed a source build. Two rows they do not cover stay behind:
  `source.objcpp` and `source.strings` (no parser), and `source.plist`, which
  is the old NeXTSTEP format, not XML.
- ~~**D4** — Do clickable links and TODO highlighting have to survive?~~
  **Answered: no. Both are dropped** — PR E is two deletions.
- ~~**D5** — Does first-mate actually have to die?~~ **Answered: yes.** The
  long tail in PR F is therefore convert-or-drop per row, not a standing
  exception list, and PR G is the point of the exercise.

## What this does not do

It does not make the editor faster on the languages that already have
tree-sitter grammars — those already skip first-mate entirely. It does not
touch marker layers, LSP, or the renderer-thread crawls
(`packages/fuzzy-finder/lib/path-loader.js`, `src/replace-in-files.js`), which
are a separate performance question.
