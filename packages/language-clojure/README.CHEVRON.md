# language-clojure (Chevron)

Clojure highlighter for Chevron. Tree-sitter is the default for
`source.clojure` (`tree-sitter-clojure-orchard@0.2.8` via
`grammars/tree-sitter-clojure.json`). No official
`tree-sitter/tree-sitter-clojure`; this is sogaiu's maintained N-API
grammar (`peer tree-sitter@^0.25`). The addon is ESM; Chevron loads it
through `load-tree-sitter-language.js` (`node-gyp-build`). No npm
prebuilds — bootstrap rebuilds the N-API addon.

oakmac `tree-sitter-clojure@0.4.0` is 2019/`nan` and is not used.

TextMate fallback is `grammars/clojure.json`. Settings and snippets
ship as JSON. 13c: no CSON in `grammars/` / `settings/` / `snippets/`.
`spec/` may still have Coffee. `.org` stays on whatever other grammar
claims it (not this tree-sitter fileTypes list).

Owned so the pin is not an archived `atom/*` remote.
Chevron loads this via `packageDependencies`.
