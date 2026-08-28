"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireDefault(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _eventKit = require("event-kit");

var _helpers = require("../helpers");

var _propTypes2 = require("../prop-types");

var _issueishListController = require("../controllers/issueish-list-controller");

var _createPullRequestTile = _interopRequireDefault(require("../views/create-pull-request-tile"));

var _graphqlQuery = _interopRequireDefault(require("../views/graphql-query"));

var _loadRecovered = require("../graphql/load-recovered");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const CURRENT_PR_QUERY = (0, _loadRecovered.loadRecovered)('currentPullRequestContainerQuery');

function pullRequestNodes(nodes) {
  return (nodes || []).filter(node => node && node.commits);
}

class CurrentPullRequestContainer extends _react.default.Component {
  constructor(props) {
    super(props);
    (0, _helpers.autobind)(this, 'renderQueryResult', 'renderEmptyTile');
    this.sub = new _eventKit.Disposable();
  }

  render() {
    const head = this.props.branches.getHeadBranch();

    if (!head.isPresent()) {
      return this.renderEmptyResult();
    }

    const push = head.getPush();

    if (!push.isPresent() || !push.isRemoteTracking()) {
      return this.renderEmptyResult();
    }

    const pushRemote = this.props.remotes.withName(push.getRemoteName());

    if (!pushRemote.isPresent() || !pushRemote.isGithubRepo()) {
      return this.renderEmptyResult();
    }

    return _react.default.createElement(_graphqlQuery.default, {
      endpoint: this.props.endpoint,
      token: this.props.token,
      query: CURRENT_PR_QUERY,
      variables: {
        headOwner: pushRemote.getOwner(),
        headName: pushRemote.getRepo(),
        headRef: push.getRemoteRef(),
        first: this.props.limit,
        checkSuiteCount: _helpers.CHECK_SUITE_PAGE_SIZE,
        checkSuiteCursor: null,
        checkRunCount: _helpers.CHECK_RUN_PAGE_SIZE,
        checkRunCursor: null
      },
      render: this.renderQueryResult
    });
  }

  renderEmptyResult() {
    return _react.default.createElement(_issueishListController.BareIssueishListController, _extends({
      isLoading: false
    }, this.controllerProps()));
  }

  renderQueryResult({
    error,
    data
  }) {
    if (error) {
      return _react.default.createElement(_issueishListController.BareIssueishListController, _extends({
        isLoading: false,
        error: error
      }, this.controllerProps()));
    }

    if (data === null) {
      return _react.default.createElement(_issueishListController.BareIssueishListController, _extends({
        isLoading: true
      }, this.controllerProps()));
    }

    if (!data.repository || !data.repository.ref) {
      return _react.default.createElement(_issueishListController.BareIssueishListController, _extends({
        isLoading: false
      }, this.controllerProps()));
    }

    const associatedPullRequests = data.repository.ref.associatedPullRequests;
    return _react.default.createElement(_issueishListController.BareIssueishListController, _extends({
      total: associatedPullRequests.totalCount,
      results: pullRequestNodes(associatedPullRequests.nodes),
      isLoading: false,
      endpoint: this.props.endpoint,
      resultFilter: issueish => issueish.getHeadRepositoryID() === this.props.repository.id
    }, this.controllerProps()));
  }

  renderEmptyTile() {
    return _react.default.createElement(_createPullRequestTile.default, {
      repository: this.props.repository,
      remote: this.props.remote,
      branches: this.props.branches,
      aheadCount: this.props.aheadCount,
      pushInProgress: this.props.pushInProgress,
      onCreatePr: this.props.onCreatePr
    });
  }

  componentWillUnmount() {
    this.sub.dispose();
  }

  controllerProps() {
    return {
      title: 'Checked out pull request',
      onOpenIssueish: this.props.onOpenIssueish,
      onOpenReviews: this.props.onOpenReviews,
      emptyComponent: this.renderEmptyTile,
      needReviewsButton: true
    };
  }

}

exports.default = CurrentPullRequestContainer;

_defineProperty(CurrentPullRequestContainer, "propTypes", {
  repository: _propTypes.default.shape({
    id: _propTypes.default.string.isRequired,
    defaultBranchRef: _propTypes.default.shape({
      prefix: _propTypes.default.string.isRequired,
      name: _propTypes.default.string.isRequired
    })
  }).isRequired,
  endpoint: _propTypes2.EndpointPropType.isRequired,
  token: _propTypes.default.string.isRequired,
  limit: _propTypes.default.number,
  remote: _propTypes2.RemotePropType.isRequired,
  remotes: _propTypes2.RemoteSetPropType.isRequired,
  branches: _propTypes2.BranchSetPropType.isRequired,
  aheadCount: _propTypes.default.number,
  pushInProgress: _propTypes.default.bool.isRequired,
  onOpenIssueish: _propTypes.default.func.isRequired,
  onOpenReviews: _propTypes.default.func.isRequired,
  onCreatePr: _propTypes.default.func.isRequired
});

_defineProperty(CurrentPullRequestContainer, "defaultProps", {
  limit: 5
});
