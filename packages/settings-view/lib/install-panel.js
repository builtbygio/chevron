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
var install_panel_exports = {};
__export(install_panel_exports, {
  default: () => InstallPanel
});
module.exports = __toCommonJS(install_panel_exports);
var import_path = __toESM(require("path"));
var import_etch = __toESM(require("etch"));
var import_hosted_git_info = __toESM(require("hosted-git-info"));
var import_atom = require("chevron");
var import_package_card = __toESM(require("./package-card"));
var import_error_view = __toESM(require("./error-view"));
const PackageNameRegex = /config\/install\/(package|theme):([a-z0-9-_]+)/i;
class InstallPanel {
  constructor(settingsView, packageManager) {
    this.settingsView = settingsView;
    this.packageManager = packageManager;
    this.disposables = new import_atom.CompositeDisposable();
    this.client = this.packageManager.getClient();
    this.atomIoURL = "https://packages.pulsar-edit.dev/packages";
    import_etch.default.initialize(this);
    this.refs.searchMessage.style.display = "none";
    this.refs.searchEditor.setPlaceholderText("Search packages");
    this.searchType = "packages";
    this.disposables.add(
      this.packageManager.on("package-install-failed", ({ pack, error }) => {
        this.refs.searchErrors.appendChild(new import_error_view.default(this.packageManager, error).element);
      })
    );
    this.disposables.add(
      this.packageManager.on("package-installed theme-installed", ({ pack }) => {
        const gitUrlInfo = this.currentGitPackageCard && this.currentGitPackageCard.pack && this.currentGitPackageCard.pack.gitUrlInfo ? this.currentGitPackageCard.pack.gitUrlInfo : null;
        if (gitUrlInfo && gitUrlInfo === pack.gitUrlInfo) {
          this.updateGitPackageCard(pack);
        }
      })
    );
    this.disposables.add(
      this.refs.searchEditor.onDidStopChanging(() => {
        this.performSearch();
      })
    );
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
    this.loadFeaturedPackages();
  }
  destroy() {
    this.disposables.dispose();
    return import_etch.default.destroy(this);
  }
  update() {
  }
  focus() {
    this.refs.searchEditor.element.focus();
  }
  show() {
    this.element.style.display = "";
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "panels-item", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section packages" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-container" }, /* @__PURE__ */ import_etch.default.dom("h1", { ref: "installHeading", className: "section-heading icon icon-plus" }, "Install Packages"), /* @__PURE__ */ import_etch.default.dom("div", { className: "text native-key-bindings", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "icon icon-question" }), /* @__PURE__ */ import_etch.default.dom("span", { ref: "publishedToText" }, "Packages are listed on "), /* @__PURE__ */ import_etch.default.dom("a", { className: "link", onclick: this.didClickOpenAtomIo.bind(this) }, "packages.pulsar-edit.dev"), /* @__PURE__ */ import_etch.default.dom("span", null, " and are installed to ", import_path.default.join(process.env.ATOM_HOME, "packages"))), /* @__PURE__ */ import_etch.default.dom("div", { className: "search-container clearfix" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "editor-container" }, /* @__PURE__ */ import_etch.default.dom(import_atom.TextEditor, { mini: true, ref: "searchEditor" })), /* @__PURE__ */ import_etch.default.dom("div", { className: "btn-group" }, /* @__PURE__ */ import_etch.default.dom("button", { ref: "searchPackagesButton", className: "btn btn-default selected", onclick: this.didClickSearchPackagesButton.bind(this) }, "Packages"), /* @__PURE__ */ import_etch.default.dom("button", { ref: "searchThemesButton", className: "btn btn-default", onclick: this.didClickSearchThemesButton.bind(this) }, "Themes"))), /* @__PURE__ */ import_etch.default.dom("div", { ref: "searchErrors" }), /* @__PURE__ */ import_etch.default.dom("div", { ref: "searchMessage", className: "alert alert-info search-message icon icon-search" }), /* @__PURE__ */ import_etch.default.dom("div", { ref: "resultsContainer", className: "container package-container" }))), /* @__PURE__ */ import_etch.default.dom("div", { className: "section packages" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-container" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "featuredHeading", className: "section-heading icon icon-star" }), /* @__PURE__ */ import_etch.default.dom("div", { ref: "featuredErrors" }), /* @__PURE__ */ import_etch.default.dom("div", { ref: "loadingMessage", className: "alert alert-info icon icon-hourglass" }), /* @__PURE__ */ import_etch.default.dom("div", { ref: "featuredContainer", className: "container package-container" }))));
  }
  setSearchType(searchType) {
    if (searchType === "theme") {
      this.searchType = "themes";
      this.refs.searchThemesButton.classList.add("selected");
      this.refs.searchPackagesButton.classList.remove("selected");
      this.refs.searchEditor.setPlaceholderText("Search themes");
      this.refs.publishedToText.textContent = "Themes are listed on ";
      this.atomIoURL = "https://packages.pulsar-edit.dev/themes";
      this.loadFeaturedPackages(true);
    } else if (searchType === "package") {
      this.searchType = "packages";
      this.refs.searchPackagesButton.classList.add("selected");
      this.refs.searchThemesButton.classList.remove("selected");
      this.refs.searchEditor.setPlaceholderText("Search packages");
      this.refs.publishedToText.textContent = "Packages are listed on ";
      this.atomIoURL = "https://packages.pulsar-edit.dev/packages";
      this.loadFeaturedPackages();
    }
  }
  beforeShow(options) {
    if (options && options.uri) {
      const query = this.extractQueryFromURI(options.uri);
      if (query != null) {
        const { searchType, packageName } = query;
        this.setSearchType(searchType);
        this.refs.searchEditor.setText(packageName);
        this.performSearch();
      }
    }
  }
  extractQueryFromURI(uri) {
    const matches = PackageNameRegex.exec(uri);
    if (matches) {
      const [, searchType, packageName] = Array.from(matches);
      return { searchType, packageName };
    } else {
      return null;
    }
  }
  performSearch() {
    const query = this.refs.searchEditor.getText().trim().toLowerCase();
    if (query) {
      this.performSearchForQuery(query);
    }
  }
  performSearchForQuery(query) {
    const gitUrlInfo = import_hosted_git_info.default.fromUrl(query);
    if (gitUrlInfo) {
      const type = gitUrlInfo.default;
      if (type === "sshurl" || type === "https" || type === "shortcut") {
        this.showGitInstallPackageCard({ name: query, gitUrlInfo });
      }
    } else {
      this.search(query);
    }
  }
  showGitInstallPackageCard(pack) {
    if (this.currentGitPackageCard) {
      this.currentGitPackageCard.destroy();
    }
    this.currentGitPackageCard = this.getPackageCardView(pack);
    this.currentGitPackageCard.displayGitPackageInstallInformation();
    this.replaceCurrentGitPackageCardView();
  }
  updateGitPackageCard(pack) {
    if (this.currentGitPackageCard) {
      this.currentGitPackageCard.destroy();
    }
    this.currentGitPackageCard = this.getPackageCardView(pack);
    this.replaceCurrentGitPackageCardView();
  }
  replaceCurrentGitPackageCardView() {
    this.refs.resultsContainer.innerHTML = "";
    this.addPackageCardView(this.refs.resultsContainer, this.currentGitPackageCard);
  }
  async search(query) {
    this.refs.resultsContainer.innerHTML = "";
    this.refs.searchMessage.textContent = `Searching ${this.searchType} for “${query}”…`;
    this.refs.searchMessage.style.display = "";
    const options = {};
    options[this.searchType] = true;
    try {
      const packages = await this.client.search(query, options) || [];
      this.refs.resultsContainer.innerHTML = "";
      this.refs.searchMessage.style.display = "none";
      if (packages.length === 0) {
        this.refs.searchMessage.textContent = `No ${this.searchType.replace(/s$/, "")} results for “${query}”`;
        this.refs.searchMessage.style.display = "";
      }
      this.addPackageViews(this.refs.resultsContainer, packages);
    } catch (error) {
      this.refs.searchMessage.style.display = "none";
      this.refs.searchErrors.appendChild(new import_error_view.default(this.packageManager, error).element);
    }
  }
  addPackageViews(container, packages) {
    for (const pack of packages) {
      this.addPackageCardView(container, this.getPackageCardView(pack));
    }
  }
  addPackageCardView(container, packageCard) {
    const packageRow = document.createElement("div");
    packageRow.classList.add("row");
    packageRow.appendChild(packageCard.element);
    container.appendChild(packageRow);
  }
  getPackageCardView(pack) {
    return new import_package_card.default(pack, this.settingsView, this.packageManager, { back: "Install" });
  }
  filterPackages(packages, themes) {
    return packages.filter(({ theme }) => themes ? theme : !theme);
  }
  // Load and display the featured packages that are available to install.
  loadFeaturedPackages(loadThemes) {
    if (loadThemes == null) {
      loadThemes = false;
    }
    this.refs.featuredContainer.innerHTML = "";
    if (loadThemes) {
      this.refs.installHeading.textContent = "Install Themes";
      this.refs.featuredHeading.textContent = "Featured Themes";
      this.refs.loadingMessage.textContent = "Loading featured themes…";
    } else {
      this.refs.installHeading.textContent = "Install Packages";
      this.refs.featuredHeading.textContent = "Featured Packages";
      this.refs.loadingMessage.textContent = "Loading featured packages…";
    }
    this.refs.loadingMessage.style.display = "";
    const handle = (error) => {
      this.refs.loadingMessage.style.display = "none";
      this.refs.featuredErrors.appendChild(new import_error_view.default(this.packageManager, error).element);
    };
    if (loadThemes) {
      this.client.featuredThemes((error, themes) => {
        if (error) {
          handle(error);
        } else {
          this.refs.loadingMessage.style.display = "none";
          this.refs.featuredHeading.textContent = "Featured Themes";
          this.addPackageViews(this.refs.featuredContainer, themes);
        }
      });
    } else {
      this.client.featuredPackages((error, packages) => {
        if (error) {
          handle(error);
        } else {
          this.refs.loadingMessage.style.display = "none";
          this.refs.featuredHeading.textContent = "Featured Packages";
          this.addPackageViews(this.refs.featuredContainer, packages);
        }
      });
    }
  }
  didClickOpenAtomIo(event) {
    event.preventDefault();
    chevron.applicationDelegate.openExternal(this.atomIoURL);
  }
  didClickSearchPackagesButton() {
    if (!this.refs.searchPackagesButton.classList.contains("selected")) {
      this.setSearchType("package");
    }
    this.performSearch();
  }
  didClickSearchThemesButton() {
    if (!this.refs.searchThemesButton.classList.contains("selected")) {
      this.setSearchType("theme");
    }
    this.performSearch();
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
