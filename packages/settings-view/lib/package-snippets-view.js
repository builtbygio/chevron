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
var package_snippets_view_exports = {};
__export(package_snippets_view_exports, {
  default: () => PackageSnippetsView
});
module.exports = __toCommonJS(package_snippets_view_exports);
var import_path = __toESM(require("path"));
var import_underscore_plus = __toESM(require("underscore-plus"));
var import_etch = __toESM(require("etch"));
var import_atom = require("chevron");
class PackageSnippetsView {
  constructor(pack, snippetsProvider) {
    this.pack = pack;
    this.namespace = this.pack.name;
    this.snippetsProvider = snippetsProvider;
    this.packagePath = import_path.default.join(pack.path, import_path.default.sep);
    import_etch.default.initialize(this);
    this.disposables = new import_atom.CompositeDisposable();
    this.updateSnippetsView();
    const packagesWithSnippetsDisabled = chevron.config.get("core.packagesWithSnippetsDisabled") || [];
    this.refs.snippetToggle.checked = !packagesWithSnippetsDisabled.includes(this.namespace);
    const changeHandler = (event) => {
      event.stopPropagation();
      const value = this.refs.snippetToggle.checked;
      if (value) {
        chevron.config.removeAtKeyPath("core.packagesWithSnippetsDisabled", this.namespace);
      } else {
        chevron.config.pushAtKeyPath("core.packagesWithSnippetsDisabled", this.namespace);
      }
      this.updateSnippetsView();
    };
    this.refs.snippetToggle.addEventListener("change", changeHandler);
    this.disposables.add(new import_atom.Disposable(() => {
      this.refs.snippetToggle.removeEventListener("change", changeHandler);
    }));
  }
  destroy() {
    this.disposables.dispose();
    return import_etch.default.destroy(this);
  }
  update() {
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("section", { className: "section" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-heading icon icon-code" }, "Snippets"), /* @__PURE__ */ import_etch.default.dom("div", { className: "checkbox" }, /* @__PURE__ */ import_etch.default.dom("label", { for: "toggleSnippets" }, /* @__PURE__ */ import_etch.default.dom("input", { id: "toggleSnippets", className: "input-checkbox", type: "checkbox", ref: "snippetToggle" }), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-title" }, "Enable")), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-description" }, "Disable this if you want to prevent this package’s snippets from appearing as suggestions or if you want to customize them in your snippets file.")), /* @__PURE__ */ import_etch.default.dom("table", { className: "package-snippets-table table native-key-bindings text", tabIndex: -1 }, /* @__PURE__ */ import_etch.default.dom("thead", null, /* @__PURE__ */ import_etch.default.dom("tr", null, /* @__PURE__ */ import_etch.default.dom("th", null, "Trigger"), /* @__PURE__ */ import_etch.default.dom("th", null, "Name"), /* @__PURE__ */ import_etch.default.dom("th", null, "Scope"), /* @__PURE__ */ import_etch.default.dom("th", null, "Body"))), /* @__PURE__ */ import_etch.default.dom("tbody", { ref: "snippets" })));
  }
  getSnippetProperties() {
    const packageProperties = {};
    for (const { name, properties, selectorString } of this.snippetsProvider.getSnippets()) {
      if (name && name.indexOf && name.indexOf(this.packagePath) === 0) {
        const object = properties.snippets != null ? properties.snippets : {};
        for (let key in object) {
          const snippet = object[key];
          if (snippet != null) {
            snippet.selectorString = selectorString;
            if (packageProperties[key] == null) {
              packageProperties[key] = snippet;
            }
          }
        }
      }
    }
    return import_underscore_plus.default.values(packageProperties).sort((snippet1, snippet2) => {
      const prefix1 = snippet1.prefix != null ? snippet1.prefix : "";
      const prefix2 = snippet2.prefix != null ? snippet2.prefix : "";
      return prefix1.localeCompare(prefix2);
    });
  }
  getSnippets(callback) {
    const snippetsPackage = chevron.packages.getLoadedPackage("snippets");
    const snippetsModule = snippetsPackage ? snippetsPackage.mainModule : null;
    if (snippetsModule) {
      if (snippetsModule.loaded) {
        callback(this.getSnippetProperties());
      } else {
        snippetsModule.onDidLoadSnippets(() => callback(this.getSnippetProperties()));
      }
    } else {
      callback([]);
    }
  }
  updateSnippetsView() {
    const packagesWithSnippetsDisabled = chevron.config.get("core.packagesWithSnippetsDisabled") || [];
    const snippetsDisabled = packagesWithSnippetsDisabled.includes(this.namespace);
    this.getSnippets((snippets) => {
      this.refs.snippets.innerHTML = "";
      if (snippetsDisabled) {
        this.refs.snippets.classList.add("text-subtle");
      } else {
        this.refs.snippets.classList.remove("text-subtle");
      }
      for (let { body, bodyText, name, prefix, selectorString } of snippets) {
        if (name == null) {
          name = "";
        }
        if (prefix == null) {
          prefix = "";
        }
        if (body == null) {
          body = bodyText || "";
        }
        if (selectorString == null) {
          selectorString = "";
        }
        const row = document.createElement("tr");
        const prefixTd = document.createElement("td");
        prefixTd.classList.add("snippet-prefix");
        prefixTd.textContent = prefix;
        row.appendChild(prefixTd);
        const nameTd = document.createElement("td");
        nameTd.textContent = name;
        row.appendChild(nameTd);
        const scopeTd = document.createElement("td");
        scopeTd.classList.add("snippet-scope-name");
        scopeTd.textContent = selectorString;
        row.appendChild(scopeTd);
        const bodyTd = document.createElement("td");
        bodyTd.classList.add("snippet-body");
        row.appendChild(bodyTd);
        this.refs.snippets.appendChild(row);
        this.createButtonsForSnippetRow(bodyTd, { body, prefix, scope: selectorString, name });
      }
      if (this.refs.snippets.children.length > 0) {
        this.element.style.display = "";
      } else {
        this.element.style.display = "none";
      }
    });
  }
  createButtonsForSnippetRow(td, { scope, body, name, prefix }) {
    let buttonContainer = document.createElement("div");
    buttonContainer.classList.add("btn-group", "btn-group-xs");
    let viewButton = document.createElement("button");
    let copyButton = document.createElement("button");
    viewButton.setAttribute("type", "button");
    viewButton.textContent = "View";
    viewButton.classList.add("btn", "snippet-view-btn");
    let tooltip = chevron.tooltips.add(viewButton, {
      title: body,
      html: false,
      trigger: "click",
      placement: "auto left",
      "class": "snippet-body-tooltip"
    });
    this.disposables.add(tooltip);
    copyButton.setAttribute("type", "button");
    copyButton.textContent = "Copy";
    copyButton.classList.add("btn", "snippet-copy-btn");
    copyButton.addEventListener("click", (event) => {
      event.preventDefault();
      return this.writeSnippetToClipboard({ scope, body, name, prefix });
    });
    buttonContainer.appendChild(viewButton);
    buttonContainer.appendChild(copyButton);
    td.appendChild(buttonContainer);
  }
  writeSnippetToClipboard({ scope, body, name, prefix }) {
    let content;
    const extension = import_path.default.extname(this.snippetsProvider.getUserSnippetsPath());
    body = body.replace(/\n/g, "\\n").replace(/\t/g, "\\t");
    if (extension === ".json") {
      body = body.replace(/'/g, `\\'`);
      content = `
'${scope}':
  '${name}':
    'prefix': '${prefix}'
    'body': '${body}'
`;
    } else {
      body = body.replace(/"/g, `\\"`);
      content = `
  "${scope}": {
    "${name}": {
      "prefix": "${prefix}",
      "body": "${body}"
    }
  }
`;
    }
    chevron.clipboard.write(content);
  }
}
