# Breadcrumbs and sticky scroll

Two answers to the same question — *what encloses this line?*

- **Breadcrumbs**: the path to the cursor, in a bar above the editor.
  `probe.ts › class Outer › method(a) › if (a > 0)`. Clicking a segment goes
  to the line that opened it.
- **Sticky scroll**: the lines that opened the blocks you have scrolled past,
  pinned to the top of the editor.

---

## Folds, not symbols

Both read `getFoldableRanges()` from the language mode. Every grammar is
tree-sitter now and **32 of the 35 shipped grammars declare folds** — the three
that do not are injection grammars (jsdoc, regex, gfm-inline), which correctly
have none of their own.

Symbols from a language server would give better labels, but a feature that
goes blank for a file whose server is not running is worse than one that is
slightly less clever. Folds work with no server at all.

`src/enclosing-scopes.ts` holds the shared part: which ranges contain a row,
outermost first, with two ranges opening on the same line collapsed to one —
a reader sees one line, so a trail with two entries for it says nothing extra.

## Asking costs a parse

`getFoldableRanges()` walks the whole syntax tree, and sticky scroll wants an
answer on **every scroll event**. So the ranges are cached per editor and
invalidated on change and on grammar change; scrolling then costs a filter over
an array.

Measured in the packaged app on a **120,000 line** file:

| | |
|--|--|
| `getFoldableRanges()`, cold | **2,533 ms** (40,003 ranges) |
| 50 scroll queries, warm cache | 13 ms |

The cache does its job — but it is invalidated on every edit, so without a
limit each pause in typing would buy another 2.5 second freeze on the next
scroll. Above **10,000 lines** (`MAX_LINES` in `src/enclosing-scopes.ts`) both
features are simply off: the check is on the line count, before the call, since
the cost is in the asking. An empty trail hides the bar and pins nothing, so
there is nothing further to handle.

## What broke, and what it taught

Sticky scroll's first version called `chevron.views.getView(editor)` and
`getFirstVisibleScreenRow()` for every editor **as it opened**. That forces the
editor component to create its element and measure before it is attached, and
the damage showed up nowhere near this feature: an unrelated smoke phase
started failing with `Invalid Point: (NaN, 0)`, and a second phase failed
because it depended on the first.

Registering only breadcrumbs made it pass; registering only sticky scroll
reproduced it. Now:

- nothing touches an editor's view until `view.isConnected`
- a non-finite scroll row returns instead of being used as arithmetic
- the overlay element is created on first use, not for every editor at boot
- no rule restyles `atom-text-editor` itself — changing the editor's own
  positioning context is a good way to break its measurements for everything
  else in it

The overlay is drawn rather than decorated on purpose: pinned lines are not
where they appear to be, and a decoration that moved a line would move the
cursor with it.

## Configuration

| Key | Default | |
|-----|---------|--|
| `breadcrumbs.enabled` | `true` | show the bar |
| `sticky-scroll.enabled` | `true` | pin enclosing lines |
| `sticky-scroll.maxLines` | `5` | deep nesting would otherwise cover the code you scrolled to |

## Gates

| Test | Covers |
|------|--------|
| `script/ci/enclosing-scopes.test.js` | ordering, containment at the opening and closing lines, same-line de-duplication, label trimming, that the cache asks the language mode once, and that a file over the line limit is never asked at all |
| `script/ci/smoke-test.js` | a real grammar producing folds, the trail naming the enclosing blocks outermost first, and the right lines pinned after scrolling |

The smoke phase uses a file of its own. Sharing `probe.ts` meant replacing the
text under the autocomplete and inline-text phases mid-run, and opening it
first meant `byExt('.ts')` silently handed those phases the wrong editor.
