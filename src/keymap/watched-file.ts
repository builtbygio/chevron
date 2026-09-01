'use strict';

/**
 * The slice of pathwatcher's File that the keymap manager used.
 *
 * atom-keymap watched each keymap file for change, rename and delete, and
 * reloaded the bindings from it. pathwatcher is a native module carried for
 * three consumers; the keymap only ever needed one file watched and three
 * callbacks, which fs.watch provides.
 *
 * fs.watch reports a delete and a rename identically, as 'rename', so the two
 * are told apart by asking whether the path still exists. That is a race by
 * nature -- a file replaced quickly enough looks like a change -- but it is
 * the same race pathwatcher had, and the consumer reloads on any of the three
 * anyway.
 */

const fs = require('fs');
const { Emitter, Disposable } = require('event-kit');

class WatchedFile {
  constructor(filePath) {
    this.path = filePath;
    this.emitter = new Emitter();
    this.watcher = null;
    this.disposed = false;
    this.start();
  }

  start() {
    try {
      this.watcher = fs.watch(this.path, eventType => {
        if (this.disposed) return;
        if (eventType === 'change') {
          this.emitter.emit('did-change');
          return;
        }
        // 'rename' covers both a rename and a delete.
        if (fs.existsSync(this.path)) this.emitter.emit('did-rename');
        else this.emitter.emit('did-delete');
      });
      // A watcher on a file that disappears must not take the process with it.
      this.watcher.on('error', () => this.stop());
    } catch (error) {
      // Watching is best effort: a keymap that cannot be watched is still
      // loaded, it simply does not reload on change.
      this.watcher = null;
    }
  }

  stop() {
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch (error) {}
      this.watcher = null;
    }
  }

  onDidChange(callback) {
    return this.emitter.on('did-change', callback);
  }

  onDidRename(callback) {
    return this.emitter.on('did-rename', callback);
  }

  onDidDelete(callback) {
    return this.emitter.on('did-delete', callback);
  }

  destroy() {
    this.disposed = true;
    this.stop();
    this.emitter.dispose();
  }
}

module.exports = WatchedFile;
