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
var package_grammars_view_exports = {};
__export(package_grammars_view_exports, {
  default: () => PackageGrammarsView
});
module.exports = __toCommonJS(package_grammars_view_exports);
var import_path = __toESM(require("path"));
var import_atom = require("chevron");
var import_settings_panel = __toESM(require("./settings-panel"));
class PackageGrammarsView {
  constructor(packagePath) {
    this.element = document.createElement("section");
    this.element.classList.add("package-grammars");
    this.grammarSettings = document.createElement("div");
    this.element.appendChild(this.grammarSettings);
    this.disposables = new import_atom.CompositeDisposable();
    this.packagePath = import_path.default.join(packagePath, import_path.default.sep);
    this.addGrammars();
    this.disposables.add(chevron.grammars.onDidAddGrammar(() => this.addGrammars()));
    this.disposables.add(chevron.grammars.onDidUpdateGrammar(() => this.addGrammars()));
  }
  destroy() {
    this.disposables.dispose();
    this.element.remove();
  }
  getPackageGrammars() {
    const packageGrammars = [];
    const grammars = chevron.grammars.grammars != null ? chevron.grammars.grammars : [];
    for (let grammar of grammars) {
      if (grammar.path) {
        if (grammar.path.indexOf(this.packagePath) === 0) {
          packageGrammars.push(grammar);
        }
      }
    }
    return packageGrammars.sort(function(grammar1, grammar2) {
      const name1 = grammar1.name || grammar1.scopeName || "";
      const name2 = grammar2.name || grammar2.scopeName || "";
      return name1.localeCompare(name2);
    });
  }
  addGrammarHeading(grammar, panel) {
    const container = document.createElement("div");
    container.classList.add("native-key-bindings", "text");
    container.tabIndex = -1;
    const grammarScope = document.createElement("div");
    grammarScope.classList.add("grammar-scope");
    const scopeStrong = document.createElement("strong");
    scopeStrong.textContent = "Scope: ";
    grammarScope.appendChild(scopeStrong);
    const scopeSpan = document.createElement("span");
    scopeSpan.textContent = grammar.scopeName != null ? grammar.scopeName : "";
    grammarScope.appendChild(scopeSpan);
    container.appendChild(grammarScope);
    const grammarFileTypes = document.createElement("div");
    grammarFileTypes.classList.add("grammar-filetypes");
    const fileTypesStrong = document.createElement("strong");
    fileTypesStrong.textContent = "File Types: ";
    grammarFileTypes.appendChild(fileTypesStrong);
    const fileTypes = grammar.fileTypes || [];
    const fileTypesSpan = document.createElement("span");
    fileTypesSpan.textContent = fileTypes.join(", ");
    grammarFileTypes.appendChild(fileTypesSpan);
    container.appendChild(grammarFileTypes);
    const sectionBody = panel.element.querySelector(".section-body");
    sectionBody.parentElement.insertBefore(container, sectionBody);
  }
  addGrammars() {
    this.grammarSettings.innerHTML = "";
    for (let grammar of this.getPackageGrammars()) {
      let { scopeName, name } = grammar;
      if (!scopeName || !name) {
        continue;
      }
      if (!scopeName.startsWith(".")) {
        scopeName = `.${scopeName}`;
      }
      const title = `${name} Grammar`;
      const panel = new import_settings_panel.default({ title, scopeName, icon: "puzzle" });
      this.addGrammarHeading(grammar, panel);
      this.grammarSettings.appendChild(panel.element);
    }
  }
}
