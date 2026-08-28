# language-sass (Chevron)

SCSS highlighter for Chevron. Tree-sitter is the default for
`source.css.scss` (`tree-sitter-scss@1.0.0` via
`grammars/tree-sitter-scss.json`). Indented Sass (`source.sass`) and
SassDoc stay TextMate-only (`sass.json`, `sassdoc.json`). TextMate
fallback for SCSS is `grammars/scss.json`. Settings and snippets ship
as JSON. 13c: no CSON in `grammars/` / `settings/` / `snippets/`.
`spec/` may still have Coffee.

Owned so the pin is not an archived `atom/*` remote.
Chevron loads this via `packageDependencies`.
