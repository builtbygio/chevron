# Which editor autocomplete is watching

`AutocompleteManager` tracks exactly one editor at a time — `this.editor` —
and everything else follows from it: the buffer subscription that notices
typing, the providers that get asked, the suggestion list that appears.

## The bug

It used to bind to an editor in only two situations:

```js
watchEditor (editor, labels) {
  let view = chevron.views.getView(editor)
  if (view.hasFocus()) {              // focused at this instant
    this.updateCurrentEditor(editor, labels)
  }
  view.addEventListener('focus', ...) // or focused later
```

An editor can become the one you are typing in without either happening — it
is opened and made active while focus sits elsewhere, or the DOM focus event
arrives after the editor is already active. The manager then stays bound to
the *previous* editor, and typing produces nothing at all: no popup, no
request, no error. Measured in the packaged app:

```
activeIsOurs:             true      the workspace agrees the editor is active
textLine:                 "prob"    the typing landed in it
managerEditorPath:        file.js   but the manager is on the previous editor
hasPromise:               false     so no suggestion request ever starts
popup:                    false
```

This is the "no autocomplete popup" smoke failure that came and went for days.
It looked intermittent because it is a race: whether the focus event beats the
activation decides it, and anything that shifts startup timing changes the
rate. An unrelated parse-path experiment moved it from roughly one local run
in three to three in four, which is what finally made it reproducible.

## The fix

Follow the active editor as well as focus:

- `watchEditor` binds if the view has focus **or** the editor is already the
  workspace's active text editor, which covers an editor watched after it
  became active.
- `handleEvents` subscribes to `workspace.observeActiveTextEditor` and rebinds
  to any editor it is already watching, which covers activation with no focus
  event.

`watchedEditors` became a `WeakMap` so each editor's labels survive for the
rebind. A `WeakSet` cannot answer "which labels did this editor have", and the
labels decide which providers get asked.

An editor with no entry in the map is ignored. Mini editors in panels are
watched with their own labels, and binding one with `workspace-center` labels
would ask the wrong providers.

The active-editor path also defers to a **focused editor outside the workspace
centre**. A mini editor in a panel is never the active text editor, so without
that, switching tabs would take autocomplete away from a panel the user is
typing in. The test is on the labels rather than on focus alone: deferring to
any focused editor would defeat the fix, because the editor left behind in the
bug is usually the focused one.

## Gates

| Test | Covers |
|------|--------|
| `script/ci/autocomplete-follows-active-editor.test.js` | the wiring: the active-editor subscription, the `watchEditor` condition, the label map, and that an unwatched editor is ignored |
| `script/ci/smoke-test.js` | typing in a project file and in a loose file each produce a popup with the expected items |

The smoke phases are the ones that were failing, so they are the real
regression test; the unit gate stops the wiring being removed quietly.
