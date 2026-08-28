# language-coffee-script (Chevron)

TextMate-only CoffeeScript highlighter (`source.coffee`,
`source.litcoffee`). Ships as JSON (`grammars/coffeescript.json`,
`grammars/coffeescript (literate).json`, `settings/language-coffee-script.json`,
`snippets/language-coffee-script.json`). 13c: no CSON in `grammars/` /
`settings/` / `snippets/`. `spec/` may still have Coffee.

Owned so the pin is not an archived `atom/*` remote.
Chevron loads this via `packageDependencies`. Do not add a tree-sitter
grammar here without updating `src/load-tree-sitter-language.js` and
the official `tree-sitter@0.25` contract.
