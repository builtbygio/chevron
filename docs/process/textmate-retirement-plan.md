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

### PR A — grammar inventory ratchet · small · no decision needed

`script/ci/grammar-inventory.test.js`: classify every shipped grammar as
tree-sitter, TextMate-shadowed, TextMate-unique or injection-only; assert the
TextMate counts never rise. Records the 42 unique scopes with their package, so
the exception list stops being prose. Lands whatever else is decided, and makes
every later PR measurable.

### PR B — merge file types, then delete the 27 shadowed fallbacks · medium · **needs D1**

Move the TextMate-only `fileTypes` onto the matching tree-sitter grammars
(10 scopes, table above), delete the 27 files, retire
`core.useTreeSitterParsers` — with no fallback left it can only mislead.
Gate: open one file per moved extension and assert the resulting grammar,
extending `script/ci/load-tree-sitter-language.test.js`. Deletes ~27 files and
one config surface; first-mate stays for the other 42.

### PR C — Markdown on tree-sitter · large · **needs D2**

`language-gfm` is the most-used language on the exception list. The parser is
split (`markdown` + `markdown_inline`), so the block grammar must inject the
inline one, and fenced code blocks must inject the language they name — both
through `addInjectionPoint`, which `language-html` already uses for ERB. The
scope map is the work; expect a full day plus review of headings, emphasis,
links, lists, tables and code fences against the TextMate output.
Gate: `script/ci/smoke-test.js` currently asserts `probe.md` loads as the
TextMate *GitHub Markdown* — it becomes the tree-sitter assertion, so the
smoke test proves the swap in the real app.

### PR D — plist, make, objc · medium each, one PR per language · **needs D3**

Same procedure as PR C, smaller surfaces. plist first: the XML parser is
already in the tree, so it costs a scope map and nothing else. `make` and
`objc` need their parsers proven against `tree-sitter@0.25.1` on all five CI
platforms first — their published peer range is `^0.22.1`, and a parser that
needs a source build changes the bootstrap story. Spike that in the same PR
and abandon the row if it does not hold.

### PR E — hyperlink and todo without TextMate · medium · **needs D4**

These two cannot be ported: they are regex patterns injected into *other*
grammars' scopes (`injectionSelector: "comment, text.plain"`). If clickable
links and TODO highlighting are to survive without first-mate, they become
decoration providers over a marker layer — which is what the editor already
does for search results. Until this lands, the exception list cannot empty,
so PR G is blocked on it regardless of how many languages get ported.

### PR F — the long tail: convert or drop · owner call, then one PR

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

- **D1** — Is `core.useTreeSitterParsers: false` a supported escape hatch, or
  a leftover? Deleting it unblocks PR B and 27 files.
- **D2** — Is Markdown worth a day of scope-mapping? It is the one row on the
  list a user meets daily.
- **D3** — Are `make`, `objc` and plist worth porting, or are they
  drop-or-keep-TextMate rows?
- **D4** — Do clickable links and TODO highlighting have to survive? If not,
  PR E becomes two deletions and the list empties much faster.
- **D5** — Does first-mate actually have to die, or is "lazy, wrapped, and
  shrinking" the right resting state? H3 already allows the latter. **PR B is
  worth doing either way**; PRs C–G only pay if the answer is yes.

## What this does not do

It does not make the editor faster on the languages that already have
tree-sitter grammars — those already skip first-mate entirely. It does not
touch marker layers, LSP, or the renderer-thread crawls
(`packages/fuzzy-finder/lib/path-loader.js`, `src/replace-in-files.js`), which
are a separate performance question.
