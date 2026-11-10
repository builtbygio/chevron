"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireDefault(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _yubikiri = _interopRequireDefault(require("yubikiri"));

var _eventKit = require("event-kit");

var _observeModel = _interopRequireDefault(require("../views/observe-model"));

var _loadingView = _interopRequireDefault(require("../views/loading-view"));

var _errorView = _interopRequireDefault(require("../views/error-view"));

var _keys = require("../models/repository-states/cache/keys");

var _commitDetailController = _interopRequireDefault(require("../controllers/commit-detail-controller"));

// `git branch --contains` is only used to show a "view on GitHub" link.
// It must not keep the commit itself on the spinner.
const PUSHED_CHECK_TIMEOUT_MS = 8000;

// A hung git read used to leave this view on LoadingView forever.
const COMMIT_LOAD_TIMEOUT_MS = 30000;

function errorMessage(error) {
  const message = error && error.message ? String(error.message) : '';
  const line = message.split('\n')[0].trim();
  return line || 'The commit could not be loaded.';
}

function firstToFinish(promise, ms, fallback) {
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  const finished = promise.then(value => {
    clearTimeout(timer);
    return value;
  }, () => {
    clearTimeout(timer);
    return fallback;
  });
  return Promise.race([finished, timeout]);
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class CommitDetailContainer extends _react.default.Component {
  constructor(props) {
    super(props);

    _defineProperty(this, "retry", () => {
      const repository = this.props.repository;

      if (repository && typeof repository.acceptInvalidation === 'function') {
        repository.acceptInvalidation(() => [_keys.Keys.commit.oneWith(this.props.sha)]);
      }
    });

    _defineProperty(this, "fetchData", async repository => {
      let timer;

      try {
        return await Promise.race([(0, _yubikiri.default)({
          commit: repository.getCommit(this.props.sha),
          currentBranch: repository.getCurrentBranch(),
          currentRemote: async query => repository.getRemoteForBranch((await query.currentBranch).getName()),
          isCommitPushed: firstToFinish(repository.isCommitPushed(this.props.sha), PUSHED_CHECK_TIMEOUT_MS, false)
        }), new Promise((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error('Loading this commit took too long.'));
          }, COMMIT_LOAD_TIMEOUT_MS);
        })]);
      } catch (error) {
        // The model observer keeps the previous result when a fetch rejects.
        // While that result is still null, the view below would spin forever.
        return {
          __error: errorMessage(error)
        };
      } finally {
        if (timer) clearTimeout(timer);
      }
    });

    _defineProperty(this, "renderResult", data => {
      if (data && data.__error) {
        this.sub.dispose();
        this.sub = new _eventKit.CompositeDisposable();
        this.lastCommit = null;
        return _react.default.createElement(_errorView.default, {
          title: 'Unable to open this commit',
          descriptions: [data.__error],
          retry: this.retry
        });
      }

      const currentCommit = data && data.commit;

      if (currentCommit !== this.lastCommit) {
        this.sub.dispose();

        if (currentCommit && currentCommit.isPresent()) {
          this.sub = new _eventKit.CompositeDisposable(...currentCommit.getMultiFileDiff().getFilePatches().map(fp => fp.onDidChangeRenderStatus(() => {
            this.forceUpdate();
          })));
        } else {
          this.sub = new _eventKit.CompositeDisposable();
        }

        this.lastCommit = currentCommit;
      }

      if (this.props.repository.isLoading() || data === null) {
        return _react.default.createElement(_loadingView.default, null);
      }

      if (!data.commit || !data.commit.isPresent()) {
        return _react.default.createElement(_errorView.default, {
          title: 'Commit not found',
          descriptions: ['This commit is not in the repository.'],
          retry: this.retry
        });
      }

      return _react.default.createElement(_commitDetailController.default, _extends({}, data, this.props));
    });

    this.lastCommit = null;
    this.sub = new _eventKit.CompositeDisposable();
  }

  render() {
    return _react.default.createElement(_observeModel.default, {
      model: this.props.repository,
      fetchData: this.fetchData
    }, this.renderResult);
  }

  componentWillUnmount() {
    this.sub.dispose();
  }

}

exports.default = CommitDetailContainer;

_defineProperty(CommitDetailContainer, "propTypes", {
  repository: _propTypes.default.object.isRequired,
  sha: _propTypes.default.string.isRequired,
  itemType: _propTypes.default.func.isRequired
});