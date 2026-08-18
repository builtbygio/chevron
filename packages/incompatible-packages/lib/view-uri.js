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
var view_uri_exports = {};
__export(view_uri_exports, {
  default: () => view_uri_default
});
module.exports = __toCommonJS(view_uri_exports);
var view_uri_default = "chevron://incompatible-packages";

// Chevron: Node require() interop for default-only esbuild ESM modules
if (module.exports && module.exports.__esModule && module.exports.default != null) {
  var __keys = Object.keys(module.exports).filter(function (k) {
    return k !== '__esModule' && k !== 'default';
  });
  if (__keys.length === 0) {
    module.exports = module.exports.default;
  }
}
