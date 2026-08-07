var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var main_exports = {};
__export(main_exports, {
  activate: () => activate,
  consumeStatusBar: () => consumeStatusBar,
  deactivate: () => deactivate,
  setLineEnding: () => setLineEnding
});
module.exports = __toCommonJS(main_exports);
var import_underscore_plus = __toESM(require("underscore-plus"));
var import_atom = require("chevron");
var import_selector = require("./selector");
var import_status_bar_item = __toESM(require("./status-bar-item"));
var import_helpers = __toESM(require("./helpers"));
const LineEndingRegExp = /\r\n|\n/g;
const LFRegExp = /(\A|[^\r])\n/g;
const CRLFRegExp = /\r\n/g;
let disposables = null;
function activate() {
  disposables = new import_atom.CompositeDisposable();
  let selectorDisposable;
  let selector;
  disposables.add(
    atom.commands.add("atom-text-editor", {
      "line-ending-selector:show": () => {
        if (!selectorDisposable) {
          selector = new import_selector.Selector([
            { name: "LF", value: "\n" },
            { name: "CRLF", value: "\r\n" }
          ]);
          selectorDisposable = new import_atom.Disposable(() => selector.dispose());
          disposables.add(selectorDisposable);
        }
        selector.show();
      },
      "line-ending-selector:convert-to-LF": (event) => {
        const editorElement = event.target.closest("atom-text-editor");
        setLineEnding(editorElement.getModel(), "\n");
      },
      "line-ending-selector:convert-to-CRLF": (event) => {
        const editorElement = event.target.closest("atom-text-editor");
        setLineEnding(editorElement.getModel(), "\r\n");
      }
    })
  );
}
function deactivate() {
  disposables.dispose();
}
function consumeStatusBar(statusBar) {
  let statusBarItem = new import_status_bar_item.default();
  let currentBufferDisposable = null;
  let tooltipDisposable = null;
  const updateTile = import_underscore_plus.default.debounce((buffer) => {
    getLineEndings(buffer).then((lineEndings) => {
      if (lineEndings.size === 0) {
        let defaultLineEnding = getDefaultLineEnding();
        buffer.setPreferredLineEnding(defaultLineEnding);
        lineEndings = (/* @__PURE__ */ new Set()).add(defaultLineEnding);
      }
      statusBarItem.setLineEndings(lineEndings);
    });
  }, 0);
  disposables.add(
    atom.workspace.observeActiveTextEditor((editor) => {
      if (currentBufferDisposable) currentBufferDisposable.dispose();
      if (editor && editor.getBuffer) {
        let buffer = editor.getBuffer();
        updateTile(buffer);
        currentBufferDisposable = buffer.onDidChange(({ oldText, newText }) => {
          if (!statusBarItem.hasLineEnding("\n")) {
            if (newText.indexOf("\n") >= 0) {
              updateTile(buffer);
            }
          } else if (!statusBarItem.hasLineEnding("\r\n")) {
            if (newText.indexOf("\r\n") >= 0) {
              updateTile(buffer);
            }
          } else if (oldText.indexOf("\n")) {
            updateTile(buffer);
          }
        });
      } else {
        statusBarItem.setLineEndings(/* @__PURE__ */ new Set());
        currentBufferDisposable = null;
      }
      if (tooltipDisposable) {
        disposables.remove(tooltipDisposable);
        tooltipDisposable.dispose();
      }
      tooltipDisposable = atom.tooltips.add(statusBarItem.element, {
        title() {
          return `File uses ${statusBarItem.description()} line endings`;
        }
      });
      disposables.add(tooltipDisposable);
    })
  );
  disposables.add(
    new import_atom.Disposable(() => {
      if (currentBufferDisposable) currentBufferDisposable.dispose();
    })
  );
  statusBarItem.onClick(() => {
    const editor = atom.workspace.getActiveTextEditor();
    atom.commands.dispatch(
      atom.views.getView(editor),
      "line-ending-selector:show"
    );
  });
  let tile = statusBar.addRightTile({ item: statusBarItem, priority: 200 });
  disposables.add(new import_atom.Disposable(() => tile.destroy()));
}
function getDefaultLineEnding() {
  switch (atom.config.get("line-ending-selector.defaultLineEnding")) {
    case "LF":
      return "\n";
    case "CRLF":
      return "\r\n";
    case "OS Default":
    default:
      return import_helpers.default.getProcessPlatform() === "win32" ? "\r\n" : "\n";
  }
}
function getLineEndings(buffer) {
  if (typeof buffer.find === "function") {
    return Promise.all([buffer.find(LFRegExp), buffer.find(CRLFRegExp)]).then(
      ([hasLF, hasCRLF]) => {
        const result = /* @__PURE__ */ new Set();
        if (hasLF) result.add("\n");
        if (hasCRLF) result.add("\r\n");
        return result;
      }
    );
  } else {
    return new Promise((resolve) => {
      const result = /* @__PURE__ */ new Set();
      for (let i = 0; i < buffer.getLineCount() - 1; i++) {
        result.add(buffer.lineEndingForRow(i));
      }
      resolve(result);
    });
  }
}
function setLineEnding(item, lineEnding) {
  if (item && item.getBuffer) {
    let buffer = item.getBuffer();
    buffer.setPreferredLineEnding(lineEnding);
    buffer.setText(buffer.getText().replace(LineEndingRegExp, lineEnding));
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  consumeStatusBar,
  deactivate,
  setLineEnding
});

// Chevron: Node require() interop for default-only esbuild ESM modules
if (module.exports && module.exports.__esModule && module.exports.default != null) {
  var __keys = Object.keys(module.exports).filter(function (k) {
    return k !== '__esModule' && k !== 'default';
  });
  if (__keys.length === 0) {
    module.exports = module.exports.default;
  }
}
