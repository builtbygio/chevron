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
var async_spec_helpers_exports = {};
__export(async_spec_helpers_exports, {
  conditionPromise: () => conditionPromise,
  timeoutPromise: () => timeoutPromise
});
module.exports = __toCommonJS(async_spec_helpers_exports);
async function conditionPromise(condition, description = "anonymous condition") {
  const startTime = Date.now();
  while (true) {
    await timeoutPromise(100);
    if (await condition()) {
      return;
    }
    if (Date.now() - startTime > 5e3) {
      throw new Error("Timed out waiting on " + description);
    }
  }
}
function timeoutPromise(timeout) {
  return new Promise(function(resolve) {
    global.setTimeout(resolve, timeout);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  conditionPromise,
  timeoutPromise
});
