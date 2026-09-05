# Change review

Something proposes a change to one or more files; a person takes the parts
they want; what they took is applied as **one undoable step**.

```js
const proposal = chevron.changeProposal.proposeChange(path, oldText, newText);
const result = await chevron.review.propose({
  title: 'Rename `foo` to `bar`',
  proposals: [proposal]
});
// { applied: [{ path, hunks }], accepted: 3, cancelled: false }
```

Background: [next-tracks-plan.md](../process/next-tracks-plan.md), track 3 —
"a diff review surface: propose, show, accept per hunk, undo as one step".

---

## Why not the git packages

`git-diff` marks changed lines in the gutter and `github` has a full hunk UI,
but both diff a working tree against an index. This diffs against **text that
does not exist yet** — what a language server refactor or an agent proposes —
so there is nothing for git to compare.

## Rejecting is not undoing

A rejected hunk is never applied. `applyHunks` rebuilds the file from the
original plus the accepted hunks only, so what lands on disk is exactly what
was agreed to. The alternative — apply everything, then undo the rejected
parts — leaves a window where the file contains changes nobody accepted, and
gets the undo history wrong.

The property that matters, and the one `change-proposal.test.js` spends most
of its assertions on:

- accepting **every** hunk reproduces the proposed text exactly
- accepting **none** reproduces the original exactly
- any subset gives the original with only those hunks in it

That is checked over all eight combinations of a three-hunk proposal, and over
insertions, deletions, whole-file replacement, emptying a file, creating one
from nothing, and files with and without a trailing newline.

### The trailing newline

A file's final newline is a real difference a proposal may make, so the line
model keeps it: `text.split('\n')` leaves a trailing empty element and it is
**not** discarded. Dropping it — the obvious thing to do — meant adding a
trailing newline produced no hunks at all, and a file created from nothing
lost its last one. Both were caught by the round-trip cases above.

## The file moves underneath the proposal

A proposal is made against a snapshot and applied after someone has read it —
by which time they, or something else, may have typed. Applying hunks by their
original line numbers would then write into the wrong place **silently**,
which is the one failure this surface must not have. Reverting to that
behaviour and re-running the smoke test shows exactly what it costs:

```
keptHandEdit: false     the edit made while reviewing was overwritten
tookAccepted: true      a hunk was applied whose lines had changed
conflicted:   0         and nothing said so
```

So each hunk is located by **its own content**, not its line number:

1. at the position it was computed for, if it still matches there — a copy of
   the same passage elsewhere casts no doubt on the original position
2. otherwise anywhere in the file, if exactly one place matches
3. otherwise it is **conflicted**: reported, not applied, and the file is left
   as it is

`applyHunksToCurrent` returns `{ text, applied, conflicted }`, and the review
surface raises a warning naming the hunks it could not place. Silence would be
the worst outcome — a person ticks a hunk, the file has moved, and nothing
happens.

## One transaction

Applying goes through `buffer.transact()`, and `setTextViaDiff` where the
buffer has it, so a single undo takes the whole application back and the
file's markers and cursor survive. Smoke gates this in the app: propose two
hunks, accept one, reject the other, then press undo once and require the file
to equal what it was.

## Limits

- **`MAX_DIFF_LINES` (4000).** Above that the changed region is offered as one
  hunk rather than diffed line by line. A proposal that rewrites ten thousand
  lines is reviewed by reading the file, not by picking through hunks.
- **Hunks nearer than twice the context become one hunk**, because splitting
  them would print the same lines twice and ask about them separately.
- **Overlapping hunks.** If two accepted hunks want the same lines, the first
  one placed wins and the second is reported as conflicted rather than applied
  on top of it.

## Gates

| Test | Covers |
|------|--------|
| `script/ci/change-proposal.test.js` | segments, hunk grouping, and that every subset of accepted hunks is honest |
| `script/ci/smoke-test.js` | accepting through the UI writes what was accepted, leaves what was not, and undoes in one step |
