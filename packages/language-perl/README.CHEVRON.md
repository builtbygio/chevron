# language-perl (Chevron)

Perl highlighter for Chevron. Tree-sitter is the default for
`source.perl` (`tree-sitter-perl@1.2.1` via
`grammars/tree-sitter-perl.json`). The addon is ESM with top-level
await; Chevron loads it through `load-tree-sitter-language.js`
(`node-gyp-build`). No npm prebuilds — bootstrap rebuilds the N-API
addon.

Perl 6 / Raku (`source.perl6`, `grammars/perl 6.json`) stays
TextMate-only. TextMate fallback for Perl 5 is `grammars/perl.json`.
Settings and snippets ship as JSON. 13c: no CSON in `grammars/` /
`settings/` / `snippets/`. `spec/` may still have Coffee.

Owned so the pin is not an archived `atom/*` remote.
Chevron loads this via `packageDependencies`.
