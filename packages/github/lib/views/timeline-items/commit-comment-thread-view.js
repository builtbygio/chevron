"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.BareCommitCommentThreadView = void 0;

var _react = _interopRequireDefault(require("react"));


var _propTypes = _interopRequireDefault(require("prop-types"));

var _commitCommentView = _interopRequireDefault(require("./commit-comment-view"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class BareCommitCommentThreadView extends _react.default.Component {
  render() {
    const {
      item
    } = this.props;
    return _react.default.createElement("div", {
      className: "commit-comment-thread timeline-item"
    }, item.comments.edges.map((edge, i) => _react.default.createElement(_commitCommentView.default, {
      isReply: i !== 0,
      key: edge.node.id,
      item: edge.node,
      switchToIssueish: this.props.switchToIssueish
    })));
  }

}

exports.BareCommitCommentThreadView = BareCommitCommentThreadView;

_defineProperty(BareCommitCommentThreadView, "propTypes", {
  item: _propTypes.default.shape({
    commit: _propTypes.default.shape({
      oid: _propTypes.default.string.isRequired
    }).isRequired,
    comments: _propTypes.default.shape({
      edges: _propTypes.default.arrayOf(_propTypes.default.shape({
        node: _propTypes.default.object.isRequired
      }).isRequired).isRequired
    }).isRequired
  }).isRequired,
  switchToIssueish: _propTypes.default.func.isRequired
});


exports.default = BareCommitCommentThreadView;