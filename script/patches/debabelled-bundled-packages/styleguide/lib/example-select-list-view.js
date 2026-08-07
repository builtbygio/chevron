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
var example_select_list_view_exports = {};
__export(example_select_list_view_exports, {
  default: () => ExampleSelectListView
});
module.exports = __toCommonJS(example_select_list_view_exports);
var import_atom_select_list = __toESM(require("atom-select-list"));
var import_etch = __toESM(require("etch"));
var import_dedent = __toESM(require("dedent"));
var import_code_block = __toESM(require("./code-block"));
class ExampleSelectListView {
  constructor() {
    this.jsExampleCode = import_dedent.default`
    import SelectListView from 'atom-select-list'

    const selectListView = new SelectListView({
      items: ['one', 'two', 'three'],
      elementForItem: (item) => {
        const li = document.createElement('li')
        li.textContent = item
        return li
      },
      didConfirmSelection: (item) => {
        console.log('confirmed', item)
      },
      didCancelSelection: () => {
        console.log('cancelled')
      }
    })
    `;
    import_etch.default.initialize(this);
  }
  elementForItem(item) {
    const li = document.createElement("li");
    li.textContent = item;
    return li;
  }
  didConfirmSelection(item) {
    console.log("confirmed", item);
  }
  didCancelSelection() {
    console.log("cancelled");
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "example" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "example-rendered" }, /* @__PURE__ */ import_etch.default.dom("atom-panel", { className: "modal" }, /* @__PURE__ */ import_etch.default.dom(
      import_atom_select_list.default,
      {
        items: ["one", "two", "three"],
        elementForItem: this.elementForItem.bind(this),
        onDidConfirmSelection: this.didConfirmSelection.bind(this),
        onDidCancelSelection: this.didCancelSelection.bind(this)
      }
    ))), /* @__PURE__ */ import_etch.default.dom("div", { className: "example-code show-example-space-pen" }, /* @__PURE__ */ import_etch.default.dom(import_code_block.default, { cssClass: "example-space-pen", grammarScopeName: "source.js", code: this.jsExampleCode })));
  }
  update() {
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
