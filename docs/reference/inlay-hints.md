# Inlay hints

The parameter names and inferred types a language server knows and the source
does not spell out, drawn between the characters that are actually in the file.

```
const alpha = compute(1, 2);
            ⁠: number    ⁠a: ⁠b:
```

Two halves, and the interesting one is the editor.

---

## The editor half: an `inline-text` decoration

Chevron had no way to draw text that is not in the buffer. The decoration
types were `line`, `line-number`, `highlight`, `cursor`, `gutter`, `overlay`
(floats above the text) and `block` (takes a whole line). `text` sounds right
and is not: it *styles characters that are already there*, which is why it
returns early for an empty range.

So there is a new one:

```js
editor.decorateMarker(marker, {
  type: 'inline-text',
  text: ': number',
  class: 'inlay-hint'
});
```

It takes an empty range, because a hint sits at a point.

### The rule that makes it delicate

`LineComponent.textNodes` must remain **exactly the line's own characters**.
`screenPositionForPixelPosition` works out a column by summing the lengths of
the text nodes before it, so a node that is not part of the line's text moves
every column after it — the cursor would land in the wrong place, which is far
worse than a missing hint.

The inserted span is therefore never registered in `textNodes`. When a hint
falls inside an existing node, that node is split and **both halves stay
registered**, so the array still concatenates to the line.

### The bug that is easy to miss

Horizontal positions are cached per screen line
(`horizontalPixelPositionsByScreenLineId`). A hint arriving *after* a line has
already been measured does not invalidate that cache on its own, so the
characters move on screen while the editor still believes they are where they
were — the cursor draws in the wrong place, and only after a hint.

`invalidateMeasurementsForChangedInlineText()` compares each rendered line's
inline text against the previous frame and drops the cached measurements for
the lines that changed. It returns immediately for an editor that has never
had a hint, so a file without them pays nothing.

This is gated in the packaged app, not in a unit test, because it is a claim
about the DOM: the smoke test measures a column, adds a hint before it, and
requires the measurement to move — and to come back when the hint is removed.
Removing the invalidation call fails it with

```
inline text did not move the characters after it (column measured at 252
before and 252 after) — the cursor would land where the line was without the hint
```

---

## The LSP half

`textDocument/inlayHint`, requested for the **visible rows only**. A server
asked about a ten thousand line file will compute ten thousand lines of hints
that nobody can see, and every one of them would become a marker.

- `chevron.lsp.inlayHintsAt(editor, range)` — hints for a range
- `chevron.lsp.servesInlayHints(editor)` — whether that editor's server offers them

Requests are debounced (250ms), and a reply that arrives after the user has
carried on typing is dropped rather than drawn. Hints are cleared and
re-requested on change, on grammar change and on scroll.

A hint's label may be a string or an array of parts carrying tooltips and
locations. Nothing draws the tooltips yet, so the parts are joined — a hint
that renders as nothing would be worse than one without a tooltip.

Padding is the server's decision, not ours: `paddingLeft` and `paddingRight`
say whether `: number` needs a space in front of it for the language being
described.

Turn them off with `lsp.inlayHints`.

---

## Gates

| Test | Covers |
|------|--------|
| `script/ci/inlay-hints.test.js` | labels, kinds, padding, capability, and that the hint is never pushed into `textNodes` |
| `script/ci/smoke-test.js` | the decoration rendering, moving the measurement, and restoring it on removal |
