'use strict';

/**
 * Autocomplete has to follow the editor being typed in, not only the one that
 * last raised a DOM focus event.
 *
 * docs/reference/autocomplete-editor-binding.md
 * Run: node --test script/ci/autocomplete-follows-active-editor.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MANAGER = path.join(
  ROOT,
  'packages',
  'autocomplete-plus',
  'lib',
  'autocomplete-manager.ts'
);

const source = fs.readFileSync(MANAGER, 'utf8');

describe('binding the manager to an editor', () => {
  it('watches the active editor, not just focus events', () => {
    assert.match(
      source,
      /observeActiveTextEditor/,
      'the manager must subscribe to the active text editor'
    );
  });

  it('binds on watch when the editor is already the active one', () => {
    const watchEditor = source.slice(source.indexOf('watchEditor ('));
    const body = watchEditor.slice(0, watchEditor.indexOf('handleEvents ('));
    assert.match(
      body,
      /hasFocus\(\)\s*\|\|\s*chevron\.workspace\.getActiveTextEditor\(\)\s*===\s*editor/,
      'watchEditor must accept the active editor as well as a focused one'
    );
  });

  it('remembers each watched editor labels so it can rebind later', () => {
    // A WeakSet cannot answer "which labels did this editor have", and the
    // active-editor path needs them to call updateCurrentEditor.
    assert.match(source, /this\.watchedEditors = new WeakMap\(\)/);
    assert.match(source, /this\.watchedEditors\.set\(editor, labels\)/);
    assert.doesNotMatch(source, /this\.watchedEditors\.add\(/);
  });

  it('ignores an active editor it does not watch', () => {
    // Mini editors in panels are watched with their own labels; an editor with
    // no entry must not be bound with the wrong ones.
    const idx = source.indexOf('observeActiveTextEditor');
    const block = source.slice(idx, idx + 400);
    assert.match(block, /watchedEditors\.get\(editor\)/);
    assert.match(block, /if \(labels\)/);
  });
});

describe('the workspace offers what the fix relies on', () => {
  it('has observeActiveTextEditor and getActiveTextEditor', () => {
    const workspace = fs.readFileSync(path.join(ROOT, 'src', 'workspace.js'), 'utf8');
    assert.match(workspace, /\bobserveActiveTextEditor\s*\(/);
    assert.match(workspace, /\bgetActiveTextEditor\s*\(/);
  });
});
