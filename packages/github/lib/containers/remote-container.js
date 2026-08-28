"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireDefault(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _propTypes2 = require("../prop-types");

var _remoteController = _interopRequireDefault(require("../controllers/remote-controller"));

var _loadingView = _interopRequireDefault(require("../views/loading-view"));

var _queryErrorView = _interopRequireDefault(require("../views/query-error-view"));

var _graphqlQuery = _interopRequireDefault(require("../views/graphql-query"));

var _remoteContainerQuery = _interopRequireDefault(require("../graphql/remote-container-query"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class RemoteContainer extends _react.default.Component {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "renderWithResult", ({
      error,
      data,
      retry
    }) => {
      this.props.refresher.setRetryCallback(this, retry);

      if (error) {
        return _react.default.createElement(_queryErrorView.default, {
          error: error,
          login: this.props.handleLogin,
          logout: this.props.handleLogout,
          retry: retry
        });
      }

      if (data === null) {
        return _react.default.createElement(_loadingView.default, null);
      }

      return _react.default.createElement(_remoteController.default, {
        endpoint: this.props.endpoint,
        token: this.props.token,
        repository: data.repository,
        workingDirectory: this.props.workingDirectory,
        workspace: this.props.workspace,
        remote: this.props.remote,
        remotes: this.props.remotes,
        branches: this.props.branches,
        aheadCount: this.props.aheadCount,
        pushInProgress: this.props.pushInProgress,
        onPushBranch: this.props.onPushBranch
      });
    });
  }

  render() {
    return _react.default.createElement(_graphqlQuery.default, {
      endpoint: this.props.endpoint,
      token: this.props.token,
      query: _remoteContainerQuery.default,
      variables: {
        owner: this.props.remote.getOwner(),
        name: this.props.remote.getRepo()
      },
      render: this.renderWithResult
    });
  }

}

exports.default = RemoteContainer;

_defineProperty(RemoteContainer, "propTypes", {
  endpoint: _propTypes2.EndpointPropType.isRequired,
  token: _propTypes2.TokenPropType.isRequired,
  refresher: _propTypes2.RefresherPropType.isRequired,
  pushInProgress: _propTypes.default.bool.isRequired,
  workingDirectory: _propTypes.default.string,
  workspace: _propTypes.default.object.isRequired,
  remote: _propTypes2.RemotePropType.isRequired,
  remotes: _propTypes2.RemoteSetPropType.isRequired,
  branches: _propTypes2.BranchSetPropType.isRequired,
  aheadCount: _propTypes.default.number,
  handleLogin: _propTypes.default.func.isRequired,
  handleLogout: _propTypes.default.func.isRequired,
  onPushBranch: _propTypes.default.func.isRequired
});
