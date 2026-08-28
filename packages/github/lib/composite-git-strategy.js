"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _os = _interopRequireDefault(require("os"));

var _helpers = require("./helpers");

var _asyncQueue = _interopRequireDefault(require("./async-queue"));

var _gitShellOutStrategy = _interopRequireDefault(require("./git-shell-out-strategy"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectSpread2(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var _default = {
  create(workingDir, options = {}) {
    return this.withStrategies([_gitShellOutStrategy.default])(workingDir, options);
  },

  withStrategies(strategies) {
    return function createForStrategies(workingDir, options = {}) {
      const parallelism = options.parallelism || Math.max(3, _os.default.cpus().length);
      const commandQueue = new _asyncQueue.default({
        parallelism
      });

      const strategyOptions = _objectSpread2({}, options, {
        queue: commandQueue
      });

      const strategyInstances = strategies.map(Strategy => new Strategy(workingDir, strategyOptions));
      return (0, _helpers.firstImplementer)(...strategyInstances);
    };
  }

};
exports.default = _default;