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
var welcome_package_exports = {};
__export(welcome_package_exports, {
  default: () => WelcomePackage
});
module.exports = __toCommonJS(welcome_package_exports);
var import_atom = require("chevron");
var import_reporter_proxy = __toESM(require("./reporter-proxy"));
let WelcomeView, GuideView;
const WELCOME_URI = "atom://welcome/welcome";
const GUIDE_URI = "atom://welcome/guide";
class WelcomePackage {
  constructor() {
    this.reporterProxy = new import_reporter_proxy.default();
  }
  async activate() {
    this.subscriptions = new import_atom.CompositeDisposable();
    this.subscriptions.add(
      atom.workspace.addOpener((filePath) => {
        if (filePath === WELCOME_URI) {
          return this.createWelcomeView({ uri: WELCOME_URI });
        }
      })
    );
    this.subscriptions.add(
      atom.workspace.addOpener((filePath) => {
        if (filePath === GUIDE_URI) {
          return this.createGuideView({ uri: GUIDE_URI });
        }
      })
    );
    this.subscriptions.add(
      atom.commands.add(
        "atom-workspace",
        "welcome:show",
        () => this.showWelcome()
      )
    );
    if (atom.config.get("core.telemetryConsent") !== "no") {
      atom.config.set("core.telemetryConsent", "no");
    }
    if (atom.config.get("welcome.showOnStartup")) {
      await this.showWelcome();
      this.reporterProxy.sendEvent("show-on-initial-load");
    }
  }
  showWelcome() {
    return Promise.all([
      atom.workspace.open(WELCOME_URI, { searchAllPanes: true }),
      atom.workspace.open(GUIDE_URI, { searchAllPanes: true })
    ]);
  }
  consumeReporter(reporter) {
    return this.reporterProxy.setReporter(reporter);
  }
  deactivate() {
    this.subscriptions.dispose();
  }
  createWelcomeView(state) {
    if (WelcomeView == null) WelcomeView = require("./welcome-view");
    return new WelcomeView({ reporterProxy: this.reporterProxy, ...state });
  }
  createGuideView(state) {
    if (GuideView == null) GuideView = require("./guide-view");
    return new GuideView({ reporterProxy: this.reporterProxy, ...state });
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
