var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var bookmarks_exports = {};
__export(bookmarks_exports, {
  default: () => Bookmarks
});
module.exports = __toCommonJS(bookmarks_exports);
var import_atom = require("chevron");
class Bookmarks {
  static deserialize(editor, state) {
    return new Bookmarks(editor, editor.getMarkerLayer(state.markerLayerId));
  }
  constructor(editor, markerLayer) {
    this.editor = editor;
    this.markerLayer = markerLayer || this.editor.addMarkerLayer({ persistent: true });
    this.decorationLayer = this.editor.decorateMarkerLayer(this.markerLayer, { type: "line-number", class: "bookmarked" });
    this.disposables = new import_atom.CompositeDisposable();
    this.disposables.add(chevron.commands.add(chevron.views.getView(this.editor), {
      "bookmarks:toggle-bookmark": this.toggleBookmark.bind(this),
      "bookmarks:jump-to-next-bookmark": this.jumpToNextBookmark.bind(this),
      "bookmarks:jump-to-previous-bookmark": this.jumpToPreviousBookmark.bind(this),
      "bookmarks:select-to-next-bookmark": this.selectToNextBookmark.bind(this),
      "bookmarks:select-to-previous-bookmark": this.selectToPreviousBookmark.bind(this),
      "bookmarks:clear-bookmarks": this.clearBookmarks.bind(this)
    }));
    this.disposables.add(this.editor.onDidDestroy(this.destroy.bind(this)));
  }
  destroy() {
    this.deactivate();
    this.markerLayer.destroy();
  }
  deactivate() {
    this.decorationLayer.destroy();
    this.disposables.dispose();
  }
  serialize() {
    return { markerLayerId: this.markerLayer.id };
  }
  toggleBookmark() {
    for (const range of this.editor.getSelectedBufferRanges()) {
      const bookmarks = this.markerLayer.findMarkers({ intersectsRowRange: [range.start.row, range.end.row] });
      if (bookmarks && bookmarks.length > 0) {
        for (const bookmark of bookmarks) {
          bookmark.destroy();
        }
      } else {
        const bookmark = this.markerLayer.markBufferRange(range, { invalidate: "surround", exclusive: true });
        this.disposables.add(bookmark.onDidChange(({ isValid }) => {
          if (!isValid) {
            bookmark.destroy();
          }
        }));
      }
    }
  }
  clearBookmarks() {
    for (const bookmark of this.markerLayer.getMarkers()) {
      bookmark.destroy();
    }
  }
  jumpToNextBookmark() {
    if (this.markerLayer.getMarkerCount() > 0) {
      const bufferRow = this.editor.getLastCursor().getMarker().getStartBufferPosition().row;
      const markers = this.markerLayer.getMarkers().sort((a, b) => a.compare(b));
      const bookmarkMarker = markers.find((marker) => marker.getBufferRange().start.row > bufferRow) || markers[0];
      this.editor.setSelectedBufferRange(bookmarkMarker.getBufferRange(), { autoscroll: false });
      this.editor.scrollToCursorPosition();
    } else {
      chevron.beep();
    }
  }
  jumpToPreviousBookmark() {
    if (this.markerLayer.getMarkerCount() > 0) {
      const bufferRow = this.editor.getLastCursor().getMarker().getStartBufferPosition().row;
      const markers = this.markerLayer.getMarkers().sort((a, b) => b.compare(a));
      const bookmarkMarker = markers.find((marker) => marker.getBufferRange().start.row < bufferRow) || markers[0];
      this.editor.setSelectedBufferRange(bookmarkMarker.getBufferRange(), { autoscroll: false });
      this.editor.scrollToCursorPosition();
    } else {
      chevron.beep();
    }
  }
  selectToNextBookmark() {
    if (this.markerLayer.getMarkerCount() > 0) {
      const bufferRow = this.editor.getLastCursor().getMarker().getStartBufferPosition().row;
      const markers = this.markerLayer.getMarkers().sort((a, b) => a.compare(b));
      const bookmarkMarker = markers.find((marker) => marker.getBufferRange().start.row > bufferRow) || markers[0];
      if (!bookmarkMarker) {
        chevron.beep();
      } else {
        this.editor.setSelectedBufferRange([bookmarkMarker.getHeadBufferPosition(), this.editor.getCursorBufferPosition()], { autoscroll: false });
      }
    } else {
      chevron.beep();
    }
  }
  selectToPreviousBookmark() {
    if (this.markerLayer.getMarkerCount() > 0) {
      const bufferRow = this.editor.getLastCursor().getMarker().getStartBufferPosition().row;
      const markers = this.markerLayer.getMarkers().sort((a, b) => b.compare(a));
      const bookmarkMarker = markers.find((marker) => marker.getBufferRange().start.row < bufferRow) || markers[0];
      if (!bookmarkMarker) {
        chevron.beep();
      } else {
        this.editor.setSelectedBufferRange([this.editor.getCursorBufferPosition(), bookmarkMarker.getHeadBufferPosition()], { autoscroll: false });
      }
    } else {
      chevron.beep();
    }
  }
}

// Chevron: Node require() interop for default-only esbuild ESM modules
if (module.exports && module.exports.__esModule && module.exports.default != null) {
  var __keys = Object.keys(module.exports).filter(function (k) {
    return k !== '__esModule' && k !== 'default';
  });
  if (__keys.length === 0) {
    module.exports = module.exports.default;
  }
}
