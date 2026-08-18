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
var welcome_view_exports = {};
__export(welcome_view_exports, {
  default: () => WelcomeView
});
module.exports = __toCommonJS(welcome_view_exports);
var import_etch = __toESM(require("etch"));
class WelcomeView {
  constructor(props) {
    this.props = props;
    this.didChangeShowOnStartup = this.didChangeShowOnStartup.bind(this);
    this.didClickOpenProject = this.didClickOpenProject.bind(this);
    this.didClickInstallShellCommands = this.didClickInstallShellCommands.bind(
      this
    );
    this.didClickShowGuide = this.didClickShowGuide.bind(this);
    import_etch.default.initialize(this);
    this.element.addEventListener("click", (event) => {
      const link = event.target.closest("a");
      if (link && link.dataset.event) {
        this.props.reporterProxy.sendEvent(
          `clicked-welcome-${link.dataset.event}-link`
        );
      }
    });
  }
  didChangeShowOnStartup(event) {
    chevron.config.set("welcome.showOnStartup", event.target.checked);
  }
  didClickOpenProject() {
    this.props.reporterProxy.sendEvent("clicked-welcome-open-project");
    chevron.commands.dispatch(
      chevron.views.getView(chevron.workspace),
      "application:add-project-folder"
    );
  }
  didClickInstallShellCommands() {
    this.props.reporterProxy.sendEvent("clicked-welcome-shell-commands");
    chevron.commands.dispatch(
      chevron.views.getView(chevron.workspace),
      "window:install-shell-commands"
    );
  }
  didClickShowGuide() {
    this.props.reporterProxy.sendEvent("clicked-welcome-show-guide");
    chevron.workspace.open("chevron://welcome/guide", { searchAllPanes: true });
  }
  update() {
  }
  serialize() {
    return {
      deserializer: "WelcomeView",
      uri: this.props.uri
    };
  }
  render() {
    const showShellNudge = process.platform === "darwin" || process.platform === "linux";
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "welcome" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "welcome-container" }, /* @__PURE__ */ import_etch.default.dom("header", { className: "welcome-header" }, /* @__PURE__ */ import_etch.default.dom("a", { href: "https://github.com/builtbygio/chevron" }, /* @__PURE__ */ import_etch.default.dom(
      "svg",
      {
        className: "welcome-logo",
        width: "280px",
        height: "64px",
        viewBox: "0 0 280 64",
        "aria-label": "Chevron"
      },
      /* @__PURE__ */ import_etch.default.dom("g", { fill: "currentColor", transform: "translate(4, 8)" }, /* @__PURE__ */ import_etch.default.dom("path", { d: "M4 4 L22 24 L4 44 L12 44 L30 24 L12 4 Z M26 4 L44 24 L26 44 L34 44 L52 24 L34 4 Z" })),
      /* @__PURE__ */ import_etch.default.dom(
        "text",
        {
          x: "72",
          y: "42",
          fill: "currentColor",
          "font-family": "-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif",
          "font-size": "36",
          "font-weight": "600",
          "letter-spacing": "-0.5"
        },
        "Chevron"
      )
    ), /* @__PURE__ */ import_etch.default.dom("h1", { className: "welcome-title" }, "Hackable. Fast. Yours."))), /* @__PURE__ */ import_etch.default.dom("section", { className: "welcome-panel" }, /* @__PURE__ */ import_etch.default.dom("p", null, "Chevron is a modernised fork of Atom. Use", " ", /* @__PURE__ */ import_etch.default.dom("code", null, "require('chevron')"), " and ", /* @__PURE__ */ import_etch.default.dom("code", null, "engines.chevron"), ". ", /* @__PURE__ */ import_etch.default.dom("code", null, "atom"), " names are unsupported legacy aliases."), /* @__PURE__ */ import_etch.default.dom("p", null, "This window also opens the ", /* @__PURE__ */ import_etch.default.dom("strong", null, "Welcome Guide"), " tab — short walkthroughs for projects, Git, packages, and customization. You can reopen both anytime from the Help menu or the command palette (", /* @__PURE__ */ import_etch.default.dom("span", { className: "text-highlight" }, "Welcome"), ")."), /* @__PURE__ */ import_etch.default.dom("p", null, /* @__PURE__ */ import_etch.default.dom(
      "button",
      {
        className: "btn btn-primary inline-block",
        onclick: this.didClickOpenProject
      },
      "Open a Project"
    ), /* @__PURE__ */ import_etch.default.dom(
      "button",
      {
        className: "btn inline-block",
        onclick: this.didClickShowGuide
      },
      "Focus Welcome Guide"
    ), showShellNudge ? /* @__PURE__ */ import_etch.default.dom(
      "button",
      {
        className: "btn inline-block",
        onclick: this.didClickInstallShellCommands
      },
      "Install Shell Commands"
    ) : null), showShellNudge ? /* @__PURE__ */ import_etch.default.dom("p", { className: "welcome-note" }, /* @__PURE__ */ import_etch.default.dom("strong", null, "Shell commands:"), " installs", " ", /* @__PURE__ */ import_etch.default.dom("code", null, "chevron"), ", ", /* @__PURE__ */ import_etch.default.dom("code", null, "atom"), ", ", /* @__PURE__ */ import_etch.default.dom("code", null, "cpm"), ", and", " ", /* @__PURE__ */ import_etch.default.dom("code", null, "apm"), " on your PATH (same as Chevron → Install Shell Commands). ", /* @__PURE__ */ import_etch.default.dom("code", null, "apm"), " is a shim to ", /* @__PURE__ */ import_etch.default.dom("code", null, "cpm"), ". Also available later from the application menu.") : /* @__PURE__ */ import_etch.default.dom("p", { className: "welcome-note" }, /* @__PURE__ */ import_etch.default.dom("strong", null, "Tip:"), " On macOS you can install", " ", /* @__PURE__ */ import_etch.default.dom("code", null, "chevron"), " / ", /* @__PURE__ */ import_etch.default.dom("code", null, "atom"), " / ", /* @__PURE__ */ import_etch.default.dom("code", null, "cpm"), " /", " ", /* @__PURE__ */ import_etch.default.dom("code", null, "apm"), " on PATH from the application menu. On Linux/Windows, use your package install or PATH setup from the build docs.")), /* @__PURE__ */ import_etch.default.dom("section", { className: "welcome-panel" }, /* @__PURE__ */ import_etch.default.dom("h2", { className: "welcome-title", style: { fontSize: "1.25em" } }, "What works / what is early"), /* @__PURE__ */ import_etch.default.dom("ul", null, /* @__PURE__ */ import_etch.default.dom("li", null, /* @__PURE__ */ import_etch.default.dom("strong", null, "Works today:"), " multi-platform builds, Electron 43, Chevron-only API (", /* @__PURE__ */ import_etch.default.dom("code", null, "require('chevron')"), ", ", /* @__PURE__ */ import_etch.default.dom("code", null, "engines.chevron"), "),", " ", /* @__PURE__ */ import_etch.default.dom("code", null, "cpm"), ", owned bundled packages."), /* @__PURE__ */ import_etch.default.dom("li", null, /* @__PURE__ */ import_etch.default.dom("strong", null, "1.0 unsigned preview:"), " not codesigned. Owned catalog only — no community store. Downloads:", " ", /* @__PURE__ */ import_etch.default.dom("a", { href: "https://github.com/builtbygio/chevron/releases" }, "GitHub Releases"), "."), /* @__PURE__ */ import_etch.default.dom("li", null, "Docs and issues:", " ", /* @__PURE__ */ import_etch.default.dom(
      "a",
      {
        href: "https://github.com/builtbygio/chevron",
        dataset: { event: "chevron-repo" }
      },
      "builtbygio/chevron"
    ), "."))), /* @__PURE__ */ import_etch.default.dom("section", { className: "welcome-panel" }, /* @__PURE__ */ import_etch.default.dom("p", null, "For help"), /* @__PURE__ */ import_etch.default.dom("ul", null, /* @__PURE__ */ import_etch.default.dom("li", null, "The", " ", /* @__PURE__ */ import_etch.default.dom(
      "a",
      {
        href: "https://github.com/builtbygio/chevron",
        dataset: { event: "chevron-repo-help" }
      },
      "Chevron repository"
    ), " ", "for docs, issues, and releases."), /* @__PURE__ */ import_etch.default.dom("li", null, "Community packages use the Atom package API (", /* @__PURE__ */ import_etch.default.dom("code", null, "global.atom"), ", ", /* @__PURE__ */ import_etch.default.dom("code", null, "engines.atom"), "). Install with ", /* @__PURE__ */ import_etch.default.dom("code", null, "cpm"), " (or the ", /* @__PURE__ */ import_etch.default.dom("code", null, "apm"), " shim)."), /* @__PURE__ */ import_etch.default.dom("li", null, "Historical Atom references:", " ", /* @__PURE__ */ import_etch.default.dom(
      "a",
      {
        href: "https://github.com/atom/atom",
        dataset: { event: "atom-archive" }
      },
      "atom/atom archive"
    ), "."))), /* @__PURE__ */ import_etch.default.dom("section", { className: "welcome-panel" }, /* @__PURE__ */ import_etch.default.dom("label", null, /* @__PURE__ */ import_etch.default.dom(
      "input",
      {
        className: "input-checkbox",
        type: "checkbox",
        checked: chevron.config.get("welcome.showOnStartup"),
        onchange: this.didChangeShowOnStartup
      }
    ), "Show Welcome and Guide when opening Chevron"), /* @__PURE__ */ import_etch.default.dom("p", { className: "welcome-note" }, "When checked, every new window opens these panes until you uncheck this box.")), /* @__PURE__ */ import_etch.default.dom("footer", { className: "welcome-footer" }, /* @__PURE__ */ import_etch.default.dom(
      "a",
      {
        href: "https://github.com/builtbygio/chevron",
        dataset: { event: "footer-chevron" }
      },
      "builtbygio/chevron"
    ))));
  }
  getURI() {
    return this.props.uri;
  }
  getTitle() {
    return "Welcome";
  }
  isEqual(other) {
    return other instanceof WelcomeView;
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
