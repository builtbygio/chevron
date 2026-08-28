"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.BareIssueishListController = void 0;

var _react = _interopRequireDefault(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));


var _propTypes2 = require("../prop-types");

var _issueishListView = _interopRequireDefault(require("../views/issueish-list-view"));

var _issueish = _interopRequireDefault(require("../models/issueish"));

var _electron = require("electron");

var _reporterProxy = require("../reporter-proxy");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const {
  Menu,
  MenuItem
} = require('electron').remote;

const StatePropType = _propTypes.default.oneOf(['EXPECTED', 'PENDING', 'SUCCESS', 'ERROR', 'FAILURE']);

class BareIssueishListController extends _react.default.Component {
  constructor(props) {
    super(props);

    _defineProperty(this, "openOnGitHub", async url => {
      await chevron.applicationDelegate.openExternal(url);
      (0, _reporterProxy.addEvent)('open-issueish-in-browser', {
        package: 'github',
        component: this.constructor.name
      });
    });

    _defineProperty(this, "showActionsMenu",
    /* istanbul ignore next */
    issueish => {
      const menu = new Menu();
      menu.append(new MenuItem({
        label: 'See reviews',
        click: () => this.props.onOpenReviews(issueish)
      }));
      menu.append(new MenuItem({
        label: 'Open on GitHub',
        click: () => this.openOnGitHub(issueish.getGitHubURL())
      }));
      menu.popup();
    });

    this.state = {};
  }

  static getDerivedStateFromProps(props, state) {
    if (props.results === null) {
      return {
        lastResults: null,
        issueishes: []
      };
    }

    if (props.results !== state.lastResults) {
      return {
        lastResults: props.results,
        issueishes: props.results.map(node => new _issueish.default(node)).filter(props.resultFilter)
      };
    }

    return null;
  }

  render() {
    return _react.default.createElement(_issueishListView.default, {
      title: this.props.title,
      isLoading: this.props.isLoading,
      total: this.props.total,
      issueishes: this.state.issueishes,
      error: this.props.error,
      needReviewsButton: this.props.needReviewsButton,
      onIssueishClick: this.props.onOpenIssueish,
      onMoreClick: this.props.onOpenMore,
      openReviews: this.props.onOpenReviews,
      openOnGitHub: this.openOnGitHub,
      showActionsMenu: this.showActionsMenu,
      emptyComponent: this.props.emptyComponent
    });
  }

}

exports.BareIssueishListController = BareIssueishListController;

_defineProperty(BareIssueishListController, "propTypes", {
  results: _propTypes.default.arrayOf(_propTypes.default.shape({
    number: _propTypes.default.number.isRequired,
    title: _propTypes.default.string.isRequired,
    url: _propTypes.default.string.isRequired,
    author: _propTypes.default.shape({
      login: _propTypes.default.string.isRequired,
      avatarUrl: _propTypes.default.string.isRequired
    }),
    createdAt: _propTypes.default.string.isRequired,
    headRefName: _propTypes.default.string.isRequired,
    repository: _propTypes.default.shape({
      id: _propTypes.default.string.isRequired,
      name: _propTypes.default.string.isRequired,
      owner: _propTypes.default.shape({
        login: _propTypes.default.string.isRequired
      }).isRequired
    }).isRequired,
    commits: _propTypes.default.shape({
      nodes: _propTypes.default.arrayOf(_propTypes.default.shape({
        commit: _propTypes.default.shape({
          status: _propTypes.default.shape({
            contexts: _propTypes.default.arrayOf(_propTypes.default.shape({
              state: StatePropType.isRequired
            }).isRequired).isRequired
          })
        })
      }))
    })
  })),
  total: _propTypes.default.number.isRequired,
  isLoading: _propTypes.default.bool.isRequired,
  title: _propTypes.default.string.isRequired,
  error: _propTypes.default.object,
  resultFilter: _propTypes.default.func,
  onOpenIssueish: _propTypes.default.func.isRequired,
  onOpenReviews: _propTypes.default.func.isRequired,
  onOpenMore: _propTypes.default.func,
  emptyComponent: _propTypes.default.func,
  endpoint: _propTypes2.EndpointPropType,
  needReviewsButton: _propTypes.default.bool
});

_defineProperty(BareIssueishListController, "defaultProps", {
  results: [],
  total: 0,
  resultFilter: () => true
});


exports.default = BareIssueishListController;