"use strict";

var _githubPackage = _interopRequireDefault(require("./github-package"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

let pack;
const entry = {
  initialize() {
    pack = new _githubPackage.default({
      workspace: chevron.workspace,
      project: chevron.project,
      commands: chevron.commands,
      notificationManager: chevron.notifications,
      tooltips: chevron.tooltips,
      styles: chevron.styles,
      keymaps: chevron.keymaps,
      grammars: chevron.grammars,
      config: chevron.config,
      deserializers: chevron.deserializers,
      confirm: chevron.confirm.bind(chevron),
      getLoadSettings: chevron.getLoadSettings.bind(chevron),
      currentWindow: chevron.getCurrentWindow(),
      configDirPath: chevron.getConfigDirPath()
    });
  }

};
module.exports = new Proxy(entry, {
  get(target, name) {
    if (pack && Reflect.has(pack, name)) {
      let item = pack[name];

      if (typeof item === 'function') {
        item = item.bind(pack);
      }

      return item;
    } else {
      return target[name];
    }
  }

});