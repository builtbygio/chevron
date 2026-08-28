# language-gfm (Chevron)

TextMate-only GFM highlighter (`source.gfm`). Ships as JSON
(`grammars/gfm.json`, `settings/gfm.json`, `snippets/gfm.json`). 13c: no
CSON in `grammars/` / `settings/` / `snippets/`. `spec/` may still have
Coffee.

Owned so the pin is not an archived `atom/*` remote.
Chevron loads this via `packageDependencies`. Do not add a tree-sitter
grammar here without updating `src/load-tree-sitter-language.js` and
the official `tree-sitter@0.25` contract.
