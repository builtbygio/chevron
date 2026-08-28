"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.BareHeadRefForcePushedEventView = void 0;

var _react = _interopRequireDefault(require("react"));


var _propTypes = _interopRequireDefault(require("prop-types"));

var _octicon = _interopRequireDefault(require("../../atom/octicon"));

var _timeago = _interopRequireDefault(require("../timeago"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class BareHeadRefForcePushedEventView extends _react.default.Component {
  render() {
    const {
      actor,
      beforeCommit,
      afterCommit,
      createdAt
    } = this.props.item;
    const {
      headRefName,
      headRepositoryOwner,
      repository
    } = this.props.issueish;
    const branchPrefix = headRepositoryOwner.login !== repository.owner.login ? `${headRepositoryOwner.login}:` : '';
    return _react.default.createElement("div", {
      className: "head-ref-force-pushed-event"
    }, _react.default.createElement(_octicon.default, {
      className: "pre-timeline-item-icon",
      icon: "repo-force-push"
    }), actor && _react.default.createElement("img", {
      className: "author-avatar",
      src: actor.avatarUrl,
      alt: actor.login,
      title: actor.login
    }), _react.default.createElement("span", {
      className: "head-ref-force-pushed-event-header"
    }, _react.default.createElement("span", {
      className: "username"
    }, actor ? actor.login : 'someone'), " force-pushed the ", branchPrefix + headRefName, " branch from ", this.renderCommit(beforeCommit, 'an old commit'), " to", ' ', this.renderCommit(afterCommit, 'a new commit'), " at ", _react.default.createElement(_timeago.default, {
      time: createdAt
    })));
  }

  renderCommit(commit, description) {
    if (!commit) {
      return description;
    }

    return _react.default.createElement("span", {
      className: "sha"
    }, commit.oid.slice(0, 8));
  }

}

exports.BareHeadRefForcePushedEventView = BareHeadRefForcePushedEventView;

_defineProperty(BareHeadRefForcePushedEventView, "propTypes", {
  item: _propTypes.default.shape({
    actor: _propTypes.default.shape({
      avatarUrl: _propTypes.default.string.isRequired,
      login: _propTypes.default.string.isRequired
    }),
    beforeCommit: _propTypes.default.shape({
      oid: _propTypes.default.string.isRequired
    }),
    afterCommit: _propTypes.default.shape({
      oid: _propTypes.default.string.isRequired
    }),
    createdAt: _propTypes.default.string.isRequired
  }).isRequired,
  issueish: _propTypes.default.shape({
    headRefName: _propTypes.default.string.isRequired,
    headRepositoryOwner: _propTypes.default.shape({
      login: _propTypes.default.string.isRequired
    }),
    repository: _propTypes.default.shape({
      owner: _propTypes.default.shape({
        login: _propTypes.default.string.isRequired
      }).isRequired
    }).isRequired
  }).isRequired
});


exports.default = BareHeadRefForcePushedEventView;