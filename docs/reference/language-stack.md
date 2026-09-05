# Language stack — one engine, and what it does not cover

**Status:** TextMate is gone. `first-mate` and `oniguruma` are deleted, every
shipped grammar is `type: tree-sitter`, and a language with no tree-sitter
grammar opens with **no highlighting** rather than on a second engine.
**Owner:** `builtbygio`
**Code:** `src/grammar-registry.js` (`getParserKindCounts()`),
`src/tree-sitter-language-mode.js`, `src/auto-indent.ts`. Runtime: official
`tree-sitter@0.25.1`.

How the retirement was sequenced, and what each step cost:
[textmate-retirement-plan.md](../process/textmate-retirement-plan.md).

> **Owner decision 2026-09-04: first-mate is deleted.** The nine rows kept in
> §3 were kept as *languages that still open*, not as a reason to keep the
> engine — none of them has a tree-sitter parser published anywhere, so they
> open uncoloured. This closes a decision that reversed twice:
> ~~2026-08-17, TextMate is a permanent supported fallback~~ →
> ~~2026-09-03, first-mate goes once the exception list is empty~~ →
> executed 2026-09-04 with the list non-empty and the loss accepted.

---

## 1. Counts

**27** `packageDependencies` keys named `language-*`, down from 34.

| Kind | Packages |
|------|----------|
| Tree-sitter | 26 |
| No grammar (settings only) | 1 (`language-source`) |
| TextMate | **0** |

Deleted outright: `language-git`, `language-text`, `language-ruby-on-rails`
(nothing left once their grammars went), plus `language-hyperlink`,
`language-todo`, `language-coffee-script` and `language-mustache` earlier in
the sequence.

---

## 2. Every bundled language

| Package | Highlighter | Tree-sitter parser(s) | Scope(s) | Grammar on disk |
|---------|-------------|----------------------|----------|-----------------|
| `language-c` | tree-sitter | `tree-sitter-c`, `tree-sitter-cpp` | `source.c`, `source.cpp` | JSON |
| `language-clojure` | tree-sitter | `tree-sitter-clojure-orchard` | `source.clojure` | JSON |
| `language-csharp` | tree-sitter | `tree-sitter-c-sharp` | `source.cs` (also `csx`, `cake`) | JSON |
| `language-css` | tree-sitter | `tree-sitter-css` | `source.css` | JSON |
| `language-gfm` | tree-sitter | `@tree-sitter-grammars/tree-sitter-markdown` | `source.gfm`, `source.gfm.inline` | JSON |
| `language-go` | tree-sitter | `tree-sitter-go` | `source.go` | JSON |
| `language-html` | tree-sitter | `tree-sitter-html`, `tree-sitter-embedded-template` | `text.html.basic`, `text.html.ejs`, `text.html.erb` (also `hbs`, `mustache`) | JSON |
| `language-java` | tree-sitter | `tree-sitter-java` | `source.java` | JSON |
| `language-javascript` | tree-sitter | `tree-sitter-javascript`, `tree-sitter-jsdoc`, `tree-sitter-regex` | `source.js`, `source.jsdoc`, `source.js.regexp` | JSON |
| `language-json` | tree-sitter | `tree-sitter-json` | `source.json` | JSON |
| `language-less` | tree-sitter | `tree-sitter-less` | `source.css.less` | JSON |
| `language-make` | tree-sitter | `tree-sitter-make` | `source.makefile` | JSON |
| `language-objective-c` | tree-sitter | `tree-sitter-objc` | `source.objc` (also `mm`) | JSON |
| `language-perl` | tree-sitter | `tree-sitter-perl` | `source.perl` | JSON |
| `language-php` | tree-sitter | `tree-sitter-php` | `source.php`, `text.html.php` | JSON |
| `language-property-list` | tree-sitter | `@tree-sitter-grammars/tree-sitter-xml` | `text.xml.plist` | JSON |
| `language-python` | tree-sitter | `tree-sitter-python` | `source.python` | JSON |
| `language-ruby` | tree-sitter | `tree-sitter-ruby` | `source.ruby` | JSON |
| `language-rust-bundled` | tree-sitter | `tree-sitter-rust` | `source.rust` | JSON |
| `language-sass` | tree-sitter | `tree-sitter-scss` | `source.css.scss` | JSON |
| `language-shellscript` | tree-sitter | `tree-sitter-bash` | `source.shell` | JSON |
| `language-source` | none | — | settings only | JSON |
| `language-sql` | tree-sitter | `@derekstride/tree-sitter-sql` | `source.sql` | JSON |
| `language-toml` | tree-sitter | `@tree-sitter-grammars/tree-sitter-toml` | `source.toml` | JSON |
| `language-typescript` | tree-sitter | `tree-sitter-typescript` | `source.ts`, `source.tsx`, `source.flow` | JSON |
| `language-xml` | tree-sitter | `@tree-sitter-grammars/tree-sitter-xml` | `text.xml` (also `xsl`, `xslt`) | JSON |
| `language-yaml` | tree-sitter | `@tree-sitter-grammars/tree-sitter-yaml` | `source.yaml` | JSON |

---

## 3. What lost highlighting

These opened on TextMate and now open as plain text — editable, searchable,
uncoloured. Every one was checked against npm first: **no tree-sitter parser is
published for any of them**, under either `tree-sitter-*` or
`@tree-sitter-grammars/*`.

| Was | Files | Note |
|-----|-------|------|
| `text.plain` | `.txt` | plain text has no syntax to parse |
| `source.sass` | `.sass` | the indented syntax; `.scss` is tree-sitter |
| `text.git-commit`, `text.git-rebase`, `source.git-config` | `COMMIT_EDITMSG`, `git-rebase-todo`, `.git/config` | the commit buffer is uncoloured now |
| `source.mod`, `source.sum`, `source.gotemplate`, `text.html.gohtml` | `go.mod`, `go.sum`, `.gohtml` | Go source itself is unaffected |
| `source.java-properties`, `text.html.jsp`, `source.java.el` | `.properties`, `.jsp` | Java source itself is unaffected |
| `source.perl6` | `.p6`, `.pm6`, `.nqp` | Raku; Perl 5 is unaffected |
| `source.strings` | `.strings` | iOS localization |
| rails overlays | `.rjs`, `.js.erb`, `.erbsql` | `.rb` and `.erb` are unaffected — tree-sitter Ruby and ERB claim them |

Also dropped along the way, with what it cost: **hyperlink** (a URL in a
comment is no longer scoped `markup.underline.link`, so Open Link does not fire
there — Markdown links still work), **todo** (`TODO:` is not highlighted),
**CoffeeScript**, **Mustache** (`.hbs` and friends open on the HTML grammar —
markup highlights, `{{tags}}` read as text), and **old-style NeXTSTEP plists**
(XML plists are tree-sitter).

**To bring one back**, a maintained tree-sitter parser has to exist on npm.
Then it is a scope map: `type: "tree-sitter"`, `parser`, `fileTypes`, `scopes`,
plus an entry in `MOVED_FILE_TYPES` if it reclaims file types. See
`packages/language-gfm/grammars/tree-sitter-gfm.json` for the fullest example,
including injections.

---

## 4. Indentation

Auto-indent is still pattern-based, from each package's
`settings/*.json` (`editor.increaseIndentPattern` and friends). Those methods
lived on `TextMateLanguageMode` and were borrowed by `TreeSitterLanguageMode`;
they are `src/auto-indent.ts` now. The patterns were written for oniguruma and
compile with `new RegExp`, so one JavaScript cannot parse yields no regex and
that language gets no indent adjustment rather than an exception.

---

## The parser reads the buffer, it is not handed it

`TreeSitterLanguageMode.parse` gives tree-sitter a callback that returns a
chunk of the buffer at a character index, rather than the whole file as a
string. A parse runs on every transaction, so on a large file the old shape
handed the parser megabytes per keystroke; the callback lets it read only what
it needs — for `typescript/lib/_tsc.js`, 782KB of 6.2MB.

Measured in the packaged app, single character insert in that file:

| | |
|--|--|
| whole buffer as a string | 21.4 ms |
| chunk callback | **9.2 ms** |

**It is not a general speed-up.** A file small enough to be read in full costs
the same either way. Parsed outside the editor, at a fixed chunk size of 4096:

| lines | string | callback |
|------:|-------:|---------:|
| 200 | 0.043 ms | 0.049 ms |
| 2,000 | 0.487 ms | 0.486 ms |
| 20,000 | 5.28 ms | 5.35 ms |
| 120,000 | 39.2 ms | 38.6 ms |

The standalone gap is much smaller than the in-app one, so part of the win is
in not materialising the buffer for the binding on each keystroke rather than
in the parse itself; that split was not isolated further. `getText()` is not
the cost — it returns in under a millisecond even straight after an edit.

The reader is `chunkReaderForBuffer`, a pure function of a buffer-shaped
object, so `script/ci/tree-sitter-chunk-reader.test.js` can drive it with a
buffer made of a string and check reassembly at every chunk size from 1 to 40.

## 5. What this document is not

It is not a plan. Ports happen when a parser exists and someone wants the
language; the sequencing that got here is closed and lives in
[textmate-retirement-plan.md](../process/textmate-retirement-plan.md).

### Pin CSON inventory

**0** `.cson` files across the catalog and the app tree, and `season` is not a
pin reader. That was Wave 1's result and it still holds:
`script/ci/pin-cson.test.js` sweeps for it, and
`script/ci/language-stack.test.js` repeats the sweep per package.

`script/ci/grammar-inventory.test.js` enforces the invariant: no TextMate
grammar ships, the moved file types stay claimed, every declared regex
compiles, and nothing in `src/` reaches for the deleted engine.
