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
var guide_view_exports = {};
__export(guide_view_exports, {
  default: () => GuideView
});
module.exports = __toCommonJS(guide_view_exports);
var import_etch = __toESM(require("etch"));
class GuideView {
  constructor(props) {
    this.props = props;
    this.didClickProjectButton = this.didClickProjectButton.bind(this);
    this.didClickGitButton = this.didClickGitButton.bind(this);
    this.didClickGitHubButton = this.didClickGitHubButton.bind(this);
    this.didClickPackagesButton = this.didClickPackagesButton.bind(this);
    this.didClickThemesButton = this.didClickThemesButton.bind(this);
    this.didClickStylingButton = this.didClickStylingButton.bind(this);
    this.didClickInitScriptButton = this.didClickInitScriptButton.bind(this);
    this.didClickSnippetsButton = this.didClickSnippetsButton.bind(this);
    this.didExpandOrCollapseSection = this.didExpandOrCollapseSection.bind(
      this
    );
    import_etch.default.initialize(this);
  }
  update() {
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "welcome is-guide" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "welcome-container" }, /* @__PURE__ */ import_etch.default.dom("section", { className: "welcome-panel" }, /* @__PURE__ */ import_etch.default.dom("h1", { className: "welcome-title" }, "Get to know Chevron!"), /* @__PURE__ */ import_etch.default.dom("p", { className: "welcome-note" }, "Pair this tab with ", /* @__PURE__ */ import_etch.default.dom("strong", null, "Welcome"), " for status and links. Expand a section below to try a feature."), /* @__PURE__ */ import_etch.default.dom(
      "details",
      {
        className: "welcome-card",
        ...this.getSectionProps("project")
      },
      /* @__PURE__ */ import_etch.default.dom("summary", { className: "welcome-summary icon icon-repo" }, "Open a ", /* @__PURE__ */ import_etch.default.dom("span", { className: "welcome-highlight" }, "Project")),
      /* @__PURE__ */ import_etch.default.dom("div", { className: "welcome-detail" }, /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
        "img",
        {
          className: "welcome-img",
          src: "atom://welcome/assets/project.svg"
        }
      )), /* @__PURE__ */ import_etch.default.dom("p", null, "In Chevron you can open individual files or a whole folder as a project. Opening a folder adds a tree view so you can browse files."), /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
        "button",
        {
          ref: "projectButton",
          onclick: this.didClickProjectButton,
          className: "btn btn-primary"
        },
        "Open a Project"
      )), /* @__PURE__ */ import_etch.default.dom("p", { className: "welcome-note" }, /* @__PURE__ */ import_etch.default.dom("strong", null, "Next time:"), " open projects from the menu, keyboard shortcut, or by dragging a folder onto the Chevron dock icon (macOS)."))
    ), /* @__PURE__ */ import_etch.default.dom("details", { className: "welcome-card", ...this.getSectionProps("git") }, /* @__PURE__ */ import_etch.default.dom("summary", { className: "welcome-summary icon icon-mark-github" }, "Version control with", " ", /* @__PURE__ */ import_etch.default.dom("span", { className: "welcome-highlight" }, "Git and GitHub")), /* @__PURE__ */ import_etch.default.dom("div", { className: "welcome-detail" }, /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
      "img",
      {
        className: "welcome-img",
        src: "atom://welcome/assets/package.svg"
      }
    )), /* @__PURE__ */ import_etch.default.dom("p", null, "Track changes as you work. Branch, commit, push, and pull without leaving the editor. The GitHub panel talks to GitHub.com when you sign in."), /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
      "button",
      {
        onclick: this.didClickGitButton,
        className: "btn btn-primary inline-block"
      },
      "Open the Git panel"
    ), /* @__PURE__ */ import_etch.default.dom(
      "button",
      {
        onclick: this.didClickGitHubButton,
        className: "btn btn-primary inline-block"
      },
      "Open the GitHub panel"
    )), /* @__PURE__ */ import_etch.default.dom("p", { className: "welcome-note" }, /* @__PURE__ */ import_etch.default.dom("strong", null, "Next time:"), " toggle the Git tab from the", " ", /* @__PURE__ */ import_etch.default.dom("span", { className: "icon icon-diff" }), " control in the status bar."))), /* @__PURE__ */ import_etch.default.dom(
      "details",
      {
        className: "welcome-card",
        ...this.getSectionProps("packages")
      },
      /* @__PURE__ */ import_etch.default.dom("summary", { className: "welcome-summary icon icon-package" }, "Install a ", /* @__PURE__ */ import_etch.default.dom("span", { className: "welcome-highlight" }, "Package")),
      /* @__PURE__ */ import_etch.default.dom("div", { className: "welcome-detail" }, /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
        "img",
        {
          className: "welcome-img",
          src: "atom://welcome/assets/package.svg"
        }
      )), /* @__PURE__ */ import_etch.default.dom("p", null, "Packages extend Chevron with ", /* @__PURE__ */ import_etch.default.dom("code", null, "require('chevron')"), " and ", /* @__PURE__ */ import_etch.default.dom("code", null, "engines.chevron"), ". Install with ", /* @__PURE__ */ import_etch.default.dom("code", null, "cpm"), " (or ", /* @__PURE__ */ import_etch.default.dom("code", null, "apm"), ", a shim to cpm)."), /* @__PURE__ */ import_etch.default.dom("p", { className: "welcome-note" }, /* @__PURE__ */ import_etch.default.dom("strong", null, "Package manager:"), " Settings and the CLI use", " ", /* @__PURE__ */ import_etch.default.dom("code", null, "cpm"), " (Electron-as-Node). Registry search defaults to the Pulsar package API; override with", " ", /* @__PURE__ */ import_etch.default.dom("code", null, "CPM_REGISTRY_URL"), ". You can also install from a local path or git URL. See", " ", /* @__PURE__ */ import_etch.default.dom("a", { href: "https://github.com/builtbygio/chevron" }, "builtbygio/chevron"), " ", "docs for ", /* @__PURE__ */ import_etch.default.dom("code", null, "cpm"), " guidance."), /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
        "button",
        {
          ref: "packagesButton",
          onclick: this.didClickPackagesButton,
          className: "btn btn-primary"
        },
        "Open Installer"
      )), /* @__PURE__ */ import_etch.default.dom("p", { className: "welcome-note" }, /* @__PURE__ */ import_etch.default.dom("strong", null, "Next time:"), " install packages from Settings."))
    ), /* @__PURE__ */ import_etch.default.dom(
      "details",
      {
        className: "welcome-card",
        ...this.getSectionProps("themes")
      },
      /* @__PURE__ */ import_etch.default.dom("summary", { className: "welcome-summary icon icon-paintcan" }, "Choose a ", /* @__PURE__ */ import_etch.default.dom("span", { className: "welcome-highlight" }, "Theme")),
      /* @__PURE__ */ import_etch.default.dom("div", { className: "welcome-detail" }, /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
        "img",
        {
          className: "welcome-img",
          src: "atom://welcome/assets/theme.svg"
        }
      )), /* @__PURE__ */ import_etch.default.dom("p", null, "Chevron ships with preinstalled themes. Try a few."), /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
        "button",
        {
          ref: "themesButton",
          onclick: this.didClickThemesButton,
          className: "btn btn-primary"
        },
        "Open the theme picker"
      )), /* @__PURE__ */ import_etch.default.dom("p", null, "Community themes install the same way as packages (with the same registry caveats as above). In Installer, switch the toggle to “themes”."), /* @__PURE__ */ import_etch.default.dom("p", { className: "welcome-note" }, /* @__PURE__ */ import_etch.default.dom("strong", null, "Next time:"), " switch themes from Settings."))
    ), /* @__PURE__ */ import_etch.default.dom(
      "details",
      {
        className: "welcome-card",
        ...this.getSectionProps("styling")
      },
      /* @__PURE__ */ import_etch.default.dom("summary", { className: "welcome-summary icon icon-paintcan" }, "Customize the ", /* @__PURE__ */ import_etch.default.dom("span", { className: "welcome-highlight" }, "Styling")),
      /* @__PURE__ */ import_etch.default.dom("div", { className: "welcome-detail" }, /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
        "img",
        {
          className: "welcome-img",
          src: "atom://welcome/assets/code.svg"
        }
      )), /* @__PURE__ */ import_etch.default.dom("p", null, "Customize almost anything by adding your own CSS/LESS in your user stylesheet (under your config home —", " ", /* @__PURE__ */ import_etch.default.dom("code", null, "~/.atom"), " by default, or", " ", /* @__PURE__ */ import_etch.default.dom("code", null, "CHEVRON_HOME"), " / ", /* @__PURE__ */ import_etch.default.dom("code", null, "~/.chevron"), " when set)."), /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
        "button",
        {
          ref: "stylingButton",
          onclick: this.didClickStylingButton,
          className: "btn btn-primary"
        },
        "Open your Stylesheet"
      )), /* @__PURE__ */ import_etch.default.dom("p", null, "Uncomment examples or try your own rules."), /* @__PURE__ */ import_etch.default.dom("p", { className: "welcome-note" }, /* @__PURE__ */ import_etch.default.dom("strong", null, "Next time:"), " open your stylesheet from Menu →", " ", this.getApplicationMenuName(), "."))
    ), /* @__PURE__ */ import_etch.default.dom(
      "details",
      {
        className: "welcome-card",
        ...this.getSectionProps("init-script")
      },
      /* @__PURE__ */ import_etch.default.dom("summary", { className: "welcome-summary icon icon-code" }, "Hack on the ", /* @__PURE__ */ import_etch.default.dom("span", { className: "welcome-highlight" }, "Init Script")),
      /* @__PURE__ */ import_etch.default.dom("div", { className: "welcome-detail" }, /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
        "img",
        {
          className: "welcome-img",
          src: "atom://welcome/assets/code.svg"
        }
      )), /* @__PURE__ */ import_etch.default.dom("p", null, "The init script is JavaScript or CoffeeScript run at startup. Use it to quickly change Chevron’s behaviour. It lives in the same config home as your stylesheet (", /* @__PURE__ */ import_etch.default.dom("code", null, "~/.atom"), " by default)."), /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
        "button",
        {
          ref: "initScriptButton",
          onclick: this.didClickInitScriptButton,
          className: "btn btn-primary"
        },
        "Open your Init Script"
      )), /* @__PURE__ */ import_etch.default.dom("p", null, "Uncomment examples or try your own."), /* @__PURE__ */ import_etch.default.dom("p", { className: "welcome-note" }, /* @__PURE__ */ import_etch.default.dom("strong", null, "Next time:"), " open your init script from Menu →", " ", this.getApplicationMenuName(), "."))
    ), /* @__PURE__ */ import_etch.default.dom(
      "details",
      {
        className: "welcome-card",
        ...this.getSectionProps("snippets")
      },
      /* @__PURE__ */ import_etch.default.dom("summary", { className: "welcome-summary icon icon-code" }, "Add a ", /* @__PURE__ */ import_etch.default.dom("span", { className: "welcome-highlight" }, "Snippet")),
      /* @__PURE__ */ import_etch.default.dom("div", { className: "welcome-detail" }, /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
        "img",
        {
          className: "welcome-img",
          src: "atom://welcome/assets/code.svg"
        }
      )), /* @__PURE__ */ import_etch.default.dom("p", null, "Snippets expand a short prefix into a larger code block with templated values (stored under your config home)."), /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
        "button",
        {
          ref: "snippetsButton",
          onclick: this.didClickSnippetsButton,
          className: "btn btn-primary"
        },
        "Open your Snippets"
      )), /* @__PURE__ */ import_etch.default.dom("p", null, "In your snippets file, type ", /* @__PURE__ */ import_etch.default.dom("code", null, "snip"), " then hit", " ", /* @__PURE__ */ import_etch.default.dom("code", null, "tab"), " to expand a template for a new snippet."), /* @__PURE__ */ import_etch.default.dom("p", { className: "welcome-note" }, /* @__PURE__ */ import_etch.default.dom("strong", null, "Next time:"), " open snippets from Menu →", " ", this.getApplicationMenuName(), "."))
    ), /* @__PURE__ */ import_etch.default.dom(
      "details",
      {
        className: "welcome-card",
        ...this.getSectionProps("shortcuts")
      },
      /* @__PURE__ */ import_etch.default.dom("summary", { className: "welcome-summary icon icon-keyboard" }, "Learn ", /* @__PURE__ */ import_etch.default.dom("span", { className: "welcome-highlight" }, "Keyboard Shortcuts")),
      /* @__PURE__ */ import_etch.default.dom("div", { className: "welcome-detail" }, /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
        "img",
        {
          className: "welcome-img",
          src: "atom://welcome/assets/shortcut.svg"
        }
      )), /* @__PURE__ */ import_etch.default.dom("p", null, "If you only remember one shortcut, make it", " ", /* @__PURE__ */ import_etch.default.dom("kbd", { className: "welcome-key" }, this.getCommandPaletteKeyBinding()), ". That toggles the command palette, which lists every Chevron command."), /* @__PURE__ */ import_etch.default.dom("p", null, "To reopen these guides, open the command palette and search for", " ", /* @__PURE__ */ import_etch.default.dom("span", { className: "text-highlight" }, "Welcome"), "."))
    ))));
  }
  getSectionProps(sectionName) {
    const props = {
      dataset: { section: sectionName },
      onclick: this.didExpandOrCollapseSection
    };
    if (this.props.openSections && this.props.openSections.indexOf(sectionName) !== -1) {
      props.open = true;
    }
    return props;
  }
  getCommandPaletteKeyBinding() {
    if (process.platform === "darwin") {
      return "cmd-shift-p";
    } else {
      return "ctrl-shift-p";
    }
  }
  getApplicationMenuName() {
    if (process.platform === "darwin") {
      return "Chevron";
    } else if (process.platform === "linux") {
      return "Edit";
    } else {
      return "File";
    }
  }
  serialize() {
    return {
      deserializer: this.constructor.name,
      openSections: this.getOpenSections(),
      uri: this.getURI()
    };
  }
  getURI() {
    return this.props.uri;
  }
  getTitle() {
    return "Welcome Guide";
  }
  isEqual(other) {
    return other instanceof GuideView;
  }
  getOpenSections() {
    return Array.from(this.element.querySelectorAll("details[open]")).map(
      (sectionElement) => sectionElement.dataset.section
    );
  }
  didClickProjectButton() {
    this.props.reporterProxy.sendEvent("clicked-project-cta");
    atom.commands.dispatch(
      atom.views.getView(atom.workspace),
      "application:add-project-folder"
    );
  }
  didClickGitButton() {
    this.props.reporterProxy.sendEvent("clicked-git-cta");
    atom.commands.dispatch(
      atom.views.getView(atom.workspace),
      "github:toggle-git-tab"
    );
  }
  didClickGitHubButton() {
    this.props.reporterProxy.sendEvent("clicked-github-cta");
    atom.commands.dispatch(
      atom.views.getView(atom.workspace),
      "github:toggle-github-tab"
    );
  }
  async openSettings(uri) {
    try {
      await atom.packages.activatePackage("settings-view");
    } catch (error) {
      atom.notifications.addError("Could not open Settings", {
        detail: error && error.message ? error.message : String(error),
        dismissable: true
      });
      return;
    }
    return atom.workspace.open(uri, { split: "left" });
  }
  didClickPackagesButton() {
    this.props.reporterProxy.sendEvent("clicked-packages-cta");
    return this.openSettings("atom://config/install");
  }
  didClickThemesButton() {
    this.props.reporterProxy.sendEvent("clicked-themes-cta");
    return this.openSettings("atom://config/themes");
  }
  didClickStylingButton() {
    this.props.reporterProxy.sendEvent("clicked-styling-cta");
    atom.workspace.open("atom://.atom/stylesheet", { split: "left" });
  }
  didClickInitScriptButton() {
    this.props.reporterProxy.sendEvent("clicked-init-script-cta");
    atom.workspace.open("atom://.atom/init-script", { split: "left" });
  }
  didClickSnippetsButton() {
    this.props.reporterProxy.sendEvent("clicked-snippets-cta");
    atom.workspace.open("atom://.atom/snippets", { split: "left" });
  }
  didExpandOrCollapseSection(event) {
    const sectionName = event.currentTarget.closest("details").dataset.section;
    const action = event.currentTarget.hasAttribute("open") ? "collapse" : "expand";
    this.props.reporterProxy.sendEvent(`${action}-${sectionName}-section`);
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
