'use strict';

// Chevron package API surface. This is the only package API: the exports/atom.js
// alias was removed in H3 PR 23, so require('atom') fails with MODULE_NOT_FOUND.
// See docs/decisions/REBRANDING.md and docs/reference/chevron-architecture-modernization.md.

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
  // `Task` was removed in Wave 3: no first-party caller and no owned pin used
  // it. Run work in a utilityProcess worker instead (see docs/process/security-phase-s.md).
  chevronExport.TextEditor = require('../src/text-editor');
}

module.exports = chevronExport;
