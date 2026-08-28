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

var _graphqlQuery = _interopRequireDefault(require("../views/graphql-query"));

var _loadRecovered = require("../graphql/load-recovered");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const SEARCH_QUERY = (0, _loadRecovered.loadRecovered)('issueishSearchContainerQuery');

function pullRequestNodes(nodes) {
  return (nodes || []).filter(node => node && node.__typename === 'PullRequest' && node.commits);
}

class IssueishSearchContainer extends _react.default.Component {
  constructor(props) {
    super(props);
    (0, _helpers.autobind)(this, 'renderQueryResult');
    this.sub = new _eventKit.Disposable();
  }

  render() {
    if (this.props.search.isNull()) {
      return _react.default.createElement(_issueishListController.BareIssueishListController, _extends({
        isLoading: false
      }, this.controllerProps()));
    }

    return _react.default.createElement(_graphqlQuery.default, {
      endpoint: this.props.endpoint,
      token: this.props.token,
      query: SEARCH_QUERY,
      variables: {
        query: this.props.search.createQuery(),
        first: this.props.limit,
        checkSuiteCount: _helpers.CHECK_SUITE_PAGE_SIZE,
        checkSuiteCursor: null,
        checkRunCount: _helpers.CHECK_RUN_PAGE_SIZE,
        checkRunCursor: null
      },
      render: this.renderQueryResult
    });
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

    return _react.default.createElement(_issueishListController.BareIssueishListController, _extends({
      total: data.search.issueCount,
      results: pullRequestNodes(data.search.nodes),
      isLoading: false
    }, this.controllerProps()));
  }

  componentWillUnmount() {
    this.sub.dispose();
  }

  controllerProps() {
    return {
      title: this.props.search.getName(),
      onOpenIssueish: this.props.onOpenIssueish,
      onOpenReviews: this.props.onOpenReviews,
      onOpenMore: () => this.props.onOpenSearch(this.props.search)
    };
  }

}

exports.default = IssueishSearchContainer;

_defineProperty(IssueishSearchContainer, "propTypes", {
  endpoint: _propTypes2.EndpointPropType.isRequired,
  token: _propTypes.default.string.isRequired,
  limit: _propTypes.default.number,
  search: _propTypes2.SearchPropType.isRequired,
  onOpenIssueish: _propTypes.default.func.isRequired,
  onOpenSearch: _propTypes.default.func.isRequired,
  onOpenReviews: _propTypes.default.func.isRequired
});

_defineProperty(IssueishSearchContainer, "defaultProps", {
  limit: 20
});
