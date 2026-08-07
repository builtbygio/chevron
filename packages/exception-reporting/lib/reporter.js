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
var reporter_exports = {};
__export(reporter_exports, {
  default: () => Reporter
});
module.exports = __toCommonJS(reporter_exports);
var import_os = __toESM(require("os"));
var import_stack_trace = __toESM(require("stack-trace"));
var import_fs_plus = __toESM(require("fs-plus"));
var import_path = __toESM(require("path"));
const API_KEY = "7ddca14cb60cbd1cd12d1b252473b076";
const LIB_VERSION = require("../package.json")["version"];
const StackTraceCache = /* @__PURE__ */ new WeakMap();
class Reporter {
  constructor(params = {}) {
    this.request = params.request || window.fetch;
    this.alwaysReport = params.hasOwnProperty("alwaysReport") ? params.alwaysReport : false;
    this.reportPreviousErrors = params.hasOwnProperty("reportPreviousErrors") ? params.reportPreviousErrors : true;
    this.resourcePath = this.normalizePath(
      params.resourcePath || process.resourcesPath
    );
    this.reportedErrors = [];
    this.reportedAssertionFailures = [];
  }
  buildNotificationJSON(error, params) {
    return {
      apiKey: API_KEY,
      notifier: {
        name: "Atom",
        version: LIB_VERSION,
        url: "https://www.atom.io"
      },
      events: [
        {
          payloadVersion: "2",
          exceptions: [this.buildExceptionJSON(error, params.projectRoot)],
          severity: params.severity,
          user: {
            id: params.userId
          },
          app: {
            version: params.appVersion,
            releaseStage: params.releaseStage
          },
          device: {
            osVersion: params.osVersion
          },
          metaData: error.metadata
        }
      ]
    };
  }
  buildExceptionJSON(error, projectRoot) {
    return {
      errorClass: error.constructor.name,
      message: error.message,
      stacktrace: this.buildStackTraceJSON(error, projectRoot)
    };
  }
  buildStackTraceJSON(error, projectRoot) {
    return this.parseStackTrace(error).map((callSite) => {
      return {
        file: this.scrubPath(callSite.getFileName()),
        method: callSite.getMethodName() || callSite.getFunctionName() || "none",
        lineNumber: callSite.getLineNumber(),
        columnNumber: callSite.getColumnNumber(),
        inProject: !/node_modules/.test(callSite.getFileName())
      };
    });
  }
  normalizePath(pathToNormalize) {
    return pathToNormalize.replace("file:///", "").replace(/\\/g, "/");
  }
  scrubPath(pathToScrub) {
    const absolutePath = this.normalizePath(pathToScrub);
    if (this.isBundledFile(absolutePath)) {
      return this.normalizePath(import_path.default.relative(this.resourcePath, absolutePath));
    } else {
      return absolutePath.replace(this.normalizePath(import_fs_plus.default.getHomeDirectory()), "~").replace(/.*(\/packages\/.*)/, "$1");
    }
  }
  getDefaultNotificationParams() {
    return {
      userId: atom.config.get("exception-reporting.userId"),
      appVersion: atom.getVersion(),
      releaseStage: this.getReleaseChannel(atom.getVersion()),
      projectRoot: atom.getLoadSettings().resourcePath,
      osVersion: `${import_os.default.platform()}-${import_os.default.arch()}-${import_os.default.release()}`
    };
  }
  getReleaseChannel(version) {
    return version.indexOf("beta") > -1 ? "beta" : version.indexOf("dev") > -1 ? "dev" : "stable";
  }
  performRequest(json) {
    this.request.call(null, "https://notify.bugsnag.com", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(json)
    });
  }
  shouldReport(error) {
    if (this.alwaysReport) return true;
    if (atom.config.get("core.telemetryConsent") !== "limited") return false;
    if (atom.inDevMode()) return false;
    const topFrame = this.parseStackTrace(error)[0];
    const fileName = topFrame ? topFrame.getFileName() : null;
    return fileName && (this.isBundledFile(fileName) || this.isTeletypeFile(fileName));
  }
  parseStackTrace(error) {
    let callSites = StackTraceCache.get(error);
    if (callSites) {
      return callSites;
    } else {
      callSites = import_stack_trace.default.parse(error);
      StackTraceCache.set(error, callSites);
      return callSites;
    }
  }
  requestPrivateMetadataConsent(error, message, reportFn) {
    let notification, dismissSubscription;
    function reportWithoutPrivateMetadata() {
      if (dismissSubscription) {
        dismissSubscription.dispose();
      }
      delete error.privateMetadata;
      delete error.privateMetadataDescription;
      reportFn(error);
      if (notification) {
        notification.dismiss();
      }
    }
    function reportWithPrivateMetadata() {
      if (error.metadata == null) {
        error.metadata = {};
      }
      for (let key in error.privateMetadata) {
        let value = error.privateMetadata[key];
        error.metadata[key] = value;
      }
      reportWithoutPrivateMetadata();
    }
    const name = error.privateMetadataRequestName;
    if (name != null) {
      if (localStorage.getItem(`private-metadata-request:${name}`)) {
        return reportWithoutPrivateMetadata(error);
      } else {
        localStorage.setItem(`private-metadata-request:${name}`, true);
      }
    }
    notification = atom.notifications.addInfo(message, {
      detail: error.privateMetadataDescription,
      description: "Are you willing to submit this information to a private server for debugging purposes?",
      dismissable: true,
      buttons: [
        {
          text: "No",
          onDidClick: reportWithoutPrivateMetadata
        },
        {
          text: "Yes, Submit for Debugging",
          onDidClick: reportWithPrivateMetadata
        }
      ]
    });
    dismissSubscription = notification.onDidDismiss(
      reportWithoutPrivateMetadata
    );
  }
  addPackageMetadata(error) {
    let activePackages = atom.packages.getActivePackages();
    const availablePackagePaths = atom.packages.getPackageDirPaths();
    if (activePackages.length > 0) {
      let userPackages = {};
      let bundledPackages = {};
      for (let pack of atom.packages.getActivePackages()) {
        if (availablePackagePaths.includes(import_path.default.dirname(pack.path))) {
          userPackages[pack.name] = pack.metadata.version;
        } else {
          bundledPackages[pack.name] = pack.metadata.version;
        }
      }
      if (error.metadata == null) {
        error.metadata = {};
      }
      error.metadata.bundledPackages = bundledPackages;
      error.metadata.userPackages = userPackages;
    }
  }
  addPreviousErrorsMetadata(error) {
    if (!this.reportPreviousErrors) return;
    if (!error.metadata) error.metadata = {};
    error.metadata.previousErrors = this.reportedErrors.map(
      (error2) => error2.message
    );
    error.metadata.previousAssertionFailures = this.reportedAssertionFailures.map(
      (error2) => error2.message
    );
  }
  reportUncaughtException(error) {
    if (!this.shouldReport(error)) return;
    this.addPackageMetadata(error);
    this.addPreviousErrorsMetadata(error);
    if (error.privateMetadata != null && error.privateMetadataDescription != null) {
      this.requestPrivateMetadataConsent(
        error,
        "The Atom team would like to collect the following information to resolve this error:",
        (error2) => this.reportUncaughtException(error2)
      );
      return;
    }
    let params = this.getDefaultNotificationParams();
    params.severity = "error";
    this.performRequest(this.buildNotificationJSON(error, params));
    this.reportedErrors.push(error);
  }
  reportFailedAssertion(error) {
    if (!this.shouldReport(error)) return;
    this.addPackageMetadata(error);
    this.addPreviousErrorsMetadata(error);
    if (error.privateMetadata != null && error.privateMetadataDescription != null) {
      this.requestPrivateMetadataConsent(
        error,
        "The Atom team would like to collect some information to resolve an unexpected condition:",
        (error2) => this.reportFailedAssertion(error2)
      );
      return;
    }
    let params = this.getDefaultNotificationParams();
    params.severity = "warning";
    this.performRequest(this.buildNotificationJSON(error, params));
    this.reportedAssertionFailures.push(error);
  }
  // Used in specs
  setRequestFunction(requestFunction) {
    this.request = requestFunction;
  }
  isBundledFile(fileName) {
    return this.normalizePath(fileName).indexOf(this.resourcePath) === 0;
  }
  isTeletypeFile(fileName) {
    const teletypePath = atom.packages.resolvePackagePath("teletype");
    return teletypePath && this.normalizePath(fileName).indexOf(teletypePath) === 0;
  }
}
Reporter.API_KEY = API_KEY;
Reporter.LIB_VERSION = LIB_VERSION;
