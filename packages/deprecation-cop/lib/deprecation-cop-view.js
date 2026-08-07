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
var deprecation_cop_view_exports = {};
__export(deprecation_cop_view_exports, {
  default: () => DeprecationCopView
});
module.exports = __toCommonJS(deprecation_cop_view_exports);
var import_underscore_plus = __toESM(require("underscore-plus"));
var import_atom = require("atom");
var import_etch = __toESM(require("etch"));
var import_fs_plus = __toESM(require("fs-plus"));
var import_grim = __toESM(require("grim"));
var import_marked = require("marked");
var import_path = __toESM(require("path"));
var import_electron = require("electron");
class DeprecationCopView {
  constructor({ uri }) {
    this.uri = uri;
    this.subscriptions = new import_atom.CompositeDisposable();
    this.subscriptions.add(
      import_grim.default.on("updated", () => {
        import_etch.default.update(this);
      })
    );
    if (atom.styles.onDidUpdateDeprecations) {
      this.subscriptions.add(
        atom.styles.onDidUpdateDeprecations(() => {
          import_etch.default.update(this);
        })
      );
    }
    import_etch.default.initialize(this);
    this.subscriptions.add(
      atom.commands.add(this.element, {
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
      })
    );
  }
  serialize() {
    return {
      deserializer: this.constructor.name,
      uri: this.getURI(),
      version: 1
    };
  }
  destroy() {
    this.subscriptions.dispose();
    return import_etch.default.destroy(this);
  }
  update() {
    return import_etch.default.update(this);
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom(
      "div",
      {
        className: "deprecation-cop pane-item native-key-bindings",
        tabIndex: "-1"
      },
      /* @__PURE__ */ import_etch.default.dom("div", { className: "panel" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "padded deprecation-overview" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "pull-right btn-group" }, /* @__PURE__ */ import_etch.default.dom(
        "button",
        {
          className: "btn btn-primary check-for-update",
          onclick: (event) => {
            event.preventDefault();
            this.checkForUpdates();
          }
        },
        "Check for Updates"
      ))), /* @__PURE__ */ import_etch.default.dom("div", { className: "panel-heading" }, /* @__PURE__ */ import_etch.default.dom("span", null, "Deprecated calls")), /* @__PURE__ */ import_etch.default.dom("ul", { className: "list-tree has-collapsable-children" }, this.renderDeprecatedCalls()), /* @__PURE__ */ import_etch.default.dom("div", { className: "panel-heading" }, /* @__PURE__ */ import_etch.default.dom("span", null, "Deprecated selectors")), /* @__PURE__ */ import_etch.default.dom("ul", { className: "selectors list-tree has-collapsable-children" }, this.renderDeprecatedSelectors()))
    );
  }
  renderDeprecatedCalls() {
    const deprecationsByPackageName = this.getDeprecatedCallsByPackageName();
    const packageNames = Object.keys(deprecationsByPackageName);
    if (packageNames.length === 0) {
      return /* @__PURE__ */ import_etch.default.dom("li", { className: "list-item" }, "No deprecated calls");
    } else {
      return packageNames.sort().map((packageName) => /* @__PURE__ */ import_etch.default.dom("li", { className: "deprecation list-nested-item collapsed" }, /* @__PURE__ */ import_etch.default.dom(
        "div",
        {
          className: "deprecation-info list-item",
          onclick: (event) => event.target.parentElement.classList.toggle("collapsed")
        },
        /* @__PURE__ */ import_etch.default.dom("span", { className: "text-highlight" }, packageName || "atom core"),
        /* @__PURE__ */ import_etch.default.dom("span", null, ` (${import_underscore_plus.default.pluralize(
          deprecationsByPackageName[packageName].length,
          "deprecation"
        )})`)
      ), /* @__PURE__ */ import_etch.default.dom("ul", { className: "list" }, this.renderPackageActionsIfNeeded(packageName), deprecationsByPackageName[packageName].map(
        ({ deprecation, stack }) => /* @__PURE__ */ import_etch.default.dom("li", { className: "list-item deprecation-detail" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "text-warning icon icon-alert" }), /* @__PURE__ */ import_etch.default.dom(
          "div",
          {
            className: "list-item deprecation-message",
            innerHTML: (0, import_marked.marked)(deprecation.getMessage())
          }
        ), this.renderIssueURLIfNeeded(
          packageName,
          deprecation,
          this.buildIssueURL(packageName, deprecation, stack)
        ), /* @__PURE__ */ import_etch.default.dom("div", { className: "stack-trace" }, stack.map(({ functionName, location }) => /* @__PURE__ */ import_etch.default.dom("div", { className: "stack-line" }, /* @__PURE__ */ import_etch.default.dom("span", null, functionName), /* @__PURE__ */ import_etch.default.dom("span", null, " - "), /* @__PURE__ */ import_etch.default.dom(
          "a",
          {
            className: "stack-line-location",
            href: location,
            onclick: (event) => {
              event.preventDefault();
              this.openLocation(location);
            }
          },
          location
        )))))
      ))));
    }
  }
  renderDeprecatedSelectors() {
    const deprecationsByPackageName = this.getDeprecatedSelectorsByPackageName();
    const packageNames = Object.keys(deprecationsByPackageName);
    if (packageNames.length === 0) {
      return /* @__PURE__ */ import_etch.default.dom("li", { className: "list-item" }, "No deprecated selectors");
    } else {
      return packageNames.map((packageName) => /* @__PURE__ */ import_etch.default.dom("li", { className: "deprecation list-nested-item collapsed" }, /* @__PURE__ */ import_etch.default.dom(
        "div",
        {
          className: "deprecation-info list-item",
          onclick: (event) => event.target.parentElement.classList.toggle("collapsed")
        },
        /* @__PURE__ */ import_etch.default.dom("span", { className: "text-highlight" }, packageName)
      ), /* @__PURE__ */ import_etch.default.dom("ul", { className: "list" }, this.renderPackageActionsIfNeeded(packageName), deprecationsByPackageName[packageName].map(
        ({ packagePath, sourcePath, deprecation }) => {
          const relativeSourcePath = import_path.default.relative(
            packagePath,
            sourcePath
          );
          const issueTitle = `Deprecated selector in \`${relativeSourcePath}\``;
          const issueBody = `In \`${relativeSourcePath}\`: 

${deprecation.message}`;
          return /* @__PURE__ */ import_etch.default.dom("li", { className: "list-item source-file" }, /* @__PURE__ */ import_etch.default.dom(
            "a",
            {
              className: "source-url",
              href: sourcePath,
              onclick: (event) => {
                event.preventDefault();
                this.openLocation(sourcePath);
              }
            },
            relativeSourcePath
          ), /* @__PURE__ */ import_etch.default.dom("ul", { className: "list" }, /* @__PURE__ */ import_etch.default.dom("li", { className: "list-item deprecation-detail" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "text-warning icon icon-alert" }), /* @__PURE__ */ import_etch.default.dom(
            "div",
            {
              className: "list-item deprecation-message",
              innerHTML: (0, import_marked.marked)(deprecation.message)
            }
          ), this.renderSelectorIssueURLIfNeeded(
            packageName,
            issueTitle,
            issueBody
          ))));
        }
      ))));
    }
  }
  renderPackageActionsIfNeeded(packageName) {
    if (packageName && atom.packages.getLoadedPackage(packageName)) {
      return /* @__PURE__ */ import_etch.default.dom("div", { className: "padded" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "btn-group" }, /* @__PURE__ */ import_etch.default.dom(
        "button",
        {
          className: "btn check-for-update",
          onclick: (event) => {
            event.preventDefault();
            this.checkForUpdates();
          }
        },
        "Check for Update"
      ), /* @__PURE__ */ import_etch.default.dom(
        "button",
        {
          className: "btn disable-package",
          "data-package-name": packageName,
          onclick: (event) => {
            event.preventDefault();
            this.disablePackage(packageName);
          }
        },
        "Disable Package"
      )));
    } else {
      return "";
    }
  }
  encodeURI(str) {
    return encodeURI(str).replace(/#/g, "%23").replace(/;/g, "%3B").replace(/%20/g, "+");
  }
  renderSelectorIssueURLIfNeeded(packageName, issueTitle, issueBody) {
    const repoURL = this.getRepoURL(packageName);
    if (repoURL) {
      const issueURL = `${repoURL}/issues/new?title=${this.encodeURI(
        issueTitle
      )}&body=${this.encodeURI(issueBody)}`;
      return /* @__PURE__ */ import_etch.default.dom("div", { className: "btn-toolbar" }, /* @__PURE__ */ import_etch.default.dom(
        "button",
        {
          className: "btn issue-url",
          "data-issue-title": issueTitle,
          "data-repo-url": repoURL,
          "data-issue-url": issueURL,
          onclick: (event) => {
            event.preventDefault();
            this.openIssueURL(repoURL, issueURL, issueTitle);
          }
        },
        "Report Issue"
      ));
    } else {
      return "";
    }
  }
  renderIssueURLIfNeeded(packageName, deprecation, issueURL) {
    if (packageName && issueURL) {
      const repoURL = this.getRepoURL(packageName);
      const issueTitle = `${deprecation.getOriginName()} is deprecated.`;
      return /* @__PURE__ */ import_etch.default.dom("div", { className: "btn-toolbar" }, /* @__PURE__ */ import_etch.default.dom(
        "button",
        {
          className: "btn issue-url",
          "data-issue-title": issueTitle,
          "data-repo-url": repoURL,
          "data-issue-url": issueURL,
          onclick: (event) => {
            event.preventDefault();
            this.openIssueURL(repoURL, issueURL, issueTitle);
          }
        },
        "Report Issue"
      ));
    } else {
      return "";
    }
  }
  buildIssueURL(packageName, deprecation, stack) {
    const repoURL = this.getRepoURL(packageName);
    if (repoURL) {
      const title = `${deprecation.getOriginName()} is deprecated.`;
      const stacktrace = stack.map(({ functionName, location }) => `${functionName} (${location})`).join("\n");
      const body = `${deprecation.getMessage()}
\`\`\`
${stacktrace}
\`\`\``;
      return `${repoURL}/issues/new?title=${encodeURI(title)}&body=${encodeURI(
        body
      )}`;
    } else {
      return null;
    }
  }
  async openIssueURL(repoURL, issueURL, issueTitle) {
    const issue = await this.findSimilarIssue(repoURL, issueTitle);
    if (issue) {
      import_electron.shell.openExternal(issue.html_url);
    } else if (process.platform === "win32") {
      import_electron.shell.openExternal(await this.shortenURL(issueURL) || issueURL);
    } else {
      import_electron.shell.openExternal(issueURL);
    }
  }
  async findSimilarIssue(repoURL, issueTitle) {
    const url = "https://api.github.com/search/issues";
    const repo = repoURL.replace(/http(s)?:\/\/(\d+\.)?github.com\//gi, "");
    const query = `${issueTitle} repo:${repo}`;
    const response = await window.fetch(
      `${url}?q=${encodeURI(query)}&sort=created`,
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        }
      }
    );
    if (response.ok) {
      const data = await response.json();
      if (data.items) {
        const issues = {};
        for (const issue of data.items) {
          if (issue.title.includes(issueTitle) && !issues[issue.state]) {
            issues[issue.state] = issue;
          }
        }
        return issues.open || issues.closed;
      }
    }
  }
  async shortenURL(url) {
    let encodedUrl = encodeURIComponent(url).substr(0, 5e3);
    let incompletePercentEncoding = encodedUrl.indexOf(
      "%",
      encodedUrl.length - 2
    );
    if (incompletePercentEncoding >= 0) {
      encodedUrl = encodedUrl.substr(0, incompletePercentEncoding);
    }
    let result = await fetch("https://is.gd/create.php?format=simple", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `url=${encodedUrl}`
    });
    return result.text();
  }
  getRepoURL(packageName) {
    const loadedPackage = atom.packages.getLoadedPackage(packageName);
    if (loadedPackage && loadedPackage.metadata && loadedPackage.metadata.repository) {
      const url = loadedPackage.metadata.repository.url || loadedPackage.metadata.repository;
      return url.replace(/\.git$/, "");
    } else {
      return null;
    }
  }
  getDeprecatedCallsByPackageName() {
    const deprecatedCalls = import_grim.default.getDeprecations();
    deprecatedCalls.sort((a, b) => b.getCallCount() - a.getCallCount());
    const deprecatedCallsByPackageName = {};
    for (const deprecation of deprecatedCalls) {
      const stacks = deprecation.getStacks();
      stacks.sort((a, b) => b.callCount - a.callCount);
      for (const stack of stacks) {
        let packageName = null;
        if (stack.metadata && stack.metadata.packageName) {
          packageName = stack.metadata.packageName;
        } else {
          packageName = (this.getPackageName(stack) || "").toLowerCase();
        }
        deprecatedCallsByPackageName[packageName] = deprecatedCallsByPackageName[packageName] || [];
        deprecatedCallsByPackageName[packageName].push({ deprecation, stack });
      }
    }
    return deprecatedCallsByPackageName;
  }
  getDeprecatedSelectorsByPackageName() {
    const deprecatedSelectorsByPackageName = {};
    if (atom.styles.getDeprecations) {
      const deprecatedSelectorsBySourcePath = atom.styles.getDeprecations();
      for (const sourcePath of Object.keys(deprecatedSelectorsBySourcePath)) {
        const deprecation = deprecatedSelectorsBySourcePath[sourcePath];
        const components = sourcePath.split(import_path.default.sep);
        const packagesComponentIndex = components.indexOf("packages");
        let packageName = null;
        let packagePath = null;
        if (packagesComponentIndex === -1) {
          packageName = "Other";
          packagePath = "";
        } else {
          packageName = components[packagesComponentIndex + 1];
          packagePath = components.slice(0, packagesComponentIndex + 1).join(import_path.default.sep);
        }
        deprecatedSelectorsByPackageName[packageName] = deprecatedSelectorsByPackageName[packageName] || [];
        deprecatedSelectorsByPackageName[packageName].push({
          packagePath,
          sourcePath,
          deprecation
        });
      }
    }
    return deprecatedSelectorsByPackageName;
  }
  getPackageName(stack) {
    const packagePaths = this.getPackagePathsByPackageName();
    for (const [packageName, packagePath] of packagePaths) {
      if (packagePath.includes(".atom/dev/packages") || packagePath.includes(".atom/packages")) {
        packagePaths.set(packageName, import_fs_plus.default.absolute(packagePath));
      }
    }
    for (let i = 1; i < stack.length; i++) {
      const { fileName } = stack[i];
      if (!fileName) {
        return null;
      }
      if (fileName.includes(`${import_path.default.sep}node_modules${import_path.default.sep}`)) {
        continue;
      }
      for (const [packageName, packagePath] of packagePaths) {
        const relativePath = import_path.default.relative(packagePath, fileName);
        if (!/^\.\./.test(relativePath)) {
          return packageName;
        }
      }
      if (atom.getUserInitScriptPath() === fileName) {
        return `Your local ${import_path.default.basename(fileName)} file`;
      }
    }
    return null;
  }
  getPackagePathsByPackageName() {
    if (this.packagePathsByPackageName) {
      return this.packagePathsByPackageName;
    } else {
      this.packagePathsByPackageName = /* @__PURE__ */ new Map();
      for (const pack of atom.packages.getLoadedPackages()) {
        this.packagePathsByPackageName.set(pack.name, pack.path);
      }
      return this.packagePathsByPackageName;
    }
  }
  checkForUpdates() {
    atom.workspace.open("atom://config/updates");
  }
  disablePackage(packageName) {
    if (packageName) {
      atom.packages.disablePackage(packageName);
    }
  }
  openLocation(location) {
    let pathToOpen = location.replace("file://", "");
    if (process.platform === "win32") {
      pathToOpen = pathToOpen.replace(/^\//, "");
    }
    atom.open({ pathsToOpen: [pathToOpen] });
  }
  getURI() {
    return this.uri;
  }
  getTitle() {
    return "Deprecation Cop";
  }
  getIconName() {
    return "alert";
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
