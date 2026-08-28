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
var package_updates_status_view_exports = {};
__export(package_updates_status_view_exports, {
  default: () => PackageUpdatesStatusView
});
module.exports = __toCommonJS(package_updates_status_view_exports);
var import_underscore_plus = __toESM(require("underscore-plus"));
var import_atom = require("chevron");
class PackageUpdatesStatusView {
  initialize(statusBar, packageManager, updates) {
    this.statusBar = statusBar;
    this.updates = updates;
    this.destroyed = true;
    this.updatingPackages = [];
    this.failedUpdates = [];
    this.disposables = new import_atom.CompositeDisposable();
    this.element = document.createElement("div");
    this.element.classList.add("package-updates-status-view", "inline-block", "text", "text-info");
    const iconPackage = document.createElement("span");
    iconPackage.classList.add("icon", "icon-package");
    this.element.appendChild(iconPackage);
    this.countLabel = document.createElement("span");
    this.countLabel.classList.add("available-updates-status");
    this.element.appendChild(this.countLabel);
    this.disposables.add(packageManager.on("package-update-available theme-update-available", ({ pack, error }) => {
      this.onPackageUpdateAvailable(pack);
    }));
    this.disposables.add(packageManager.on("package-updating theme-updating", ({ pack, error }) => {
      this.onPackageUpdating(pack);
    }));
    this.disposables.add(packageManager.on("package-updated theme-updated package-uninstalled theme-uninstalled", ({ pack, error }) => {
      this.onPackageUpdated(pack);
    }));
    this.disposables.add(packageManager.on("package-update-failed theme-update-failed", ({ pack, error }) => {
      this.onPackageUpdateFailed(pack);
    }));
    const clickHandler = () => {
      chevron.commands.dispatch(chevron.views.getView(chevron.workspace), "settings-view:check-for-package-updates");
    };
    this.element.addEventListener("click", clickHandler);
    this.disposables.add(new import_atom.Disposable(() => {
      this.element.removeEventListener("click", clickHandler);
    }));
    this.updateTile();
  }
  destroy() {
    this.disposables.dispose();
    this.element.remove();
    if (this.tile) {
      this.tile.destroy();
      this.tile = null;
    }
    if (this.tooltip) {
      this.tooltip.dispose();
      this.tooltip = null;
    }
  }
  onPackageUpdateAvailable(pack) {
    for (const update of this.updates) {
      if (update.name === pack.name) {
        return;
      }
    }
    this.updates.push(pack);
    this.updateTile();
  }
  onPackageUpdating(pack) {
    for (let index = 0; index < this.failedUpdates.length; index++) {
      const update = this.failedUpdates[index];
      if (update.name === pack.name) {
        this.failedUpdates.splice(index, 1);
      }
    }
    this.updatingPackages.push(pack);
    this.updateTile();
  }
  onPackageUpdated(pack) {
    for (let index = 0; index < this.updates.length; index++) {
      const update = this.updates[index];
      if (update.name === pack.name) {
        this.updates.splice(index, 1);
      }
    }
    for (let index = 0; index < this.updatingPackages.length; index++) {
      const update = this.updatingPackages[index];
      if (update.name === pack.name) {
        this.updatingPackages.splice(index, 1);
      }
    }
    for (let index = 0; index < this.failedUpdates.length; index++) {
      const update = this.failedUpdates[index];
      if (update.name === pack.name) {
        this.failedUpdates.splice(index, 1);
      }
    }
    this.updateTile();
  }
  onPackageUpdateFailed(pack) {
    for (const update of this.failedUpdates) {
      if (update.name === pack.name) {
        return;
      }
    }
    for (let index = 0; index < this.updatingPackages.length; index++) {
      const update = this.updatingPackages[index];
      if (update.name === pack.name) {
        this.updatingPackages.splice(index, 1);
      }
    }
    this.failedUpdates.push(pack);
    this.updateTile();
  }
  updateTile() {
    if (this.updates.length) {
      if (this.tooltip) {
        this.tooltip.dispose();
        this.tooltip = null;
      }
      if (this.destroyed) {
        this.tile = this.statusBar.addRightTile({ item: this, priority: -99 });
        this.destroyed = false;
      }
      let labelText = `${import_underscore_plus.default.pluralize(this.updates.length, "update")}`;
      let tooltipText = `${import_underscore_plus.default.pluralize(this.updates.length, "package update")} available`;
      if (this.updatingPackages.length) {
        labelText = `${this.updatingPackages.length}/${this.updates.length} updating`;
        tooltipText += `, ${import_underscore_plus.default.pluralize(this.updatingPackages.length, "package")} currently updating`;
      }
      if (this.failedUpdates.length) {
        labelText += ` (${this.failedUpdates.length} failed)`;
        tooltipText += `, ${import_underscore_plus.default.pluralize(this.failedUpdates.length, "failed update")}`;
      }
      this.countLabel.textContent = labelText;
      this.tooltip = chevron.tooltips.add(this.element, { title: tooltipText });
    } else if (!this.destroyed) {
      this.tile.destroy();
      this.tile = null;
      this.destroyed = true;
    }
  }
}
