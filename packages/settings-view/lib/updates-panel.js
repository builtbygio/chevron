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
var updates_panel_exports = {};
__export(updates_panel_exports, {
  default: () => UpdatesPanel
});
module.exports = __toCommonJS(updates_panel_exports);
var import_atom = require("chevron");
var import_queue = __toESM(require("async/queue"));
var import_etch = __toESM(require("etch"));
var import_error_view = __toESM(require("./error-view"));
var import_package_card = __toESM(require("./package-card"));
class UpdatesPanel {
  constructor(settingsView, packageManager) {
    this.settingsView = settingsView;
    this.packageManager = packageManager;
    this.disposables = new import_atom.CompositeDisposable();
    this.updatingPackages = [];
    this.packageCards = [];
    import_etch.default.initialize(this);
    this.refs.updateAllButton.style.display = "none";
    this.checkForUpdates();
    this.disposables.add(chevron.commands.add(this.element, {
      "core:move-up": () => {
        this.scrollUp();
      },
      "core:move-down": () => {
        this.scrollDown();
      },
      "core:page-up": () => {
        this.pageUp();
      },
      "core:page-down": () => {
        this.pageDown();
      },
      "core:move-to-top": () => {
        this.scrollToTop();
      },
      "core:move-to-bottom": () => {
        this.scrollToBottom();
      }
    }));
    this.disposables.add(this.packageManager.on("package-updating theme-updating", ({ pack, error }) => {
      this.refs.checkButton.disabled = true;
      this.updatingPackages.push(pack);
    }));
    this.disposables.add(
      this.packageManager.on("package-updated theme-updated package-update-failed theme-update-failed", ({ pack, error }) => {
        if (error != null) {
          this.refs.updateErrors.appendChild(new import_error_view.default(this.packageManager, error).element);
        }
        for (let i = 0; i < this.updatingPackages.length; i++) {
          const update = this.updatingPackages[i];
          if (update.name === pack.name) {
            this.updatingPackages.splice(i, 1);
          }
        }
        if (!this.updatingPackages.length) {
          this.refs.checkButton.disabled = false;
        }
      })
    );
  }
  destroy() {
    this.clearPackageCards();
    this.disposables.dispose();
    return import_etch.default.destroy(this);
  }
  update() {
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { tabIndex: "0", className: "panels-item" }, /* @__PURE__ */ import_etch.default.dom("section", { className: "section packages" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-container updates-container" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "updates-heading-container" }, /* @__PURE__ */ import_etch.default.dom("h1", { className: "section-heading icon icon-cloud-download" }, "Available Updates"), /* @__PURE__ */ import_etch.default.dom("div", { className: "section-heading updates-btn-group" }, /* @__PURE__ */ import_etch.default.dom(
      "button",
      {
        ref: "checkButton",
        className: "update-all-button btn",
        onclick: () => {
          this.checkForUpdates(true);
        }
      },
      "Check for Updates"
    ), /* @__PURE__ */ import_etch.default.dom(
      "button",
      {
        ref: "updateAllButton",
        className: "update-all-button btn btn-primary",
        onclick: () => {
          this.updateAll();
        }
      },
      "Update All"
    ))), /* @__PURE__ */ import_etch.default.dom("div", { ref: "versionPinnedPackagesMessage", className: "alert alert-warning icon icon-alert" }, "The following packages are pinned to their current version and are not being checked for updates: ", /* @__PURE__ */ import_etch.default.dom("strong", null, this.packageManager.getVersionPinnedPackages().join(", "))), /* @__PURE__ */ import_etch.default.dom("div", { ref: "updateErrors" }), /* @__PURE__ */ import_etch.default.dom("div", { ref: "checkingMessage", className: "alert alert-info icon icon-hourglass" }, `Checking for updates…`), /* @__PURE__ */ import_etch.default.dom("div", { ref: "noUpdatesMessage", className: "alert alert-info icon icon-heart" }, "All of your installed packages are up to date!"), /* @__PURE__ */ import_etch.default.dom("div", { ref: "updatesContainer", className: "container package-container" }))));
  }
  focus() {
    this.element.focus();
  }
  show() {
    this.element.style.display = "";
  }
  beforeShow(opts) {
    if (opts && opts.back) {
      this.refs.breadcrumb.textContent = opts.back;
      this.refs.breadcrumb.onclick = () => {
        this.settingsView.showPanel(opts.back);
      };
    }
    if (opts && opts.updates) {
      this.availableUpdates = opts.updates;
      this.addUpdateViews();
    } else {
      this.availableUpdates = [];
      this.clearPackageCards();
      this.checkForUpdates();
    }
    if (this.packageManager.getVersionPinnedPackages().length === 0) {
      this.refs.versionPinnedPackagesMessage.style.display = "none";
    }
  }
  // Check for updates and display them
  async checkForUpdates(clearCache) {
    this.refs.noUpdatesMessage.style.display = "none";
    this.refs.updateAllButton.disabled = true;
    this.refs.checkButton.disabled = true;
    this.refs.checkingMessage.style.display = "";
    try {
      this.availableUpdates = await this.packageManager.getOutdated(clearCache);
      this.refs.checkButton.disabled = false;
      this.addUpdateViews();
    } catch (error) {
      this.refs.checkButton.disabled = false;
      this.refs.checkingMessage.style.display = "none";
      this.refs.updateErrors.appendChild(new import_error_view.default(this.packageManager, error).element);
    }
  }
  addUpdateViews() {
    if (this.availableUpdates.length > 0) {
      this.refs.updateAllButton.style.display = "";
      this.refs.updateAllButton.disabled = false;
    }
    this.refs.checkingMessage.style.display = "none";
    this.clearPackageCards();
    if (this.availableUpdates.length === 0) {
      this.refs.noUpdatesMessage.style.display = "";
    }
    for (const pack of this.availableUpdates) {
      const packageCard = new import_package_card.default(pack, this.settingsView, this.packageManager, { back: "Updates" });
      this.refs.updatesContainer.appendChild(packageCard.element);
      this.packageCards.push(packageCard);
    }
  }
  async updateAll() {
    this.refs.checkButton.disabled = true;
    this.refs.updateAllButton.disabled = true;
    let updatingPackages = this.updatingPackages;
    let successfulUpdatesCount = 0;
    let failedUpdatesCount = 0;
    const concurrency = chevron.config.get("settings-view.packageUpdateConcurrency") > 0 ? chevron.config.get("settings-view.packageUpdateConcurrency") : Number.POSITIVE_INFINITY;
    const queue = (0, import_queue.default)(function(packageCard, callback) {
      const onUpdateCompleted = function(err) {
        err == null ? successfulUpdatesCount++ : failedUpdatesCount++;
      };
      if (updatingPackages.includes(packageCard.pack)) {
        callback();
      } else {
        packageCard.update().then(onUpdateCompleted, onUpdateCompleted).then(callback);
      }
    }, concurrency);
    queue.push(this.packageCards);
    await queue.drain();
    if (successfulUpdatesCount > 0) {
      const message = `Restart Chevron to complete the update of ${successfulUpdatesCount} ${pluralize("package", successfulUpdatesCount)}:`;
      let detail = "";
      this.packageCards.forEach((card) => {
        let oldVersion = "";
        let newVersion = "";
        if (card.pack.apmInstallSource && card.pack.apmInstallSource.type === "git") {
          oldVersion = card.pack.apmInstallSource.sha.substr(0, 8);
          newVersion = `${card.pack.latestSha.substr(0, 8)}`;
        } else if (card.pack.version && card.pack.latestVersion) {
          oldVersion = card.pack.version;
          newVersion = card.pack.latestVersion;
        }
        if (oldVersion && newVersion) {
          detail += `${card.pack.name}@${oldVersion} -> ${newVersion}
`;
        }
      });
      detail = detail.trim();
      const notification = chevron.notifications.addSuccess(message, {
        dismissable: true,
        buttons: [
          {
            text: "Restart now",
            onDidClick() {
              return chevron.restartApplication();
            }
          },
          {
            text: "I'll do it later",
            onDidClick() {
              notification.dismiss();
            }
          }
        ],
        detail
      });
    }
    if (failedUpdatesCount === 0) {
      this.refs.checkButton.disabled = false;
      this.refs.updateAllButton.style.display = "none";
    } else {
      this.refs.checkButton.disabled = false;
      this.refs.updateAllButton.disabled = false;
    }
  }
  clearPackageCards() {
    while (this.packageCards.length) {
      this.packageCards.pop().destroy();
    }
  }
  scrollUp() {
    this.element.scrollTop -= document.body.offsetHeight / 20;
  }
  scrollDown() {
    this.element.scrollTop += document.body.offsetHeight / 20;
  }
  pageUp() {
    this.element.scrollTop -= this.element.offsetHeight;
  }
  pageDown() {
    this.element.scrollTop += this.element.offsetHeight;
  }
  scrollToTop() {
    this.element.scrollTop = 0;
  }
  scrollToBottom() {
    this.element.scrollTop = this.element.scrollHeight;
  }
}
function pluralize(word, count) {
  return count > 1 ? `${word}s` : word;
}
