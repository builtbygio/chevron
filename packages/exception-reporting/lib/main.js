var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var main_exports = {};
__export(main_exports, {
  default: () => main_default
});
module.exports = __toCommonJS(main_exports);
var import_atom = require("chevron");
let reporter;
function getReporter() {
  if (!reporter) {
    const Reporter = require("./reporter");
    reporter = new Reporter();
  }
  return reporter;
}
var main_default = {
  activate() {
    this.subscriptions = new import_atom.CompositeDisposable();
    if (!atom.config.get("exception-reporting.userId")) {
      atom.config.set("exception-reporting.userId", require("node-uuid").v4());
    }
    this.subscriptions.add(
      atom.onDidThrowError(({ message, url, line, column, originalError }) => {
        try {
          getReporter().reportUncaughtException(originalError);
        } catch (secondaryException) {
          try {
            console.error(
              "Error reporting uncaught exception",
              secondaryException
            );
            getReporter().reportUncaughtException(secondaryException);
          } catch (error) {
          }
        }
      })
    );
    if (atom.onDidFailAssertion != null) {
      this.subscriptions.add(
        atom.onDidFailAssertion((error) => {
          try {
            getReporter().reportFailedAssertion(error);
          } catch (secondaryException) {
            try {
              console.error(
                "Error reporting assertion failure",
                secondaryException
              );
              getReporter().reportUncaughtException(secondaryException);
            } catch (error2) {
            }
          }
        })
      );
    }
  }
};

// Chevron: Node require() interop for default-only esbuild ESM modules
if (module.exports && module.exports.__esModule && module.exports.default != null) {
  var __keys = Object.keys(module.exports).filter(function (k) {
    return k !== '__esModule' && k !== 'default';
  });
  if (__keys.length === 0) {
    module.exports = module.exports.default;
  }
}
