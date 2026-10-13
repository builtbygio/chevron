# Breadcrumbs, sticky scroll and the outline

Two answers to the same question — *what encloses this line?* — and a third
to the one beside it, *what is in this file?*

- **Breadcrumbs**: the path to the cursor, in a bar above the editor.
  `probe.ts › class Outer › method(a) › if (a > 0)`. Clicking a segment goes
  to the line that opened it.
- **Sticky scroll**: the lines that opened the blocks you have scrolled past,
  pinned to the top of the editor.
- **Outline** (`outline:toggle`, View › Toggle Outline): the active file's
  structure as a tree in the right dock. The entry holding the cursor is
  highlighted, and clicking one goes to it. `outline:focus` puts the keyboard
  in it; it has no default keybinding.

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

## The outline: symbols first, folds always

Unlike breadcrumbs, the outline asks the language server first. A panel kept
open beside the code is read as a table of contents, and there a symbol's name
(`parse`) reads better than the line that opens it (`export async function
parse(text: string, options = {}) {`). Symbols come from
`chevron.lsp.documentSymbolTreeAt(editor)`, which keeps the nesting that
`documentSymbolsAt` flattens for symbols-view. When no server owns the file, or
one answers with nothing, the outline falls back to the same folds as above,
so every grammar with folds has an outline.

- **Fold labels are cleaned up for a table of contents.** Doc comments fold,
  but they aren't structure, so they're left out (`#if` blocks stay). A
  signature or condition split over lines folds twice: once from
  `export function parse(` and once from `): Result {`. The second is merged
  into the first, so the entry reads `export function parse`, not `): Result`.
- **Whole range and name range.** A symbol's `range` decides whether the
  cursor is inside it, and its `selectionRange` is where a click lands. A fold
  entry lands on the first character of its opening line.
- **Flat servers are nested by range.** `SymbolInformation` carries a
  `containerName`, but two classes can share a name; ranges cannot overlap
  that way.
- **Collapse state is keyed by name, not by position.** A key is the entry's
  label and its count among same-named siblings, under its parent's key. So an
  entry stays collapsed while lines are added above it, and overloads stay
  distinct. State is kept per file for the session, for the 200 files most
  recently shown, so a long session does not keep every file it ever opened.
- **A collapsed entry stands in for its contents.** If the cursor is inside a
  collapsed entry, that entry is highlighted. Nothing is expanded behind the
  user's back.
- **Hidden means idle.** Edits and editor switches only mark the panel stale,
  and it catches up when it is shown. A closed dock, another tab in front, and
  a dock collapsed to nothing all count as hidden; an `IntersectionObserver`
  covers all three. While shown it refreshes on stop-changing, which already
  waits for a pause in typing. A server request is asynchronous, and the fold
  walk is the same capped, cached one breadcrumbs uses.
- **Too large to outline.** With no server and a file over `MAX_LINES`, there
  are no folds to fall back on. The panel says "This file is too large to
  outline without a language server." rather than "Nothing to outline", which
  would claim the file has no structure.
- **A server that starts late.** Opening a file is what starts its server, so
  the first outline is usually folds. `chevron.lsp.onDidStartServer` fires once
  the server for the active file has finished `initialize`, and the outline
  asks again and swaps in symbols.
- **One tab stop.** The tree follows the WAI-ARIA tree pattern: one row at a
  time has `tabIndex` 0 (a roving tab index), and each `treeitem` carries
  `aria-selected` (holds the cursor) and, if it has children, `aria-expanded`.
  Up and Down move between visible rows, Home and End to the first and last.
  Right expands, or moves to the first child if already open. Left collapses,
  or moves to the parent if already closed. Enter goes to the entry as a
  click does, and Space expands or collapses it. Focus and selection are
  separate: moving with the arrows does not move the editor's cursor.
- **Restarts.** The panel serializes like any dock item, so it comes back open
  if it was open. Deactivating the package takes the panel out of its dock
  before destroying it, so a disabled outline does not leave a dead tab.

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
| `script/ci/outline.test.js` | symbol trees from `DocumentSymbol` and from flat `SymbolInformation`, fold trees (same-line folds, label-less blocks, input order), the entry holding a row, keys that survive edits and tell overloads apart, the keyboard model, the status line (including too large to outline), and the cap on collapse state |
| `script/ci/lsp-start-event.test.js` | `onDidStartServer` fires after `initialize` rather than on spawn, again on a crash restart, and for a listener that subscribed before the client activated |
| `script/ci/smoke-test.js` | a real grammar producing folds, the trail naming the enclosing blocks outermost first, the right lines pinned after scrolling, and the outline drawing the tree, highlighting the cursor's block, moving the cursor and focusing the editor on a click, keeping a collapsed entry collapsed across a refresh, and the keyboard: `outline:focus` with a single tab stop, Space, Down, Left twice, and Enter moving the cursor and focusing the editor |

The smoke phase uses a file of its own. Sharing `probe.ts` meant replacing the
text under the autocomplete and inline-text phases mid-run, and opening it
first meant `byExt('.ts')` silently handed those phases the wrong editor.
