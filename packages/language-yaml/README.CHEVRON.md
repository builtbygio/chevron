# language-yaml (Chevron)

YAML highlighter for Chevron. Tree-sitter is the default
(`@tree-sitter-grammars/tree-sitter-yaml@0.7.1` via
`grammars/tree-sitter-yaml.json`). TextMate fallback is
`grammars/yaml.json`. Settings ship as JSON
(`settings/language-yaml.json`). 13c: no CSON in `grammars/` /
`settings/` / `snippets/`. `spec/` may still have Coffee.

Owned so the pin is not an archived `atom/*` remote.
Chevron loads this via `packageDependencies`.
