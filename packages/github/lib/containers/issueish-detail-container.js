"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireDefault(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _yubikiri = _interopRequireDefault(require("yubikiri"));

var _helpers = require("../helpers");

var _propTypes2 = require("../prop-types");

var _keytarStrategy = require("../shared/keytar-strategy");

var _githubLoginView = _interopRequireDefault(require("../views/github-login-view"));

var _loadingView = _interopRequireDefault(require("../views/loading-view"));

var _queryErrorView = _interopRequireDefault(require("../views/query-error-view"));

var _errorView = _interopRequireDefault(require("../views/error-view"));

var _observeModel = _interopRequireDefault(require("../views/observe-model"));

var _aggregatedReviewsJson = _interopRequireDefault(require("./aggregated-reviews-json"));

var _issueishDetailController = require("../controllers/issueish-detail-controller");

var _graphqlQuery = _interopRequireDefault(require("../views/graphql-query"));

var _loadRecovered = require("../graphql/load-recovered");

var _relayStub = require("../relay-stub");

var _graphqlPager = require("../graphql-pager");

const DETAIL_QUERY = (0, _loadRecovered.loadRecovered)('issueishDetailContainerQuery');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class IssueishDetailContainer extends _react.default.Component {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "renderWithToken", tokenData => {
      const token = tokenData && tokenData.token;

      if (token instanceof Error) {
        return _react.default.createElement(_queryErrorView.default, {
          error: token,
          login: this.handleLogin,
          retry: this.handleTokenRetry,
          logout: this.handleLogout
        });
      }

      if (token === _keytarStrategy.UNAUTHENTICATED) {
        return _react.default.createElement(_githubLoginView.default, {
          onLogin: this.handleLogin
        });
      }

      if (token === _keytarStrategy.INSUFFICIENT) {
        return _react.default.createElement(_githubLoginView.default, {
          onLogin: this.handleLogin
        }, _react.default.createElement("p", null, "Your token no longer has sufficient authorizations. Please re-authenticate and generate a new one."));
      }

      return _react.default.createElement(_observeModel.default, {
        model: this.props.repository,
        fetchData: this.fetchRepositoryData
      }, repoData => this.renderWithRepositoryData(token, repoData));
    });

    _defineProperty(this, "fetchToken", loginModel => {
      return (0, _yubikiri.default)({
        token: loginModel.getToken(this.props.endpoint.getLoginAccount())
      });
    });

    _defineProperty(this, "fetchRepositoryData", repository => {
      return (0, _yubikiri.default)({
        branches: repository.getBranches(),
        remotes: repository.getRemotes(),
        isMerging: repository.isMerging(),
        isRebasing: repository.isRebasing(),
        isAbsent: repository.isAbsent(),
        isLoading: repository.isLoading(),
        isPresent: repository.isPresent()
      });
    });

    _defineProperty(this, "handleLogin", token => this.props.loginModel.setToken(this.props.endpoint.getLoginAccount(), token));

    _defineProperty(this, "handleLogout", () => this.props.loginModel.removeToken(this.props.endpoint.getLoginAccount()));

    _defineProperty(this, "handleTokenRetry", () => this.props.loginModel.didUpdate());
  }

  render() {
    return _react.default.createElement(_observeModel.default, {
      model: this.props.loginModel,
      fetchData: this.fetchToken
    }, this.renderWithToken);
  }

  renderWithRepositoryData(token, repoData) {
    if (!token) {
      return _react.default.createElement(_loadingView.default, null);
    }

    const variables = {
      repoOwner: this.props.owner,
      repoName: this.props.repo,
      issueishNumber: this.props.issueishNumber,
      timelineCount: _helpers.PAGE_SIZE,
      timelineCursor: null,
      commitCount: _helpers.PAGE_SIZE,
      commitCursor: null,
      reviewCount: _helpers.PAGE_SIZE,
      reviewCursor: null,
      threadCount: _helpers.PAGE_SIZE,
      threadCursor: null,
      commentCount: _helpers.PAGE_SIZE,
      commentCursor: null,
      checkSuiteCount: _helpers.CHECK_SUITE_PAGE_SIZE,
      checkSuiteCursor: null,
      checkRunCount: _helpers.CHECK_RUN_PAGE_SIZE,
      checkRunCursor: null
    };
    return _react.default.createElement(_graphqlQuery.default, {
      endpoint: this.props.endpoint,
      token: token,
      query: DETAIL_QUERY,
      variables: variables,
      render: queryResult => this.renderWithQueryResult(token, repoData, queryResult)
    });
  }

  renderWithQueryResult(token, repoData, {
    error,
    data,
    retry,
    merge
  }) {
    if (error) {
      return _react.default.createElement(_queryErrorView.default, {
        error: error,
        login: this.handleLogin,
        retry: retry,
        logout: this.handleLogout
      });
    }

    if (!data || !repoData) {
      return _react.default.createElement(_loadingView.default, null);
    }

    this._detailData = data;
    const auth = {
      endpoint: this.props.endpoint,
      token: token
    };
    const getData = () => this._detailData;
    const issueish = data.repository && data.repository.issueish;
    const isPR = issueish && issueish.__typename === 'PullRequest';
    const detailNode = isPR ? data.repository.pullRequest : data.repository.issue;
    const url = detailNode && detailNode.url;
    const timelineRelay = url ? (0, _graphqlPager.createGraphqlPager)({
      auth,
      queryName: isPR ? 'prTimelineControllerQuery' : 'issueTimelineControllerQuery',
      variables: {
        url,
        timelineCount: _helpers.PAGE_SIZE,
        timelineCursor: null
      },
      cursorVar: 'timelineCursor',
      getConnection: d => {
        const node = isPR ? d.repository.pullRequest : d.repository.issue;
        return node && node.timelineItems;
      },
      append: (prev, page) => {
        const key = isPR ? 'pullRequest' : 'issue';
        const node = prev.repository[key];
        const incoming = page.resource && page.resource.timelineItems;
        if (!node || !incoming) return prev;
        return (0, _graphqlPager.setPath)(prev, ['repository', key, 'timelineItems'], (0, _graphqlPager.appendConnection)(node.timelineItems, incoming));
      },
      getData,
      merge: updater => {
        merge(prev => {
          const next = updater(prev);
          this._detailData = next;
          return next;
        });
      },
      retry
    }) : (0, _relayStub.createRelayStub)(retry);
    const commitsRelay = isPR && url ? (0, _graphqlPager.createGraphqlPager)({
      auth,
      queryName: 'prCommitsViewQuery',
      variables: {
        url,
        commitCount: _helpers.PAGE_SIZE,
        commitCursor: null
      },
      cursorVar: 'commitCursor',
      getConnection: d => d.repository.pullRequest && d.repository.pullRequest.commits,
      append: (prev, page) => {
        const node = prev.repository.pullRequest;
        const incoming = page.resource && page.resource.commits;
        if (!node || !incoming) return prev;
        return (0, _graphqlPager.setPath)(prev, ['repository', 'pullRequest', 'commits'], (0, _graphqlPager.appendConnection)(node.commits, incoming));
      },
      getData,
      merge: updater => {
        merge(prev => {
          const next = updater(prev);
          this._detailData = next;
          return next;
        });
      },
      retry
    }) : (0, _relayStub.createRelayStub)(retry);
    if (isPR) {
      return _react.default.createElement(_aggregatedReviewsJson.default, {
        pullRequest: issueish,
        refetch: retry,
        endpoint: this.props.endpoint,
        token: token
      }, aggregatedReviews => this.renderWithCommentResult(token, repoData, {
        props: data,
        retry,
        timelineRelay,
        commitsRelay
      }, aggregatedReviews));
    } else {
      return this.renderWithCommentResult(token, repoData, {
        props: data,
        retry,
        timelineRelay,
        commitsRelay
      }, {
        errors: [],
        commentThreads: [],
        loading: false
      });
    }
  }

  renderWithCommentResult(token, repoData, {
    props,
    retry,
    timelineRelay,
    commitsRelay
  }, {
    errors,
    commentThreads,
    loading
  }) {
    const nonEmptyThreads = commentThreads.filter(each => each.comments && each.comments.length > 0);
    const totalCount = nonEmptyThreads.length;
    const resolvedCount = nonEmptyThreads.filter(each => each.thread.isResolved).length;

    if (errors && errors.length > 0) {
      const descriptions = errors.map(error => error.toString());
      return _react.default.createElement(_errorView.default, {
        title: "Unable to fetch review comments",
        descriptions: descriptions,
        retry: retry,
        logout: this.handleLogout
      });
    }

    return _react.default.createElement(_issueishDetailController.BareIssueishDetailController, _extends({}, props, repoData, {
      relay: (0, _relayStub.createRelayStub)(retry),
      timelineRelay: timelineRelay || (0, _relayStub.createRelayStub)(retry),
      commitsRelay: commitsRelay || (0, _relayStub.createRelayStub)(retry),
      reviewCommentsLoading: loading,
      reviewCommentsTotalCount: totalCount,
      reviewCommentsResolvedCount: resolvedCount,
      reviewCommentThreads: nonEmptyThreads,
      token: token,
      localRepository: this.props.repository,
      workdirPath: this.props.repository.getWorkingDirectoryPath(),
      issueishNumber: this.props.issueishNumber,
      onTitleChange: this.props.onTitleChange,
      switchToIssueish: this.props.switchToIssueish,
      initChangedFilePath: this.props.initChangedFilePath,
      initChangedFilePosition: this.props.initChangedFilePosition,
      selectedTab: this.props.selectedTab,
      onTabSelected: this.props.onTabSelected,
      onOpenFilesTab: this.props.onOpenFilesTab,
      endpoint: this.props.endpoint,
      reportRelayError: this.props.reportRelayError,
      workspace: this.props.workspace,
      commands: this.props.commands,
      keymaps: this.props.keymaps,
      tooltips: this.props.tooltips,
      config: this.props.config,
      itemType: this.props.itemType,
      destroy: this.props.destroy,
      refEditor: this.props.refEditor
    }));
  }

}

exports.default = IssueishDetailContainer;

_defineProperty(IssueishDetailContainer, "propTypes", {
  // Connection
  endpoint: _propTypes2.EndpointPropType.isRequired,
  // Issueish selection criteria
  owner: _propTypes.default.string.isRequired,
  repo: _propTypes.default.string.isRequired,
  issueishNumber: _propTypes.default.number.isRequired,
  // For opening files changed tab
  initChangedFilePath: _propTypes.default.string,
  initChangedFilePosition: _propTypes.default.number,
  selectedTab: _propTypes.default.number.isRequired,
  onTabSelected: _propTypes.default.func.isRequired,
  onOpenFilesTab: _propTypes.default.func.isRequired,
  // Package models
  repository: _propTypes.default.object.isRequired,
  loginModel: _propTypes2.GithubLoginModelPropType.isRequired,
  // Atom environment
  workspace: _propTypes.default.object.isRequired,
  commands: _propTypes.default.object.isRequired,
  keymaps: _propTypes.default.object.isRequired,
  tooltips: _propTypes.default.object.isRequired,
  config: _propTypes.default.object.isRequired,
  // Action methods
  switchToIssueish: _propTypes.default.func.isRequired,
  onTitleChange: _propTypes.default.func.isRequired,
  destroy: _propTypes.default.func.isRequired,
  reportRelayError: _propTypes.default.func.isRequired,
  // Item context
  itemType: _propTypes2.ItemTypePropType.isRequired,
  refEditor: _propTypes2.RefHolderPropType.isRequired
});