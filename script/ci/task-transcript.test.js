'use strict';

/**
 * A task pane keeps the tail of its output across a reload, and does not
 * run the command again when the window comes back.
 *
 * The pty is a process. Restoring one would mean pretending a dead shell
 * was still the same run. What survives is text the run already produced,
 * capped, plus the task's name. The restored pane is a new shell.
 *
 * docs/reference/tasks.md
 * Run: node --test script/ci/task-transcript.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const {
  MAX_TRANSCRIPT_CHARS,
  appendTranscript
} = require(path.join(ROOT, 'packages', 'terminal', 'lib', 'transcript'));

const read = name =>
  fs.readFileSync(path.join(ROOT, 'packages', 'terminal', 'lib', name), 'utf8');

describe('the tail kept across a reload', () => {
  it('keeps a short run whole', () => {
    assert.strictEqual(appendTranscript('', 'npm test\nok'), 'npm test\nok');
    assert.strictEqual(appendTranscript('npm test\n', 'ok'), 'npm test\nok');
  });

  it('drops the front once the tail is full, never the end', () => {
    const older = 'A'.repeat(100) + 'B'.repeat(MAX_TRANSCRIPT_CHARS);
    const kept = appendTranscript(older, 'DONE');
    assert.strictEqual(kept.length, MAX_TRANSCRIPT_CHARS);
    assert.ok(kept.endsWith('DONE'));
    assert.ok(kept.startsWith('B'));
    assert.ok(!kept.includes('A'), 'the oldest characters are the ones that go');
  });

  it('treats a missing chunk as nothing', () => {
    assert.strictEqual(appendTranscript('hi', null), 'hi');
    assert.strictEqual(appendTranscript(undefined, undefined), '');
  });
});

describe('a restored task pane does not re-run the command', () => {
  it('remembers the task and its transcript, and not a session', () => {
    const view = read('terminal-view.js');
    const serialize = view.slice(view.indexOf('serialize()'), view.indexOf('destroy()'));
    assert.match(serialize, /state\.task = this\.task/);
    assert.match(serialize, /state\.transcript = this\.transcript/);
    assert.doesNotMatch(serialize, /this\.args/);
    assert.doesNotMatch(serialize, /this\.session/);
  });

  it('opens a fresh shell from the saved cwd, title and text', () => {
    const main = read('main.js');
    const restore = main.slice(main.indexOf('deserializeTerminalView'));
    const body = restore.slice(0, restore.indexOf('this.terminals.add'));
    assert.match(body, /cwd: state\.cwd/);
    assert.match(body, /title: state\.title/);
    assert.match(body, /task: state\.task/);
    assert.match(body, /priorTranscript: state\.transcript/);
    assert.doesNotMatch(body, /args:/);
    assert.doesNotMatch(body, /shell:/);
  });

  it('records which task opened the pane when it runs', () => {
    const tasks = read('tasks.js');
    const run = tasks.slice(tasks.indexOf('new TerminalView'));
    assert.match(run, /task: \{/);
    assert.match(run, /name: task\.name/);
    assert.match(run, /command: task\.command/);
  });
});
