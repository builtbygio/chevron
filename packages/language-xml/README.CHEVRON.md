# language-xml (Chevron)

XML highlighter for Chevron. Tree-sitter is the default for `text.xml`
(`@tree-sitter-grammars/tree-sitter-xml@0.7.0` via
`grammars/tree-sitter-xml.json`). TextMate fallback is
`grammars/xml.json`. XSL (`text.xml.xsl`, `grammars/xsl.json`) stays
TextMate-only. Settings and snippets ship as JSON. 13c: no CSON in
`grammars/` / `settings/` / `snippets/`. `spec/` may still have Coffee.

Owned so the pin is not an archived `atom/*` remote.
Chevron loads this via `packageDependencies`.
