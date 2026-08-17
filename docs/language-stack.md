# Language stack — tree-sitter coverage and TextMate exception list

**Status:** H2 PR 13 catalog + PR 13b stream. First tranche done; later tranche done (less, scss, perl, clojure, csharp). PR 13c: `language-source`, `language-hyperlink`, `language-text`, `language-todo`. This is the exception list, not a promise that first-mate dies.  
**Owner:** `builtbygio`  
**Code:** `src/grammar-registry.js` (`getParserKindCounts()`). Runtime: official `tree-sitter@0.25.1` + first-mate / oniguruma.

Tree-sitter is the default highlighter when `core.useTreeSitterParsers` is on (product default) **and** the catalog language ships a `type: tree-sitter` grammar. TextMate is the **supported fallback** for every row in §3. Deleting first-mate is optional H3 PR 22 and is gated on this list being empty.

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
| `language-yaml` | both | `@tree-sitter-grammars/tree-sitter-yaml` | `source.yaml` | JSON + CSON fallback | **ported** (13b) |
| `language-xml` | both | `@tree-sitter-grammars/tree-sitter-xml` (`text.xml`). TM-only sibling: `text.xml.xsl` | `text.xml`, `text.xml.xsl` | JSON + CSON fallback | **ported** (13b) |
| `language-php` | both | `tree-sitter-php` (`text.html.php`) + `tree-sitter-php/php_only` (`source.php`) | `text.html.php`, `source.php` | JSON + CSON fallback | **ported** (13b) |
| `language-toml` | both | `@tree-sitter-grammars/tree-sitter-toml` | `source.toml` | JSON + CSON fallback | **ported** (13b) |
| `language-sql` | both | `@derekstride/tree-sitter-sql` | `source.sql` | JSON + CSON fallback | **ported** (13b) |
| `language-less` | both | `tree-sitter-less` (`mdovale/tree-sitter-less`) | `source.css.less` | JSON + CSON fallback | **ported** (13b) |
| `language-sass` | both | `tree-sitter-scss` (`source.css.scss`). TM-only siblings: `source.sass`, `source.sassdoc` | `source.css.scss`, `source.sass`, `source.sassdoc` | JSON + CSON fallback | **ported** (13b) |
| `language-perl` | both | `tree-sitter-perl` (`source.perl`). TM-only sibling: `source.perl6` | `source.perl`, `source.perl6` | JSON + CSON fallback | **ported** (13b) |
| `language-clojure` | both | `tree-sitter-clojure-orchard` (`source.clojure`) | `source.clojure` | JSON + CSON fallback | **ported** (13b) |
| `language-csharp` | both | `tree-sitter-c-sharp` (`source.cs`). TM-only siblings: `source.csx`, `source.cake` | `source.cs`, `source.csx`, `source.cake` | JSON + CSON fallback | **ported** (13b) |
| `language-coffee-script` | TextMate | — | `source.coffee`, `source.litcoffee` | CSON | **keep TextMate** |
| `language-objective-c` | TextMate | — | `source.objc`, `source.objcpp`, `source.strings` | CSON | **keep TextMate** |
| `language-gfm` | TextMate | — | `source.gfm` | JSON grammar; CSON snippets/settings | **keep TextMate** |
| `language-git` | TextMate | — | `text.git-commit`, `source.git-config`, `text.git-rebase` | CSON | **keep TextMate** |
| `language-ruby-on-rails` | TextMate | — | `source.ruby.rails` + html/js/sql/rjs overlays | CSON | **keep TextMate** |
| `language-mustache` | TextMate | — | `text.html.mustache`, `source.sql.mustache` | CSON | **keep TextMate** |
| `language-make` | TextMate | — | `source.makefile` | CSON | **keep TextMate** |
| `language-property-list` | TextMate | — | `source.plist`, `text.xml.plist` | CSON | **keep TextMate** |
| `language-hyperlink` | TextMate (injection) | — | `text.hyperlink` | JSON | **keep TextMate** |
| `language-todo` | TextMate (injection) | — | `text.todo` | JSON | **keep TextMate** |
| `language-text` | TextMate | — | `text.plain` | JSON | **keep TextMate** |
| `language-source` | none | — | settings only (`.source` indent/comments) | JSON settings | **keep TextMate** |

---

## 3. Exception list (TextMate-only + no-grammar)

Named owner for every row: **`builtbygio`**. “keep TextMate” is a valid owner decision. These packages **are** why first-mate stays.

### Port — first tranche (PR 13b, one PR each)

**Done:** yaml, xml, php, toml, sql. SQL uses `@derekstride/tree-sitter-sql@0.3.11` (no official `tree-sitter/tree-sitter-sql`; this is the maintained grammar). That package ships `src/parser.c` and builds an N-API addon via `node-gyp-build` — no npm prebuilds.

### Port — later (PR 13b after the first tranche)

**Done:** less, scss, perl, clojure, csharp. C# uses official `tree-sitter-c-sharp@0.23.5` (N-API, npm prebuilds on all five CI platforms). `source.csx` / `source.cake` stay TextMate.

No remaining later-tranche ports. What is left is the keep-TextMate list.

### Keep TextMate

Not a programming-language port, or nobody will staff one. Revisit only if an owner says so.

| Package | Owner | Why keep |
|---------|-------|----------|
| `language-coffee-script` | builtbygio | Architecture: exception until someone cares. |
| `language-objective-c` | builtbygio | Not in the 13b stream. |
| `language-gfm` | builtbygio | GFM-specific TextMate grammar; `tree-sitter-markdown` is a later product call, not this list. |
| `language-git` | builtbygio | Commit / rebase / config buffers, not a language engine. |
| `language-ruby-on-rails` | builtbygio | Dialect overlays on ruby/html/js/sql. Port ruby (done) covers the file types that matter. |
| `language-mustache` | builtbygio | Template injection. |
| `language-make` | builtbygio | Small surface. |
| `language-property-list` | builtbygio | macOS plist; xml port may cover the XML flavour later. |
| `language-hyperlink` | builtbygio | Injection grammar (`text.hyperlink`). Snippets / gfm / comments depend on it. **13c:** grammar JSON. |
| `language-todo` | builtbygio | Injection grammar (`text.todo`). Load-bearing for TODO/FIXME scopes. **13c:** grammar + snippets JSON. |
| `language-text` | builtbygio | Plain text. **13c:** grammar + snippets JSON. |
| `language-source` | builtbygio | No grammar — shared `.source` editor settings. **13c:** settings JSON. |

---

### PR 13c — CSON → JSON (one PR per pin)

Convert shipped `grammars/` / `settings/` / `snippets/` CSON to JSON. Delete the `.cson`. Runtime already loads both extensions. **`season` stays** until this list is empty (or pack-time transpile + a documented dev-only reader). Do not convert `spec/**/*.cson`.

**Done:** `language-source` (settings JSON), `language-hyperlink` (grammar JSON), `language-text` (grammar + snippets JSON), `language-todo` (grammar + snippets JSON).

**Remaining** (18 pins, 63 files; next is `language-gfm`):

| Pin | `.cson` files |
|-----|--------------:|
| `language-ruby-on-rails` | 6 |
| `language-csharp`, `language-git`, `language-objective-c`, `language-sass` | 5 each |
| `language-coffee-script`, `language-perl`, `language-php`, `language-property-list`, `language-xml` | 4 each |
| `language-clojure` | 3 |
| `language-gfm`, `language-less`, `language-make`, `language-mustache`, `language-sql`, `language-toml`, `language-yaml` | 2 each |

Already JSON (no 13c work): `language-c`, `language-css`, `language-go`, `language-html`, `language-java`, `language-javascript`, `language-json`, `language-python`, `language-ruby`, `language-rust-bundled`, `language-shellscript`, `language-typescript`.

## 4. What this document is not

- **Not** a delete plan for first-mate or oniguruma. H2 PR 14 lazy-loads them. H3 PR 22 deletes them **only if** this exception list is empty (or the owner accepts dropping the remaining TextMate-only langs).
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
