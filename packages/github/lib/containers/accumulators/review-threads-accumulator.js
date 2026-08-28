"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.BareReviewThreadsAccumulator = void 0;

var _react = _interopRequireDefault(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));


var _helpers = require("../../helpers");

var _propTypes2 = require("../../prop-types");

var _accumulator = _interopRequireDefault(require("./accumulator"));

var _reviewCommentsAccumulator = _interopRequireDefault(require("./review-comments-accumulator"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectSpread2(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class BareReviewThreadsAccumulator extends _react.default.Component {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "renderReviewThreads", (err, threads, loading) => {
      if (err) {
        return this.props.children({
          errors: [err],
          commentThreads: [],
          loading
        });
      }

      return this.renderReviewThread({
        errors: [],
        commentsByThread: new Map(),
        loading
      }, threads);
    });

    _defineProperty(this, "renderReviewThread", (payload, threads) => {
      if (threads.length === 0) {
        const commentThreads = [];
        payload.commentsByThread.forEach((comments, thread) => {
          commentThreads.push({
            thread,
            comments
          });
        });
        return this.props.children({
          commentThreads,
          errors: payload.errors,
          loading: payload.loading
        });
      }

      const [thread] = threads;
      return _react.default.createElement(_reviewCommentsAccumulator.default, {
        onDidRefetch: this.props.onDidRefetch,
        reviewThread: thread
      }, ({
        error,
        comments,
        loading: threadLoading
      }) => {
        if (error) {
          payload.errors.push(error);
        }

        payload.commentsByThread.set(thread, comments);
        payload.loading = payload.loading || threadLoading;
        return this.renderReviewThread(payload, threads.slice(1));
      });
    });
  }

  render() {
    const resultBatch = this.props.pullRequest.reviewThreads.edges.map(edge => edge.node);
    return _react.default.createElement(_accumulator.default, {
      relay: this.props.relay,
      resultBatch: resultBatch,
      onDidRefetch: this.props.onDidRefetch,
      pageSize: _helpers.PAGE_SIZE,
      waitTimeMs: _helpers.PAGINATION_WAIT_TIME_MS
    }, this.renderReviewThreads);
  }

}

exports.BareReviewThreadsAccumulator = BareReviewThreadsAccumulator;

_defineProperty(BareReviewThreadsAccumulator, "propTypes", {
  // Relay props
  relay: _propTypes.default.shape({
    hasMore: _propTypes.default.func.isRequired,
    loadMore: _propTypes.default.func.isRequired,
    isLoading: _propTypes.default.func.isRequired
  }).isRequired,
  pullRequest: _propTypes.default.shape({
    reviewThreads: (0, _propTypes2.RelayConnectionPropType)(_propTypes.default.object)
  }),
  // Render prop. Called with (array of errors, array of threads, map of comments per thread, loading)
  children: _propTypes.default.func.isRequired,
  // Called right after refetch happens
  onDidRefetch: _propTypes.default.func.isRequired
});


exports.default = BareReviewThreadsAccumulator;