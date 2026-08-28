# language-sql (Chevron)

SQL highlighter for Chevron. Tree-sitter is the default
(`@derekstride/tree-sitter-sql@0.3.11` via
`grammars/tree-sitter-sql.json`). There is no official
`tree-sitter/tree-sitter-sql`; this is the maintained grammar
nvim-treesitter uses. The npm tarball ships `src/parser.c` and
builds an N-API addon via `node-gyp-build` (no published prebuilds).

TextMate fallback is `grammars/sql.json`. Settings ship as JSON
(`settings/language-sql.json`). 13c: no CSON in `grammars/` /
`settings/` / `snippets/`. `spec/` may still have Coffee.

Owned so the pin is not an archived `atom/*` remote.
Chevron loads this via `packageDependencies`.
