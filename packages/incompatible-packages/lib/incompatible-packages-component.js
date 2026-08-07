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
var incompatible_packages_component_exports = {};
__export(incompatible_packages_component_exports, {
  default: () => IncompatiblePackagesComponent
});
module.exports = __toCommonJS(incompatible_packages_component_exports);
var import_etch = __toESM(require("etch"));
var import_view_uri = __toESM(require("./view-uri"));
const REBUILDING = "rebuilding";
const REBUILD_FAILED = "rebuild-failed";
const REBUILD_SUCCEEDED = "rebuild-succeeded";
class IncompatiblePackagesComponent {
  constructor(packageManager) {
    this.rebuildStatuses = /* @__PURE__ */ new Map();
    this.rebuildFailureOutputs = /* @__PURE__ */ new Map();
    this.rebuildInProgress = false;
    this.rebuiltPackageCount = 0;
    this.packageManager = packageManager;
    this.loaded = false;
    import_etch.default.initialize(this);
    if (this.packageManager.getActivePackages().length > 0) {
      this.populateIncompatiblePackages();
    } else {
      global.setImmediate(this.populateIncompatiblePackages.bind(this));
    }
    this.element.addEventListener("click", (event) => {
      if (event.target === this.refs.rebuildButton) {
        this.rebuildIncompatiblePackages();
      } else if (event.target === this.refs.reloadButton) {
        atom.reload();
      } else if (event.target.classList.contains("view-settings")) {
        atom.workspace.open(
          `atom://config/packages/${event.target.package.name}`
        );
      }
    });
  }
  update() {
  }
  render() {
    if (!this.loaded) {
      return /* @__PURE__ */ import_etch.default.dom("div", { className: "incompatible-packages padded" }, "Loading...");
    }
    return /* @__PURE__ */ import_etch.default.dom(
      "div",
      {
        className: "incompatible-packages padded native-key-bindings",
        tabIndex: "-1"
      },
      this.renderHeading(),
      this.renderIncompatiblePackageList()
    );
  }
  renderHeading() {
    if (this.incompatiblePackages.length > 0) {
      if (this.rebuiltPackageCount > 0) {
        let alertClass = this.rebuiltPackageCount === this.incompatiblePackages.length ? "alert-success icon-check" : "alert-warning icon-bug";
        return /* @__PURE__ */ import_etch.default.dom("div", { className: "alert icon " + alertClass }, this.rebuiltPackageCount, " of ", this.incompatiblePackages.length, " ", "packages were rebuilt successfully. Reload Atom to activate them.", /* @__PURE__ */ import_etch.default.dom("button", { ref: "reloadButton", className: "btn pull-right" }, "Reload Atom"));
      } else {
        return /* @__PURE__ */ import_etch.default.dom("div", { className: "alert alert-danger icon icon-bug" }, "Some installed packages could not be loaded because they contain native modules that were compiled for an earlier version of Atom.", /* @__PURE__ */ import_etch.default.dom(
          "button",
          {
            ref: "rebuildButton",
            className: "btn pull-right",
            disabled: this.rebuildInProgress
          },
          "Rebuild Packages"
        ));
      }
    } else {
      return /* @__PURE__ */ import_etch.default.dom("div", { className: "alert alert-success icon icon-check" }, "None of your packages contain incompatible native modules.");
    }
  }
  renderIncompatiblePackageList() {
    return /* @__PURE__ */ import_etch.default.dom("div", null, this.incompatiblePackages.map(
      this.renderIncompatiblePackage.bind(this)
    ));
  }
  renderIncompatiblePackage(pack) {
    let rebuildStatus = this.rebuildStatuses.get(pack);
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "incompatible-package" }, this.renderRebuildStatusIndicator(rebuildStatus), /* @__PURE__ */ import_etch.default.dom(
      "button",
      {
        className: "btn view-settings icon icon-gear pull-right",
        package: pack
      },
      "Package Settings"
    ), /* @__PURE__ */ import_etch.default.dom("h4", { className: "heading" }, pack.name, " ", pack.metadata.version), rebuildStatus ? this.renderRebuildOutput(pack) : this.renderIncompatibleModules(pack));
  }
  renderRebuildStatusIndicator(rebuildStatus) {
    if (rebuildStatus === REBUILDING) {
      return /* @__PURE__ */ import_etch.default.dom("div", { className: "badge badge-info pull-right icon icon-gear" }, "Rebuilding");
    } else if (rebuildStatus === REBUILD_SUCCEEDED) {
      return /* @__PURE__ */ import_etch.default.dom("div", { className: "badge badge-success pull-right icon icon-check" }, "Rebuild Succeeded");
    } else if (rebuildStatus === REBUILD_FAILED) {
      return /* @__PURE__ */ import_etch.default.dom("div", { className: "badge badge-error pull-right icon icon-x" }, "Rebuild Failed");
    } else {
      return "";
    }
  }
  renderRebuildOutput(pack) {
    if (this.rebuildStatuses.get(pack) === REBUILD_FAILED) {
      return /* @__PURE__ */ import_etch.default.dom("pre", null, this.rebuildFailureOutputs.get(pack));
    } else {
      return "";
    }
  }
  renderIncompatibleModules(pack) {
    return /* @__PURE__ */ import_etch.default.dom("ul", null, pack.incompatibleModules.map((nativeModule) => /* @__PURE__ */ import_etch.default.dom("li", null, /* @__PURE__ */ import_etch.default.dom("div", { className: "icon icon-file-binary" }, nativeModule.name, "@", nativeModule.version || "unknown", " –", " ", /* @__PURE__ */ import_etch.default.dom("span", { className: "text-warning" }, nativeModule.error)))));
  }
  populateIncompatiblePackages() {
    this.incompatiblePackages = this.packageManager.getLoadedPackages().filter((pack) => !pack.isCompatible());
    for (let pack of this.incompatiblePackages) {
      let buildFailureOutput = pack.getBuildFailureOutput();
      if (buildFailureOutput) {
        this.setPackageStatus(pack, REBUILD_FAILED);
        this.setRebuildFailureOutput(pack, buildFailureOutput);
      }
    }
    this.loaded = true;
    import_etch.default.update(this);
  }
  async rebuildIncompatiblePackages() {
    this.rebuildInProgress = true;
    let rebuiltPackageCount = 0;
    for (let pack of this.incompatiblePackages) {
      this.setPackageStatus(pack, REBUILDING);
      let { code, stderr } = await pack.rebuild();
      if (code === 0) {
        this.setPackageStatus(pack, REBUILD_SUCCEEDED);
        rebuiltPackageCount++;
      } else {
        this.setRebuildFailureOutput(pack, stderr);
        this.setPackageStatus(pack, REBUILD_FAILED);
      }
    }
    this.rebuildInProgress = false;
    this.rebuiltPackageCount = rebuiltPackageCount;
    import_etch.default.update(this);
  }
  setPackageStatus(pack, status) {
    this.rebuildStatuses.set(pack, status);
    import_etch.default.update(this);
  }
  setRebuildFailureOutput(pack, output) {
    this.rebuildFailureOutputs.set(pack, output);
    import_etch.default.update(this);
  }
  getTitle() {
    return "Incompatible Packages";
  }
  getURI() {
    return import_view_uri.default;
  }
  getIconName() {
    return "package";
  }
  serialize() {
    return { deserializer: "IncompatiblePackagesComponent" };
  }
}
