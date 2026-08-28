# language-property-list (Chevron)

TextMate-only property-list highlighter (`source.plist`,
`text.xml.plist`). Ships as JSON (`grammars/property list (old-style).json`,
`grammars/property list (xml).json`, `settings/language-property-list.json`,
`snippets/language-property-list.json`). 13c: no CSON in `grammars/` /
`settings/` / `snippets/`. `spec/` may still have Coffee.

Owned so the pin is not an archived `atom/*` remote.
Chevron loads this via `packageDependencies`. Do not add a tree-sitter
grammar here without updating `src/load-tree-sitter-language.js` and
the official `tree-sitter@0.25` contract.
