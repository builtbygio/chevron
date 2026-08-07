/*
 * Decaffeinated from bookmarks@35363fb lib/main.coffee (Chevron #62).
 * Applied by script/lib/patch-decaffeinate-bundled-packages.js
 */
const { CompositeDisposable } = require('atom');

let Bookmarks = null;
const BookmarksView = require('./bookmarks-view');
let editorsBookmarks = null;
let disposables = null;
let bookmarksView = null;

module.exports = {
  activate(bookmarksByEditorId) {
    editorsBookmarks = [];
    const watchedEditors = new WeakSet();
    bookmarksView = null;
    disposables = new CompositeDisposable();

    atom.commands.add('atom-workspace', 'bookmarks:view-all', function() {
      if (bookmarksView == null) {
        bookmarksView = new BookmarksView(editorsBookmarks);
      }
      bookmarksView.show();
    });

    atom.workspace.observeTextEditors(function(textEditor) {
      if (watchedEditors.has(textEditor)) {
        return;
      }

      if (Bookmarks == null) {
        Bookmarks = require('./bookmarks');
      }
      let bookmarks;
      const state = bookmarksByEditorId[textEditor.id];
      if (state) {
        bookmarks = Bookmarks.deserialize(textEditor, state);
      } else {
        bookmarks = new Bookmarks(textEditor);
      }
      editorsBookmarks.push(bookmarks);
      watchedEditors.add(textEditor);
      disposables.add(
        textEditor.onDidDestroy(function() {
          const index = editorsBookmarks.indexOf(bookmarks);
          if (index !== -1) {
            editorsBookmarks.splice(index, 1);
          }
          bookmarks.destroy();
          watchedEditors.delete(textEditor);
        })
      );
    });
  },

  deactivate() {
    if (bookmarksView != null) {
      bookmarksView.destroy();
    }
    for (const bookmarks of editorsBookmarks) {
      bookmarks.deactivate();
    }
    disposables.dispose();
  },

  serialize() {
    const bookmarksByEditorId = {};
    for (const bookmarks of editorsBookmarks) {
      bookmarksByEditorId[bookmarks.editor.id] = bookmarks.serialize();
    }
    return bookmarksByEditorId;
  }
};
