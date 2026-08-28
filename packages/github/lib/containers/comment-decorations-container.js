"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireDefault(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _yubikiri = _interopRequireDefault(require("yubikiri"));

var _commentDecorationsController = require("../controllers/comment-decorations-controller");

var _observeModel = _interopRequireDefault(require("../views/observe-model"));

var _propTypes2 = require("../prop-types");

var _keytarStrategy = require("../shared/keytar-strategy");

var _helpers = require("../helpers");

var _aggregatedReviewsJson = _interopRequireDefault(require("./aggregated-reviews-json"));

var _commentPositioningContainer = _interopRequireDefault(require("./comment-positioning-container"));

var _prPatchContainer = _interopRequireDefault(require("./pr-patch-container"));

var _graphqlQuery = _interopRequireDefault(require("../views/graphql-query"));

var _loadRecovered = require("../graphql/load-recovered");

var _relayStub = require("../relay-stub");

const DECORATIONS_QUERY = (0, _loadRecovered.loadRecovered)('commentDecorationsContainerQuery');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectSpread2(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class CommentDecorationsContainer extends _react.default.Component {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "renderWithLocalRepositoryData", repoData => {
      if (!repoData) {
        return null;
      }

      return _react.default.createElement(_observeModel.default, {
        model: this.props.loginModel,
        fetchParams: [repoData],
        fetchData: this.fetchToken
      }, token => this.renderWithToken(token, {
        repoData
      }));
    });

    _defineProperty(this, "fetchRepositoryData", repository => {
      return (0, _yubikiri.default)({
        branches: repository.getBranches(),
        remotes: repository.getRemotes(),
        currentRemote: repository.getCurrentGitHubRemote(),
        workingDirectoryPath: repository.getWorkingDirectoryPath()
      });
    });

    _defineProperty(this, "fetchToken", (loginModel, repoData) => {
      const endpoint = repoData.currentRemote.getEndpoint();

      if (!endpoint) {
        return null;
      }

      return loginModel.getToken(endpoint.getLoginAccount());
    });
  }

  render() {
    return _react.default.createElement(_observeModel.default, {
      model: this.props.localRepository,
      fetchData: this.fetchRepositoryData
    }, this.renderWithLocalRepositoryData);
  }

  renderWithToken(token, {
    repoData
  }) {
    if (!token || token === _keytarStrategy.UNAUTHENTICATED || token === _keytarStrategy.INSUFFICIENT || token instanceof Error) {
      // we're not going to prompt users to log in to render decorations for comments
      // just let it go and move on with our lives.
      return null;
    }

    const head = repoData.branches.getHeadBranch();

    if (!head.isPresent()) {
      return null;
    }

    const push = head.getPush();

    if (!push.isPresent() || !push.isRemoteTracking()) {
      return null;
    }

    const pushRemote = repoData.remotes.withName(push.getRemoteName());

    if (!pushRemote.isPresent() || !pushRemote.isGithubRepo()) {
      return null;
    }

    const endpoint = repoData.currentRemote.getEndpoint();

    const variables = {
      headOwner: pushRemote.getOwner(),
      headName: pushRemote.getRepo(),
      headRef: push.getRemoteRef(),
      first: 1,
      reviewCount: _helpers.PAGE_SIZE,
      reviewCursor: null,
      threadCount: _helpers.PAGE_SIZE,
      threadCursor: null,
      commentCount: _helpers.PAGE_SIZE,
      commentCursor: null
    };
    return _react.default.createElement(_graphqlQuery.default, {
      endpoint: endpoint,
      token: token,
      query: DECORATIONS_QUERY,
      variables: variables,
      render: queryResult => this.renderWithPullRequest(_objectSpread2({
        endpoint,
        owner: variables.headOwner,
        repo: variables.headName
      }, queryResult), {
        repoData,
        token
      })
    });
  }

  renderWithPullRequest({
    error,
    data,
    endpoint,
    owner,
    repo
  }, {
    repoData,
    token
  }) {
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`error fetching CommentDecorationsContainer data: ${error}`);
      return null;
    }

    if (!data || !data.repository || !data.repository.ref || !data.repository.ref.associatedPullRequests || data.repository.ref.associatedPullRequests.totalCount === 0) {
      // no loading spinner for you
      // just fetch silently behind the scenes like a good little container
      return null;
    }

    const currentPullRequest = data.repository.ref.associatedPullRequests.nodes[0];
    return _react.default.createElement(_aggregatedReviewsJson.default, {
      pullRequest: currentPullRequest,
      endpoint: endpoint,
      token: token
    }, ({
      errors,
      summaries,
      commentThreads
    }) => {
      return this.renderWithReviews({
        errors,
        summaries,
        commentThreads
      }, {
        currentPullRequest,
        repoResult: data,
        endpoint,
        owner,
        repo,
        repoData,
        token
      });
    });
  }

  renderWithReviews({
    errors,
    summaries,
    commentThreads
  }, {
    currentPullRequest,
    repoResult,
    endpoint,
    owner,
    repo,
    repoData,
    token
  }) {
    if (errors && errors.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('Errors aggregating reviews and comments for current pull request', ...errors);
      return null;
    }

    if (commentThreads.length === 0) {
      return null;
    }

    return _react.default.createElement(_prPatchContainer.default, {
      owner: owner,
      repo: repo,
      number: currentPullRequest.number,
      endpoint: endpoint,
      token: token,
      largeDiffThreshold: Infinity
    }, (patchError, patch) => this.renderWithPatch({
      error: patchError,
      patch
    }, {
      summaries,
      commentThreads,
      currentPullRequest,
      repoResult,
      endpoint,
      owner,
      repo,
      repoData,
      token
    }));
  }

  renderWithPatch({
    error,
    patch
  }, {
    summaries,
    commentThreads,
    currentPullRequest,
    repoResult,
    endpoint,
    owner,
    repo,
    repoData,
    token
  }) {
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('Error fetching patch for current pull request', error);
      return null;
    }

    if (!patch) {
      return null;
    }

    return _react.default.createElement(_commentPositioningContainer.default, {
      multiFilePatch: patch,
      commentThreads: commentThreads,
      prCommitSha: currentPullRequest.headRefOid,
      localRepository: this.props.localRepository,
      workdir: repoData.workingDirectoryPath
    }, commentTranslations => {
      if (!commentTranslations) {
        return null;
      }

      return _react.default.createElement(_commentDecorationsController.BareCommentDecorationsController, {
        relay: (0, _relayStub.createRelayStub)(),
        endpoint: endpoint,
        owner: owner,
        repo: repo,
        workspace: this.props.workspace,
        commands: this.props.commands,
        repoData: repoData,
        commentThreads: commentThreads,
        commentTranslations: commentTranslations,
        pullRequests: repoResult.repository.ref.associatedPullRequests.nodes
      });
    });
  }

}

exports.default = CommentDecorationsContainer;

_defineProperty(CommentDecorationsContainer, "propTypes", {
  workspace: _propTypes.default.object.isRequired,
  commands: _propTypes.default.object.isRequired,
  localRepository: _propTypes.default.object.isRequired,
  loginModel: _propTypes2.GithubLoginModelPropType.isRequired,
  reportRelayError: _propTypes.default.func.isRequired
});