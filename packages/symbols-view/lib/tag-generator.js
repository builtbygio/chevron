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
var tag_generator_exports = {};
__export(tag_generator_exports, {
  default: () => TagGenerator
});
module.exports = __toCommonJS(tag_generator_exports);
var import_atom = require("chevron");
var import_path = __toESM(require("path"));
var import_fs_plus = __toESM(require("fs-plus"));
class TagGenerator {
  constructor(path1, scopeName) {
    this.path = path1;
    this.scopeName = scopeName;
  }
  getPackageRoot() {
    const { resourcePath } = chevron.getLoadSettings();
    const currentFileWasRequiredFromSnapshot = !import_fs_plus.default.isAbsolute(__dirname);
    const packageRoot = currentFileWasRequiredFromSnapshot ? import_path.default.join(resourcePath, "node_modules", "symbols-view") : import_path.default.resolve(__dirname, "..");
    if (import_path.default.extname(resourcePath) === ".asar" && packageRoot.indexOf(resourcePath) === 0) {
      return import_path.default.join(`${resourcePath}.unpacked`, "node_modules", "symbols-view");
    } else {
      return packageRoot;
    }
  }
  parseTagLine(line) {
    let sections = line.split("	");
    if (sections.length > 3) {
      return {
        position: new import_atom.Point(parseInt(sections[2], 10) - 1),
        name: sections[0]
      };
    }
    return null;
  }
  getLanguage() {
    if ([".cson", ".gyp"].includes(import_path.default.extname(this.path))) {
      return "Cson";
    }
    switch (this.scopeName) {
      case "source.c":
        return "C";
      case "source.cpp":
        return "C++";
      case "source.clojure":
        return "Lisp";
      case "source.capnp":
        return "Capnp";
      case "source.cfscript":
        return "ColdFusion";
      case "source.cfscript.embedded":
        return "ColdFusion";
      case "source.coffee":
        return "CoffeeScript";
      case "source.css":
        return "Css";
      case "source.css.less":
        return "Css";
      case "source.css.scss":
        return "Css";
      case "source.elixir":
        return "Elixir";
      case "source.fountain":
        return "Fountain";
      case "source.gfm":
        return "Markdown";
      case "source.go":
        return "Go";
      case "source.java":
        return "Java";
      case "source.js":
        return "JavaScript";
      case "source.js.jsx":
        return "JavaScript";
      case "source.jsx":
        return "JavaScript";
      case "source.json":
        return "Json";
      case "source.julia":
        return "Julia";
      case "source.makefile":
        return "Make";
      case "source.objc":
        return "C";
      case "source.objcpp":
        return "C++";
      case "source.python":
        return "Python";
      case "source.ruby":
        return "Ruby";
      case "source.sass":
        return "Sass";
      case "source.yaml":
        return "Yaml";
      case "text.html":
        return "Html";
      case "text.html.php":
        return "Php";
      case "text.tex.latex":
        return "Latex";
      case "text.html.cfml":
        return "ColdFusion";
    }
    return void 0;
  }
  generate() {
    let tags = {};
    const packageRoot = this.getPackageRoot();
    const command = import_path.default.join(packageRoot, "vendor", `ctags-${process.platform}`);
    const defaultCtagsFile = import_path.default.join(packageRoot, "lib", "ctags-config");
    const args = [`--options=${defaultCtagsFile}`, "--fields=+KS"];
    if (chevron.config.get("symbols-view.useEditorGrammarAsCtagsLanguage")) {
      const language = this.getLanguage();
      if (language) {
        args.push(`--language-force=${language}`);
      }
    }
    args.push("-nf", "-", this.path);
    return new Promise((resolve) => {
      let result, tag;
      return new import_atom.BufferedProcess({
        command,
        args,
        stdout: (lines) => {
          return (() => {
            result = [];
            for (const line of Array.from(lines.split("\n"))) {
              let item;
              if (tag = this.parseTagLine(line)) {
                item = tags[tag.position.row] ? tags[tag.position.row] : tags[tag.position.row] = tag;
              }
              result.push(item);
            }
            return result;
          })();
        },
        stderr() {
        },
        exit() {
          tags = (() => {
            result = [];
            for (const row in tags) {
              tag = tags[row];
              result.push(tag);
            }
            return result;
          })();
          return resolve(tags);
        }
      });
    });
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
