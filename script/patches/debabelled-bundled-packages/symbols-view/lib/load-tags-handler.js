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
var load_tags_handler_exports = {};
__export(load_tags_handler_exports, {
  default: () => load_tags_handler_default
});
module.exports = __toCommonJS(load_tags_handler_exports);
var import_async = __toESM(require("async"));
var import_ctags = __toESM(require("ctags"));
var import_get_tags_file = __toESM(require("./get-tags-file"));
function load_tags_handler_default(directoryPaths) {
  return import_async.default.each(
    directoryPaths,
    (directoryPath, done) => {
      let tagsFilePath = (0, import_get_tags_file.default)(directoryPath);
      if (!tagsFilePath) {
        return done();
      }
      let stream = import_ctags.default.createReadStream(tagsFilePath);
      stream.on("data", function(tags) {
        for (const tag of Array.from(tags)) {
          tag.directory = directoryPath;
        }
        return emit("tags", tags);
      });
      stream.on("end", done);
      return stream.on("error", done);
    },
    this.async()
  );
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
