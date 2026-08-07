'use strict';

// Chevron package API surface (preferred). require('atom') re-exports this module
// so community packages keep working. See docs/atom-to-chevron-rename-plan.md.

const TextBuffer = require('text-buffer');
const { Point, Range } = TextBuffer;
const { File, Directory } = require('pathwatcher');
const { Emitter, Disposable, CompositeDisposable } = require('event-kit');
const BufferedNodeProcess = require('../src/buffered-node-process');
const BufferedProcess = require('../src/buffered-process');
const GitRepository = require('../src/git-repository');
const Notification = require('../src/notification');
const { watchPath } = require('../src/path-watcher');

const chevronExport = {
  BufferedNodeProcess,
  BufferedProcess,
  GitRepository,
  Notification,
  TextBuffer,
  Point,
  Range,
  File,
  Directory,
  Emitter,
  Disposable,
  CompositeDisposable,
  watchPath
};

if (process.platform === 'win32') {
  Object.defineProperty(chevronExport, 'WinShell', {
    enumerable: true,
    get() {
      return require('../src/main-process/win-shell');
    }
  });
}

if (process.type === 'renderer') {
  chevronExport.Task = require('../src/task');
  chevronExport.TextEditor = require('../src/text-editor');
}

module.exports = chevronExport;
