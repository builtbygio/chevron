# Language stack — tree-sitter coverage and TextMate exception list

**Status:** H2 PR 13 catalog + PR 13b stream. First tranche done; later tranche done (less, scss, perl, clojure, csharp). PR 13c: `language-source`, `language-text`, `language-gfm`, `language-less`, `language-make`, `language-sql`, `language-toml`, `language-yaml`, `language-clojure`, `language-perl`, `language-php`, `language-property-list`, `language-xml`, `language-csharp`, `language-git`, `language-objective-c`, `language-sass`, `language-ruby-on-rails`. This is the exception list. Since the 2026-09-03 owner decision it is also the remaining work before first-mate is deleted — see the note in §3.  
**Owner:** `builtbygio`  
**Code:** `src/grammar-registry.js` (`getParserKindCounts()`). Runtime: official `tree-sitter@0.25.1` + first-mate / oniguruma.

Tree-sitter is the highlighter whenever the catalog language ships a `type: tree-sitter` grammar — there is no setting to prefer TextMate (`core.useTreeSitterParsers` was removed). The TextMate grammar for such a scope stays registered because 26 of the grammars in §3 `include` one. TextMate is the **supported fallback** for every row in §3. Deleting first-mate is H3 PR 22 (the retirement plan's PR G) and is gated on this list being empty.

Do **not** treat a “port” decision as work started. Ports are PR 13b (one language per PR).

---

## 1. Counts (2026-08-16)

34 `packageDependencies` keys named `language-*`. Audited from the installed pins (`node_modules/language-*` + in-repo `packages/language-rust-bundled`).

| Kind | Packages |
|------|----------|
| Tree-sitter + TextMate (both) | 21 |
| Tree-sitter only | 1 (`language-rust-bundled`) |
| TextMate only | 11 |
| No grammar (settings only) | 1 (`language-source`) |

A package is **both** when it ships at least one `type: tree-sitter` grammar *and* at least one TextMate grammar. Sibling scopes in a “both” package can still be TextMate-only (e.g. `source.go` is tree-sitter; `source.mod` is not).

---

## 2. Every bundled language

| Package | Highlighter | Tree-sitter parser(s) | Primary scope(s) | Grammar on disk | Decision |
|---------|-------------|----------------------|------------------|-----------------|----------|
| `language-c` | both | `tree-sitter-c`, `tree-sitter-cpp` | `source.c`, `source.cpp` | JSON | — (already TS) |
| `language-css` | both | `tree-sitter-css` | `source.css` | JSON | — |
| `language-go` | both | `tree-sitter-go` | `source.go` (TS). TM-only siblings: `text.html.gohtml`, `source.mod`, `source.sum`, `source.gotemplate` | JSON | — |
| `language-html` | both | `tree-sitter-html`, `tree-sitter-embedded-template` | `text.html.basic`, `text.html.ejs`, `text.html.erb` | JSON | — |
| `language-java` | both | `tree-sitter-java` | `source.java` (TS). TM-only siblings: JSP, properties, EL, junit | JSON | — |
| `language-javascript` | both | `tree-sitter-javascript`, `tree-sitter-jsdoc`, `tree-sitter-regex` | `source.js`, `source.jsdoc`, `source.js.regexp` | JSON | — |
| `language-json` | both | `tree-sitter-json` | `source.json` | JSON | — |
| `language-python` | both | `tree-sitter-python` | `source.python` (TS). TM-only siblings: console, traceback, python regexp | JSON | — |
| `language-ruby` | both | `tree-sitter-ruby` | `source.ruby` (TS). TM-only siblings: Gemfile, ERB | JSON | — |
| `language-rust-bundled` | tree-sitter | `tree-sitter-rust` | `source.rust` | JSON | — |
| `language-shellscript` | both | `tree-sitter-bash` | `source.shell` (TS). TM-only sibling: `text.shell-session` | JSON | — |
| `language-typescript` | both | `tree-sitter-typescript` (ts / tsx / flow) | `source.ts`, `source.tsx`, `source.flow` | JSON | — |
| `language-yaml` | both | `@tree-sitter-grammars/tree-sitter-yaml` | `source.yaml` | JSON | **ported** (13b) |
| `language-xml` | both | `@tree-sitter-grammars/tree-sitter-xml` (`text.xml`). TM-only sibling: `text.xml.xsl` | `text.xml`, `text.xml.xsl` | JSON | **ported** (13b) |
| `language-php` | both | `tree-sitter-php` (`text.html.php`) + `tree-sitter-php/php_only` (`source.php`) | `text.html.php`, `source.php` | JSON | **ported** (13b) |
| `language-toml` | both | `@tree-sitter-grammars/tree-sitter-toml` | `source.toml` | JSON | **ported** (13b) |
| `language-sql` | both | `@derekstride/tree-sitter-sql` | `source.sql` | JSON | **ported** (13b) |
| `language-less` | both | `tree-sitter-less` (`mdovale/tree-sitter-less`) | `source.css.less` | JSON | **ported** (13b) |
| `language-sass` | both | `tree-sitter-scss` (`source.css.scss`). TM-only siblings: `source.sass`, `source.sassdoc` | `source.css.scss`, `source.sass`, `source.sassdoc` | JSON | **ported** (13b) |
| `language-perl` | both | `tree-sitter-perl` (`source.perl`). TM-only sibling: `source.perl6` | `source.perl`, `source.perl6` | JSON | **ported** (13b) |
| `language-clojure` | both | `tree-sitter-clojure-orchard` (`source.clojure`) | `source.clojure` | JSON | **ported** (13b) |
| `language-csharp` | both | `tree-sitter-c-sharp` (`source.cs`). TM-only siblings: `source.csx`, `source.cake` | `source.cs`, `source.csx`, `source.cake` | JSON | **ported** (13b) |
| `language-objective-c` | both | `tree-sitter-objc@3.0.2` | `source.objc`, `source.objcpp`, `source.strings` | JSON | **ported** for `source.objc`; `objcpp` and `strings` stay TextMate |
| `language-gfm` | both | `@tree-sitter-grammars/tree-sitter-markdown@0.3.2` | `source.gfm` | JSON | **ported** — block grammar plus a `source.gfm.inline` injection; fenced code injects the language named in the fence. The TextMate grammar stays as an include target |
| `language-git` | TextMate | — | `text.git-commit`, `source.git-config`, `text.git-rebase` | JSON | **keep TextMate** |
| `language-ruby-on-rails` | TextMate | — | `source.ruby.rails` + html/js/sql/rjs overlays | JSON | **keep TextMate** |
| `language-make` | both | `tree-sitter-make@1.1.1` | `source.makefile` | JSON | **ported** |
| `language-property-list` | both | `@tree-sitter-grammars/tree-sitter-xml@0.7.0` | `source.plist`, `text.xml.plist` | JSON | **ported** for `text.xml.plist` (XML plists); `source.plist` is the old NeXTSTEP format and stays TextMate |
| `language-text` | TextMate | — | `text.plain` | JSON | **keep TextMate** |
| `language-source` | none | — | settings only (`.source` indent/comments) | JSON settings | **keep TextMate** |

---

## 3. Exception list (TextMate-only + no-grammar)

**Dropped so far:** `language-hyperlink` and `language-todo` (textmate-retirement-plan.md,
PR E). They were TextMate *injection* grammars — regex patterns matched inside
other grammars' scopes — which tree-sitter has no equivalent for. Dropping them
means a URL in a code comment is no longer scoped `markup.underline.link`, so
Open Link does not fire there, and `TODO:` is no longer highlighted. Markdown
links still work: the tree-sitter grammar scopes them itself.

`language-coffee-script` and `language-mustache` are gone too (PR F).
CoffeeScript is a dead language — its grammars live on in
`spec/fixtures/packages/` because the TextMate specs need *some* TextMate
grammar to tokenize, and they will go when those specs do. Mustache and
Handlebars files (`hbs`, `mustache`, `stache`, …) now open on the tree-sitter
**HTML** grammar: the markup highlights and the `{{tags}}` read as plain text,
which is the trade rather than depending on a 0.1.x parser. The old-style
(NeXTSTEP) plist grammar went with them — nothing emits that format and no
tree-sitter grammar exists; XML plists are ported.

**Overlays folded (PR F, second tranche).** Fourteen more TextMate grammars
went. Five were file types wearing a grammar, and the file types moved onto a
grammar already in the tree: `csx` and `cake` → C#, `mm`/`M` → Objective-C,
`xsl`/`xslt` → XML, `Gemfile` → Ruby (which already claimed it). Nine were
overlays with nothing to fall back to — `source.js.regexp.replacement`,
`source.regexp.python`, `text.python.console`, `text.python.traceback`,
`text.shell-session`, `source.sassdoc`, `text.junit-test-report` and two
others. **`source.gotemplate` and `source.java.el` were deliberately kept**:
`text.html.gohtml` and `text.html.jsp` are live TextMate grammars built from
them, and the include-graph gate caught the attempt to delete them.

Named owner for every row: **`builtbygio`**. “keep TextMate” is a valid owner decision. These packages **are** why first-mate stays.

What it would cost to shrink this list, priced per PR: [textmate-retirement-plan.md](../process/textmate-retirement-plan.md).

### Port — first tranche (PR 13b, one PR each)

**Done:** yaml, xml, php, toml, sql. SQL uses `@derekstride/tree-sitter-sql@0.3.11` (no official `tree-sitter/tree-sitter-sql`; this is the maintained grammar). That package ships `src/parser.c` and builds an N-API addon via `node-gyp-build` — no npm prebuilds. **13c:** sql, toml, yaml, php, and xml TM grammars + settings JSON (php and xml also snippets).

### Port — later (PR 13b after the first tranche)

**Done:** less, scss, perl, clojure, csharp. C# uses official `tree-sitter-c-sharp@0.23.5` (N-API, npm prebuilds on all five CI platforms). `source.csx` / `source.cake` stay TextMate. **13c:** clojure, perl, csharp, and sass TM grammars + settings + snippets JSON.

No remaining later-tranche ports. What is left is the keep-TextMate list.

### Keep TextMate

Not a programming-language port, or nobody will staff one. Revisit only if an owner says so.

> **Owner decision 2026-09-03: first-mate goes.** This supersedes the decision
> below. The remaining rows are convert-or-drop, not a standing exception list,
> and the losses are accepted: `language-hyperlink` and `language-todo` are
> already dropped (PR E), so URLs in comments are no longer clickable and
> `TODO:` is no longer highlighted. Plan and sequencing:
> [textmate-retirement-plan.md](../process/textmate-retirement-plan.md).
>
> ~~**Owner decision 2026-08-17: this list is stable, and H3 PR 22 is not applicable.**~~ first-mate + oniguruma stay in the product, wrapped behind `GrammarRegistry` and lazy-loaded (PR 14) so a tree-sitter-only session never boots the NAN addon. TextMate is a permanent supported fallback, not a shame state — G4/D4 already say so. *Superseded 2026-09-03; kept because it is why the wrapping and lazy-load exist.*
>
> ~~The 13b port stream is finished; nothing portable is queued.~~ Since then `language-gfm`, `language-make`, `language-objective-c` and `text.xml.plist` were ported (PRs C and D). `language-text` is plain text and `language-source` has no grammar; both still need a decision.

| Package | Owner | Why keep |
|---------|-------|----------|
| `language-objective-c` | builtbygio | Not in the 13b stream. **13c:** grammars + settings + snippets JSON. |
| `language-gfm` | builtbygio | **Ported** (textmate-retirement-plan.md, PR C). Markdown parses in two passes, so the package registers two injection points: `inline` for everything inside a paragraph, and `fenced_code_block` for the language named in the fence. Its TextMate grammar stays as an include target. |
| `language-git` | builtbygio | Commit / rebase / config buffers, not a language engine. **13c:** grammars + settings + snippets JSON. |
| `language-ruby-on-rails` | builtbygio | Dialect overlays on ruby/html/js/sql. Port ruby (done) covers the file types that matter. **13c:** grammars + snippets JSON. |
| `language-make` | builtbygio | Small surface. **13c:** grammar + settings JSON. |
| `language-property-list` | builtbygio | macOS plist; xml port may cover the XML flavour later. **13c:** grammars + settings + snippets JSON. |
| `language-text` | builtbygio | Plain text. **13c:** grammar + snippets JSON. |
| `language-source` | builtbygio | No grammar — shared `.source` editor settings. **13c:** settings JSON. |

---

### PR 13c — CSON → JSON (one PR per pin)

Convert shipped `grammars/` / `settings/` / `snippets/` CSON to JSON. Delete the `.cson`. Runtime already loads both extensions. **`season` is gone**: nothing in the repository is CSON, and core reads JSON through `src/main-process/json-file.js`. Do not convert `spec/**/*.cson`.

**Done:** `language-source` (settings JSON), `language-text` (grammar + snippets JSON), `language-gfm` (settings + snippets JSON), `language-less` (TM grammar + settings JSON), `language-make` (grammar + settings JSON), `language-sql` (TM grammar + settings JSON), `language-toml` (TM grammar + settings JSON), `language-yaml` (TM grammar + settings JSON), `language-clojure` (TM grammar + settings + snippets JSON), `language-perl` (TM grammars + settings + snippets JSON), `language-php` (TM grammars + settings + snippets JSON), `language-property-list` (grammars + settings + snippets JSON), `language-xml` (TM grammars + settings + snippets JSON), `language-csharp` (TM grammars + settings + snippets JSON), `language-git` (grammars + settings + snippets JSON), `language-objective-c` (grammars + settings + snippets JSON), `language-sass` (TM grammars + settings + snippets JSON), `language-ruby-on-rails` (grammars + snippets JSON).

**Remaining:** none. Every bundled `language-*` pin ships JSON, and `season` has been dropped.

Already JSON (no 13c work): `language-c`, `language-css`, `language-go`, `language-html`, `language-java`, `language-javascript`, `language-json`, `language-python`, `language-ruby`, `language-rust-bundled`, `language-shellscript`, `language-typescript`.

### Pin CSON inventory (Wave 1, 2026-08-28)

13c only ever swept `language-*`. That is not enough evidence to touch `season`, so Wave 1 swept the **whole** catalog and the app tree. Gate: `script/ci/pin-cson.test.js` (`pin CSON inventory (Wave 1)`).

| Surface | `.cson` files |
|---------|---------------|
| 94 `packageDependencies` pins (`node_modules/*` + in-repo `packages/*`) | **0** |
| App tree (`src`, `static`, `keymaps`, `menus`, `dot-chevron`) | **0** |
| Tracked files in this repo (`git ls-files '*.cson'`) | **0** |

`keymaps/` and `menus/` are already `.json`; `dot-chevron/` templates ship `keymap.json` / `snippets.json`.

**So `season` is no longer a pin reader.** What is left splits into user-authored files and third-party package data. Both must be empty before a Wave 3 delete:

| Reader | Serves | Verdict |
|--------|--------|---------|
| `src/config-file.js`, `src/user-config-path.js`, `src/keymap-extensions.ts`, `src/main-process/lsp-command-policy.js` | User-authored `~/.chevron/*.cson` (dual-read; writer is JSON) | **Keep** — deleting these breaks existing user configs |
| `src/compile-cache.js` | `require()` of a `.cson` file | **Keep** while user init/packages can require CSON |
| `src/package.js`, `src/package-manager.js`, `src/grammar-registry.js`, `src/menu-manager.ts`, `src/context-menu-manager.ts`, `src/main-process/main.js` | Any installed package's `package.cson` / keymaps / menus / grammars / settings | **Keep** — third-party packages still ship CSON, even though no owned pin does |

The Wave 3 gate for `season` is therefore **user `.cson` dual-read plus third-party package data**, not the pins. Converting more pins cannot move it.

---

## 4. What this document is not

- **Not** a delete plan for first-mate or oniguruma. H2 PR 14 lazy-loads them. H3 PR 22 deletes them **only if** this exception list is empty (or the owner accepts dropping the remaining TextMate-only langs) — **owner decided 2026-08-17 that it is not, and PR 22 is closed as not applicable.**
- **Not** PR 13b. Do not add `tree-sitter-*` to a pin in this PR.
- **Not** a `season` delete. 13c converts pins; PR 5b drops season only after the remaining list is empty.
- **Not** an LSP list. Semantics stay in `src/lsp/` (utilityProcess). ctags / `symbols-view` stay the no-server fallback.

Public language ids stay the TextMate scope name (`source.js`) even when the highlighter is tree-sitter. `GrammarRegistry` already maps `textMateScopeNamesByTreeSitterLanguageId`.

---

## 5. How a 13b port lands (later)

In the **owned** `builtbygio/language-<name>` repo, then a Chevron pin bump:

1. Depend on an official / maintained `tree-sitter-<name>` that `load-tree-sitter-language.js` can open.
2. Add `grammars/tree-sitter-<name>.json` with `"type": "tree-sitter"` and `"parser"`.
3. Keep the TextMate grammar until a dogfood cycle proves colour/indent parity (Pillar 1). Do not delete it in the first port PR.
4. Bump the SHA in Chevron `packageDependencies`.

CI: `script/ci/language-stack.test.js` fails if a `language-*` pin is added or removed without updating this file.
