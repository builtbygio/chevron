# language-toml (Chevron)

TOML highlighter for Chevron. Tree-sitter is the default
(`@tree-sitter-grammars/tree-sitter-toml@0.7.0` via
`grammars/tree-sitter-toml.json`). TextMate fallback is
`grammars/toml.json`. Settings ship as JSON
(`settings/language-toml.json`). 13c: no CSON in `grammars/` /
`settings/` / `snippets/`. `spec/` may still have Coffee.

Owned so the pin is not an archived `atom/*` remote.
Chevron loads this via `packageDependencies`.
