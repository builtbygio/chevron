# Language modes

**Code:** `src/tree-sitter-language-mode.js`, `src/plain-text-language-mode.ts`,
`src/auto-indent.ts`, assigned in `src/grammar-registry.js`

A buffer always has a language mode. It supplies highlighting, folding,
comment awareness and indent suggestions to `TextEditor`.

| grammar | language mode |
|---|---|
| tree-sitter | `TreeSitterLanguageMode` |
| anything else, including the null grammar | `PlainTextLanguageMode` |

## Why PlainTextLanguageMode exists

`TextMateLanguageMode` used to cover the second row. When the TextMate engine
was deleted (#320), its auto-indent methods moved to `src/auto-indent.ts` —
but its folding did not, and `languageModeForGrammarAndBuffer` returned `null`
for grammarless buffers. `null` means text-buffer's own `NullLanguageMode`,
which implements the six methods text-buffer itself calls and nothing more.

Two things broke for any buffer with no tree-sitter grammar — a `.txt`, or any
unknown extension:

- **Folding did nothing.** `TextEditor` guards these calls
  (`languageMode.isFoldableAtRow && ...`), so it failed silently.
- **`isRowCommented` threw.** `TextEditor.rowRangeForParagraphAtBufferRow` was
  the one unguarded call site, so `autoflow:reflow-selection` raised
  `languageMode.isRowCommented is not a function`.

## What it does

Folding is by indentation: a row is foldable when a later row is indented
further, and the fold ends before the first row back at or under the starting
indentation. That rule needs no grammar, which is the point.

Nothing is a comment (`isRowCommented` is always `false`) and there are no
comment strings, because without a grammar there is no way to know. Commenting
a plain-text buffer therefore does nothing, as before.

Highlighting is empty — the same null iterator text-buffer uses. Its empty tag
array is deliberately **not** frozen: a display-layer caller assigns to
`.length`, and freezing it turns that into a `TypeError`.

## Adding a language mode

`TextEditor` calls every language mode method defensively except where noted
above. A new mode needs text-buffer's six (`bufferDidChange`,
`bufferDidFinishTransaction`, `buildHighlightIterator`,
`onDidChangeHighlighting`, `getLanguageId`, and optionally `destroy` and
`classNameForScopeId`) and can implement as much of the editor surface as it
can answer honestly.
