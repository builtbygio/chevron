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
var package_detail_view_exports = {};
__export(package_detail_view_exports, {
  default: () => PackageDetailView
});
module.exports = __toCommonJS(package_detail_view_exports);
var import_path = __toESM(require("path"));
var import_url = __toESM(require("url"));
var import_underscore_plus = __toESM(require("underscore-plus"));
var import_fs_plus = __toESM(require("fs-plus"));
var import_atom = require("chevron");
var import_etch = __toESM(require("etch"));
var import_package_card = __toESM(require("./package-card"));
var import_package_grammars_view = __toESM(require("./package-grammars-view"));
var import_package_keymap_view = __toESM(require("./package-keymap-view"));
var import_package_readme_view = __toESM(require("./package-readme-view"));
var import_package_snippets_view = __toESM(require("./package-snippets-view"));
var import_settings_panel = __toESM(require("./settings-panel"));
const NORMALIZE_PACKAGE_DATA_README_ERROR = "ERROR: No README data found!";
class PackageDetailView {
  constructor(pack, settingsView, packageManager, snippetsProvider) {
    this.pack = pack;
    this.settingsView = settingsView;
    this.packageManager = packageManager;
    this.snippetsProvider = snippetsProvider;
    this.disposables = new import_atom.CompositeDisposable();
    import_etch.default.initialize(this);
    this.loadPackage();
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
    const packageRepoClickHandler = (event) => {
      event.preventDefault();
      const repoUrl = this.packageManager.getRepositoryUrl(this.pack);
      if (typeof repoUrl === "string") {
        if (import_url.default.parse(repoUrl).pathname === "/atom/atom") {
          chevron.applicationDelegate.openExternal(`${repoUrl}/tree/master/packages/${this.pack.name}`);
        } else {
          chevron.applicationDelegate.openExternal(repoUrl);
        }
      }
    };
    this.refs.packageRepo.addEventListener("click", packageRepoClickHandler);
    this.disposables.add(new import_atom.Disposable(() => {
      this.refs.packageRepo.removeEventListener("click", packageRepoClickHandler);
    }));
    const issueButtonClickHandler = (event) => {
      event.preventDefault();
      let bugUri = this.packageManager.getRepositoryBugUri(this.pack);
      if (bugUri) {
        chevron.applicationDelegate.openExternal(bugUri);
      }
    };
    this.refs.issueButton.addEventListener("click", issueButtonClickHandler);
    this.disposables.add(new import_atom.Disposable(() => {
      this.refs.issueButton.removeEventListener("click", issueButtonClickHandler);
    }));
    const changelogButtonClickHandler = (event) => {
      event.preventDefault();
      if (this.changelogPath) {
        this.openMarkdownFile(this.changelogPath);
      }
    };
    this.refs.changelogButton.addEventListener("click", changelogButtonClickHandler);
    this.disposables.add(new import_atom.Disposable(() => {
      this.refs.changelogButton.removeEventListener("click", changelogButtonClickHandler);
    }));
    const licenseButtonClickHandler = (event) => {
      event.preventDefault();
      if (this.licensePath) {
        this.openMarkdownFile(this.licensePath);
      }
    };
    this.refs.licenseButton.addEventListener("click", licenseButtonClickHandler);
    this.disposables.add(new import_atom.Disposable(() => {
      this.refs.licenseButton.removeEventListener("click", licenseButtonClickHandler);
    }));
    const openButtonClickHandler = (event) => {
      event.preventDefault();
      if (import_fs_plus.default.existsSync(this.pack.path)) {
        chevron.open({ pathsToOpen: [this.pack.path] });
      }
    };
    this.refs.openButton.addEventListener("click", openButtonClickHandler);
    this.disposables.add(new import_atom.Disposable(() => {
      this.refs.openButton.removeEventListener("click", openButtonClickHandler);
    }));
    const learnMoreButtonClickHandler = (event) => {
      event.preventDefault();
      chevron.applicationDelegate.openExternal(`https://packages.pulsar-edit.dev/packages/${this.pack.name}`);
    };
    this.refs.learnMoreButton.addEventListener("click", learnMoreButtonClickHandler);
    this.disposables.add(new import_atom.Disposable(() => {
      this.refs.learnMoreButton.removeEventListener("click", learnMoreButtonClickHandler);
    }));
    const breadcrumbClickHandler = (event) => {
      event.preventDefault();
      this.settingsView.showPanel(this.breadcrumbBackPanel);
    };
    this.refs.breadcrumb.addEventListener("click", breadcrumbClickHandler);
    this.disposables.add(new import_atom.Disposable(() => {
      this.refs.breadcrumb.removeEventListener("click", breadcrumbClickHandler);
    }));
  }
  completeInitialization() {
    if (this.refs.packageCard) {
      this.packageCard = this.refs.packageCard.packageCard;
    } else if (!this.packageCard) {
      this.packageCard = new import_package_card.default(this.pack.metadata, this.settingsView, this.packageManager, { onSettingsView: true });
      this.refs.packageCardParent.replaceChild(this.packageCard.element, this.refs.loadingMessage);
    }
    this.refs.packageRepo.classList.remove("hidden");
    this.refs.startupTime.classList.remove("hidden");
    this.refs.buttons.classList.remove("hidden");
    this.activateConfig();
    this.populate();
    this.updateFileButtons();
    this.subscribeToPackageManager();
    this.renderReadme();
  }
  loadPackage() {
    const loadedPackage = chevron.packages.getLoadedPackage(this.pack.name);
    if (loadedPackage) {
      this.pack = loadedPackage;
      this.completeInitialization();
    } else {
      if (!this.pack.metadata || !this.pack.metadata.owner) {
        this.fetchPackage();
      } else {
        this.completeInitialization();
      }
    }
  }
  fetchPackage() {
    this.showLoadingMessage();
    this.packageManager.getClient().package(this.pack.name, (err, packageData) => {
      if (err || !packageData || !packageData.name) {
        this.hideLoadingMessage();
        this.showErrorMessage();
      } else {
        this.pack = packageData;
        this.pack.metadata = import_underscore_plus.default.extend(this.pack.metadata != null ? this.pack.metadata : {}, this.pack);
        this.completeInitialization();
      }
    });
  }
  showLoadingMessage() {
    this.refs.loadingMessage.classList.remove("hidden");
  }
  hideLoadingMessage() {
    this.refs.loadingMessage.classList.add("hidden");
  }
  showErrorMessage() {
    this.refs.errorMessage.classList.remove("hidden");
  }
  hideErrorMessage() {
    this.refs.errorMessage.classList.add("hidden");
  }
  activateConfig() {
    if (chevron.packages.isPackageLoaded(this.pack.name) && !chevron.packages.isPackageActive(this.pack.name)) {
      this.pack.activateConfig();
    }
  }
  destroy() {
    if (this.settingsPanel) {
      this.settingsPanel.destroy();
      this.settingsPanel = null;
    }
    if (this.keymapView) {
      this.keymapView.destroy();
      this.keymapView = null;
    }
    if (this.grammarsView) {
      this.grammarsView.destroy();
      this.grammarsView = null;
    }
    if (this.snippetsView) {
      this.snippetsView.destroy();
      this.snippetsView = null;
    }
    if (this.readmeView) {
      this.readmeView.destroy();
      this.readmeView = null;
    }
    if (this.packageCard) {
      this.packageCard.destroy();
      this.packageCard = null;
    }
    this.disposables.dispose();
    return import_etch.default.destroy(this);
  }
  update() {
  }
  beforeShow(opts) {
    if (opts.back == null) {
      opts.back = "Install";
    }
    this.breadcrumbBackPanel = opts.back;
    this.refs.breadcrumb.textContent = this.breadcrumbBackPanel;
  }
  show() {
    this.element.style.display = "";
  }
  focus() {
    this.element.focus();
  }
  render() {
    let packageCardView;
    if (this.pack && this.pack.metadata && this.pack.metadata.owner) {
      packageCardView = /* @__PURE__ */ import_etch.default.dom("div", { ref: "packageCardParent", className: "row" }, /* @__PURE__ */ import_etch.default.dom(
        PackageCardComponent,
        {
          ref: "packageCard",
          settingsView: this.settingsView,
          packageManager: this.packageManager,
          metadata: this.pack.metadata,
          options: { onSettingsView: true }
        }
      ));
    } else {
      packageCardView = /* @__PURE__ */ import_etch.default.dom("div", { ref: "packageCardParent", className: "row" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "loadingMessage", className: "alert alert-info icon icon-hourglass" }, `Loading ${this.pack.name}…`), /* @__PURE__ */ import_etch.default.dom("div", { ref: "errorMessage", className: "alert alert-danger icon icon-hourglass hidden" }, "Failed to load ", this.pack.name, " - try again later."));
    }
    return /* @__PURE__ */ import_etch.default.dom("div", { tabIndex: "0", className: "package-detail" }, /* @__PURE__ */ import_etch.default.dom("ol", { ref: "breadcrumbContainer", className: "native-key-bindings breadcrumb", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("li", null, /* @__PURE__ */ import_etch.default.dom("a", { ref: "breadcrumb" })), /* @__PURE__ */ import_etch.default.dom("li", { className: "active" }, /* @__PURE__ */ import_etch.default.dom("a", { ref: "title" }))), /* @__PURE__ */ import_etch.default.dom("div", { className: "panels-item" }, /* @__PURE__ */ import_etch.default.dom("section", { className: "section" }, /* @__PURE__ */ import_etch.default.dom("form", { className: "section-container package-detail-view" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "container package-container" }, packageCardView), /* @__PURE__ */ import_etch.default.dom("p", { ref: "packageRepo", className: "link icon icon-repo repo-link hidden" }), /* @__PURE__ */ import_etch.default.dom("p", { ref: "startupTime", className: "text icon icon-dashboard hidden", tabIndex: "-1" }), /* @__PURE__ */ import_etch.default.dom("div", { ref: "buttons", className: "btn-wrap-group hidden" }, /* @__PURE__ */ import_etch.default.dom("button", { ref: "learnMoreButton", className: "btn btn-default icon icon-link" }, "View on Atom.io"), /* @__PURE__ */ import_etch.default.dom("button", { ref: "issueButton", className: "btn btn-default icon icon-bug" }, "Report Issue"), /* @__PURE__ */ import_etch.default.dom("button", { ref: "changelogButton", className: "btn btn-default icon icon-squirrel" }, "CHANGELOG"), /* @__PURE__ */ import_etch.default.dom("button", { ref: "licenseButton", className: "btn btn-default icon icon-law" }, "LICENSE"), /* @__PURE__ */ import_etch.default.dom("button", { ref: "openButton", className: "btn btn-default icon icon-link-external" }, "View Code")), /* @__PURE__ */ import_etch.default.dom("div", { ref: "errors" }))), /* @__PURE__ */ import_etch.default.dom("div", { ref: "sections" })));
  }
  populate() {
    this.refs.title.textContent = `${import_underscore_plus.default.undasherize(import_underscore_plus.default.uncamelcase(this.pack.name))}`;
    this.type = this.pack.metadata.theme ? "theme" : "package";
    const repoUrl = this.packageManager.getRepositoryUrl(this.pack);
    if (repoUrl) {
      const repoName = import_url.default.parse(repoUrl).pathname;
      this.refs.packageRepo.textContent = repoName.substring(1);
      this.refs.packageRepo.style.display = "";
    } else {
      this.refs.packageRepo.style.display = "none";
    }
    this.updateInstalledState();
  }
  updateInstalledState() {
    if (this.settingsPanel) {
      this.settingsPanel.destroy();
      this.settingsPanel = null;
    }
    if (this.keymapView) {
      this.keymapView.destroy();
      this.keymapView = null;
    }
    if (this.grammarsView) {
      this.grammarsView.destroy();
      this.grammarsView = null;
    }
    if (this.snippetsView) {
      this.snippetsView.destroy();
      this.snippetsView = null;
    }
    if (this.readmeView) {
      this.readmeView.destroy();
      this.readmeView = null;
    }
    this.updateFileButtons();
    this.activateConfig();
    this.refs.startupTime.style.display = "none";
    if (chevron.packages.isPackageLoaded(this.pack.name)) {
      if (!chevron.packages.isPackageDisabled(this.pack.name)) {
        this.settingsPanel = new import_settings_panel.default({ namespace: this.pack.name, includeTitle: false });
        this.keymapView = new import_package_keymap_view.default(this.pack);
        this.refs.sections.appendChild(this.settingsPanel.element);
        this.refs.sections.appendChild(this.keymapView.element);
        if (this.pack.path) {
          this.grammarsView = new import_package_grammars_view.default(this.pack.path);
          this.snippetsView = new import_package_snippets_view.default(this.pack, this.snippetsProvider);
          this.refs.sections.appendChild(this.grammarsView.element);
          this.refs.sections.appendChild(this.snippetsView.element);
        }
        this.refs.startupTime.innerHTML = `This ${this.type} added <span class='highlight'>${this.getStartupTime()}ms</span> to startup time.`;
        this.refs.startupTime.style.display = "";
      }
    }
    const sourceIsAvailable = this.packageManager.isPackageInstalled(this.pack.name) && !chevron.packages.isBundledPackage(this.pack.name);
    if (sourceIsAvailable) {
      this.refs.openButton.style.display = "";
    } else {
      this.refs.openButton.style.display = "none";
    }
    this.renderReadme();
  }
  renderReadme() {
    let readme;
    if (this.pack.metadata.readme && this.pack.metadata.readme.trim() !== NORMALIZE_PACKAGE_DATA_README_ERROR) {
      readme = this.pack.metadata.readme;
    } else {
      readme = null;
    }
    if (this.readmePath && import_fs_plus.default.statSync(this.readmePath).isFile() && !readme) {
      readme = import_fs_plus.default.readFileSync(this.readmePath, { encoding: "utf8" });
    }
    let readmeSrc;
    if (this.pack.path) {
      readmeSrc = this.pack.path;
    } else {
      let repoUrl = this.packageManager.getRepositoryUrl(this.pack);
      if (repoUrl) {
        readmeSrc = repoUrl + `/blob/master/`;
      }
    }
    const readmeView = new import_package_readme_view.default(readme, readmeSrc);
    if (this.readmeView) {
      this.readmeView.element.parentElement.replaceChild(readmeView.element, this.readmeView.element);
      this.readmeView.destroy();
    } else {
      this.refs.sections.appendChild(readmeView.element);
    }
    this.readmeView = readmeView;
  }
  subscribeToPackageManager() {
    this.disposables.add(this.packageManager.on("theme-installed package-installed", ({ pack }) => {
      if (this.pack.name === pack.name) {
        this.loadPackage();
        this.updateInstalledState();
      }
    }));
    this.disposables.add(this.packageManager.on("theme-uninstalled package-uninstalled", ({ pack }) => {
      if (this.pack.name === pack.name) {
        return this.updateInstalledState();
      }
    }));
    this.disposables.add(this.packageManager.on("theme-updated package-updated", ({ pack }) => {
      if (this.pack.name === pack.name) {
        this.loadPackage();
        this.updateFileButtons();
        this.populate();
      }
    }));
  }
  openMarkdownFile(path2) {
    if (chevron.packages.isPackageActive("markdown-preview")) {
      chevron.workspace.open(encodeURI(`markdown-preview://${path2}`));
    } else {
      chevron.workspace.open(path2);
    }
  }
  updateFileButtons() {
    this.changelogPath = null;
    this.licensePath = null;
    this.readmePath = null;
    const packagePath = this.pack.path != null ? this.pack.path : chevron.packages.resolvePackagePath(this.pack.name);
    for (const child of import_fs_plus.default.listSync(packagePath)) {
      switch (import_path.default.basename(child, import_path.default.extname(child)).toLowerCase()) {
        case "changelog":
        case "history":
          this.changelogPath = child;
          break;
        case "license":
        case "licence":
          this.licensePath = child;
          break;
        case "readme":
          this.readmePath = child;
          break;
      }
      if (this.readmePath && this.changelogPath && this.licensePath) {
        break;
      }
    }
    if (this.changelogPath) {
      this.refs.changelogButton.style.display = "";
    } else {
      this.refs.changelogButton.style.display = "none";
    }
    if (this.licensePath) {
      this.refs.licenseButton.style.display = "";
    } else {
      this.refs.licenseButton.style.display = "none";
    }
  }
  getStartupTime() {
    const loadTime = this.pack.loadTime != null ? this.pack.loadTime : 0;
    const activateTime = this.pack.activateTime != null ? this.pack.activateTime : 0;
    return loadTime + activateTime;
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
class PackageCardComponent {
  constructor(props) {
    this.packageCard = new import_package_card.default(props.metadata, props.settingsView, props.packageManager, props.options);
    this.element = this.packageCard.element;
  }
  update() {
  }
  destroy() {
  }
}
