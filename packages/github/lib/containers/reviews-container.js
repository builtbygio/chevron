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

var _prPatchContainer = _interopRequireDefault(require("./pr-patch-container"));

var _observeModel = _interopRequireDefault(require("../views/observe-model"));

var _loadingView = _interopRequireDefault(require("../views/loading-view"));

var _githubLoginView = _interopRequireDefault(require("../views/github-login-view"));

var _errorView = _interopRequireDefault(require("../views/error-view"));

var _queryErrorView = _interopRequireDefault(require("../views/query-error-view"));

var _reviewsController = require("../controllers/reviews-controller");

var _aggregatedReviewsJson = _interopRequireDefault(require("./aggregated-reviews-json"));

var _graphqlQuery = _interopRequireDefault(require("../views/graphql-query"));

var _loadRecovered = require("../graphql/load-recovered");

var _relayStub = require("../relay-stub");

const REVIEWS_QUERY = (0, _loadRecovered.loadRecovered)('reviewsContainerQuery');

var _commentPositioningContainer = _interopRequireDefault(require("./comment-positioning-container"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class ReviewsContainer extends _react.default.Component {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "renderWithToken", token => {
      if (!token) {
        return _react.default.createElement(_loadingView.default, null);
      }

      if (token instanceof Error) {
        return _react.default.createElement(_queryErrorView.default, {
          error: token,
          retry: this.handleTokenRetry,
          login: this.handleLogin,
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

      return _react.default.createElement(_prPatchContainer.default, {
        owner: this.props.owner,
        repo: this.props.repo,
        number: this.props.number,
        endpoint: this.props.endpoint,
        token: token,
        largeDiffThreshold: Infinity
      }, (error, patch) => this.renderWithPatch(error, {
        token,
        patch
      }));
    });

    _defineProperty(this, "fetchToken", loginModel => loginModel.getToken(this.props.endpoint.getLoginAccount()));

    _defineProperty(this, "fetchRepositoryData", repository => {
      return (0, _yubikiri.default)({
        branches: repository.getBranches(),
        remotes: repository.getRemotes(),
        isAbsent: repository.isAbsent(),
        isLoading: repository.isLoading(),
        isPresent: repository.isPresent(),
        isMerging: repository.isMerging(),
        isRebasing: repository.isRebasing()
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

  renderWithPatch(error, {
    token,
    patch
  }) {
    if (error) {
      return _react.default.createElement(_errorView.default, {
        descriptions: [error]
      });
    }

    return _react.default.createElement(_observeModel.default, {
      model: this.props.repository,
      fetchData: this.fetchRepositoryData
    }, repoData => this.renderWithRepositoryData(repoData, {
      token,
      patch
    }));
  }

  renderWithRepositoryData(repoData, {
    token,
    patch
  }) {
    const variables = {
      repoOwner: this.props.owner,
      repoName: this.props.repo,
      prNumber: this.props.number,
      reviewCount: _helpers.PAGE_SIZE,
      reviewCursor: null,
      threadCount: _helpers.PAGE_SIZE,
      threadCursor: null,
      commentCount: _helpers.PAGE_SIZE,
      commentCursor: null
    };
    return _react.default.createElement(_graphqlQuery.default, {
      endpoint: this.props.endpoint,
      token: token,
      query: REVIEWS_QUERY,
      variables: variables,
      render: queryResult => this.renderWithQuery(queryResult, {
        repoData,
        patch,
        token
      })
    });
  }

  renderWithQuery({
    error,
    data,
    retry
  }, {
    repoData,
    patch,
    token
  }) {
    if (error) {
      return _react.default.createElement(_queryErrorView.default, {
        error: error,
        login: this.handleLogin,
        retry: retry,
        logout: this.handleLogout
      });
    }

    if (!data || !repoData || !patch) {
      return _react.default.createElement(_loadingView.default, null);
    }

    return _react.default.createElement(_aggregatedReviewsJson.default, {
      pullRequest: data.repository.pullRequest,
      refetch: retry,
      endpoint: this.props.endpoint,
      token: token
    }, ({
      errors,
      summaries,
      commentThreads,
      refetch
    }) => {
      if (errors && errors.length > 0) {
        return errors.map((err, i) => _react.default.createElement(_errorView.default, {
          key: `error-${i}`,
          title: "Pagination error",
          descriptions: [err.stack]
        }));
      }

      const aggregationResult = {
        summaries,
        commentThreads,
        refetch
      };
      return this.renderWithResult({
        aggregationResult,
        queryProps: data,
        repoData,
        patch,
        token
      });
    });
  }

  renderWithResult({
    aggregationResult,
    queryProps,
    repoData,
    patch,
    token
  }) {
    return _react.default.createElement(_commentPositioningContainer.default, _extends({
      multiFilePatch: patch
    }, aggregationResult, {
      prCommitSha: queryProps.repository.pullRequest.headRefOid,
      localRepository: this.props.repository
    }), commentTranslations => {
      return _react.default.createElement(_reviewsController.BareReviewsController, _extends({}, this.props, aggregationResult, {
        relay: (0, _relayStub.createRelayStub)(aggregationResult.refetch),
        token: token,
        commentTranslations: commentTranslations,
        localRepository: this.props.repository,
        multiFilePatch: patch,
        repository: queryProps.repository,
        pullRequest: queryProps.repository.pullRequest,
        viewer: queryProps.viewer
      }, repoData));
    });
  }

}

exports.default = ReviewsContainer;

_defineProperty(ReviewsContainer, "propTypes", {
  // Connection
  endpoint: _propTypes2.EndpointPropType.isRequired,
  // Pull request selection criteria
  owner: _propTypes.default.string.isRequired,
  repo: _propTypes.default.string.isRequired,
  number: _propTypes.default.number.isRequired,
  workdir: _propTypes.default.string.isRequired,
  // Package models
  repository: _propTypes.default.object.isRequired,
  loginModel: _propTypes2.GithubLoginModelPropType.isRequired,
  workdirContextPool: _propTypes2.WorkdirContextPoolPropType.isRequired,
  initThreadID: _propTypes.default.string,
  // Atom environment
  workspace: _propTypes.default.object.isRequired,
  config: _propTypes.default.object.isRequired,
  commands: _propTypes.default.object.isRequired,
  tooltips: _propTypes.default.object.isRequired,
  confirm: _propTypes.default.func.isRequired,
  // Action methods
  reportRelayError: _propTypes.default.func.isRequired
});