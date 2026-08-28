"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.BareCheckRunsAccumulator = void 0;

var _react = _interopRequireDefault(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));


var _propTypes2 = require("../../prop-types");

var _helpers = require("../../helpers");

var _accumulator = _interopRequireDefault(require("./accumulator"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectSpread2(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class BareCheckRunsAccumulator extends _react.default.Component {
  render() {
    const resultBatch = this.props.checkSuite.checkRuns.edges.map(edge => edge.node);
    return _react.default.createElement(_accumulator.default, {
      relay: this.props.relay,
      resultBatch: resultBatch,
      onDidRefetch: this.props.onDidRefetch,
      pageSize: _helpers.PAGE_SIZE,
      waitTimeMs: _helpers.PAGINATION_WAIT_TIME_MS
    }, (error, checkRuns, loading) => this.props.children({
      error,
      checkRuns,
      loading
    }));
  }

}

exports.BareCheckRunsAccumulator = BareCheckRunsAccumulator;

_defineProperty(BareCheckRunsAccumulator, "propTypes", {
  // Relay props
  relay: _propTypes.default.shape({
    hasMore: _propTypes.default.func.isRequired,
    loadMore: _propTypes.default.func.isRequired,
    isLoading: _propTypes.default.func.isRequired
  }),
  checkSuite: _propTypes.default.shape({
    checkRuns: (0, _propTypes2.RelayConnectionPropType)(_propTypes.default.object)
  }),
  // Render prop.
  children: _propTypes.default.func.isRequired,
  // Called when a refetch is triggered.
  onDidRefetch: _propTypes.default.func.isRequired
});


exports.default = BareCheckRunsAccumulator;