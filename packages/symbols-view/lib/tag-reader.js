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
var tag_reader_exports = {};
__export(tag_reader_exports, {
  default: () => tag_reader_default
});
module.exports = __toCommonJS(tag_reader_exports);
var import_atom = require("chevron");
var import_ctags = __toESM(require("ctags"));
var import_async = __toESM(require("async"));
var import_get_tags_file = __toESM(require("./get-tags-file"));
var import_underscore_plus = __toESM(require("underscore-plus"));
let wordAtCursor = (text, cursorIndex, wordSeparator, noStripBefore) => {
  const beforeCursor = text.slice(0, cursorIndex);
  const afterCursor = text.slice(cursorIndex);
  const beforeCursorWordBegins = noStripBefore ? 0 : beforeCursor.lastIndexOf(wordSeparator) + 1;
  let afterCursorWordEnds = afterCursor.indexOf(wordSeparator);
  if (afterCursorWordEnds === -1) {
    afterCursorWordEnds = afterCursor.length;
  }
  return beforeCursor.slice(beforeCursorWordBegins) + afterCursor.slice(0, afterCursorWordEnds);
};
var tag_reader_default = {
  find(editor, callback) {
    let symbol;
    const symbols = [];
    if (symbol = editor.getSelectedText()) {
      symbols.push(symbol);
    }
    if (!symbols.length) {
      let nonWordCharacters;
      const cursor = editor.getLastCursor();
      const cursorPosition = cursor.getBufferPosition();
      const scope = cursor.getScopeDescriptor();
      const rubyScopes = scope.getScopesArray().filter((s) => /^source\.ruby($|\.)/.test(s));
      const wordRegExp = rubyScopes.length ? (nonWordCharacters = chevron.config.get("editor.nonWordCharacters", { scope }), // Allow special handling for fully-qualified ruby constants
      nonWordCharacters = nonWordCharacters.replace(/:/g, ""), new RegExp(`[^\\s${import_underscore_plus.default.escapeRegExp(nonWordCharacters)}]+([!?]|\\s*=>?)?|[<=>]+`, "g")) : cursor.wordRegExp();
      const addSymbol = (symbol2) => {
        if (rubyScopes.length) {
          if (/\s+=?$/.test(symbol2)) {
            symbols.push(symbol2.replace(/\s+=$/, "="));
          }
          symbols.push(symbol2.replace(/\s+=>?$/, ""));
        } else {
          symbols.push(symbol2);
        }
      };
      editor.scanInBufferRange(wordRegExp, cursor.getCurrentLineBufferRange(), ({ range, match }) => {
        if (range.containsPoint(cursorPosition)) {
          symbol = match[0];
          if (rubyScopes.length && symbol.indexOf(":") > -1) {
            const cursorWithinSymbol = cursorPosition.column - range.start.column;
            addSymbol(wordAtCursor(symbol, cursorWithinSymbol, ":", true));
            addSymbol(wordAtCursor(symbol, cursorWithinSymbol, ":"));
          } else {
            addSymbol(symbol);
          }
        }
      });
    }
    if (!symbols.length) {
      process.nextTick(() => {
        callback(null, []);
      });
    }
    import_async.default.map(chevron.project.getPaths(), (projectPath, done) => {
      const tagsFile = (0, import_get_tags_file.default)(projectPath);
      let foundTags = [];
      let foundErr = null;
      const detectCallback = () => {
        done(foundErr, foundTags);
      };
      if (!tagsFile) {
        return detectCallback();
      }
      return import_async.default.detectSeries(symbols, (symbol2, doneDetect) => {
        import_ctags.default.findTags(tagsFile, symbol2, (err, tags) => {
          if (!tags) {
            tags = [];
          }
          if (err) {
            foundErr = err;
            doneDetect(false);
          } else if (tags.length) {
            for (const tag of Array.from(tags)) {
              tag.directory = projectPath;
            }
            foundTags = tags;
            doneDetect(true);
          } else {
            doneDetect(false);
          }
        });
      }, detectCallback);
    }, (err, foundTags) => {
      callback(err, import_underscore_plus.default.flatten(foundTags));
    });
  },
  getAllTags(callback) {
    const projectTags = [];
    const listeners = [];
    let dead = false;
    const handle = {
      on(event, fn) {
        listeners.push({ event, fn });
        return handle;
      },
      emit(event, data) {
        if (dead) return;
        for (const l of listeners) {
          if (l.event === event) l.fn(data);
        }
      },
      terminate() {
        dead = true;
      }
    };
    handle.on("tags", (tags) => {
      projectTags.push(...(tags || []));
    });
    import_async.default.each(
      chevron.project.getPaths(),
      (directoryPath, done) => {
        if (dead) return done();
        const tagsFilePath = (0, import_get_tags_file.default)(directoryPath);
        if (!tagsFilePath) return done();
        const stream = import_ctags.default.createReadStream(tagsFilePath);
        stream.on("data", function(tags) {
          for (const tag of Array.from(tags)) {
            tag.directory = directoryPath;
          }
          handle.emit("tags", tags);
        });
        stream.on("end", done);
        stream.on("error", done);
      },
      () => {
        if (!dead) callback(projectTags);
      }
    );
    return handle;
  }
};

// Chevron: Node require() interop for default-only esbuild ESM modules
if (module.exports && module.exports.__esModule && module.exports.default != null) {
  var __keys = Object.keys(module.exports).filter(function (k) {
    return k !== '__esModule' && k !== 'default';
  });
  if (__keys.length === 0) {
    module.exports = module.exports.default;
  }
}
