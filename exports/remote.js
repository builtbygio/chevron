// Compat re-export. Not a product API. Remove after the github epic + PR 9.
const Grim = require('grim');
Grim.deprecate(
  'require("remote") is unsupported. Use require("chevron") (workspace, clipboard, confirm). require("electron").remote is a compat shim slated for removal.'
);

module.exports = require('electron').remote;

// Ensure each package that requires this shim causes a deprecation warning
delete require.cache[__filename];
