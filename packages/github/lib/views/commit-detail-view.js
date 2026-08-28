"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireDefault(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _nodeEmoji = require("node-emoji");

var _moment = _interopRequireDefault(require("moment"));

var _multiFilePatchController = _interopRequireDefault(require("../controllers/multi-file-patch-controller"));

var _commands = _interopRequireWildcard(require("../atom/commands"));

var _refHolder = _interopRequireDefault(require("../models/ref-holder"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectSpread2(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class CommitDetailView extends _react.default.Component {
  constructor(props) {
    super(props);
    this.refRoot = new _refHolder.default();
  }

  render() {
    const commit = this.props.commit;
    return _react.default.createElement("div", {
      className: "github-CommitDetailView",
      ref: this.refRoot.setter
    }, this.renderCommands(), _react.default.createElement("div", {
      className: "github-CommitDetailView-header native-key-bindings",
      tabIndex: "-1"
    }, _react.default.createElement("div", {
      className: "github-CommitDetailView-commit"
    }, _react.default.createElement("h3", {
      className: "github-CommitDetailView-title"
    }, (0, _nodeEmoji.emojify)(commit.getMessageSubject())), _react.default.createElement("div", {
      className: "github-CommitDetailView-meta"
    }, this.renderAuthors(), _react.default.createElement("span", {
      className: "github-CommitDetailView-metaText"
    }, this.getAuthorInfo(), " committed ", this.humanizeTimeSince(commit.getAuthorDate())), _react.default.createElement("div", {
      className: "github-CommitDetailView-sha"
    }, this.renderDotComLink())), this.renderShowMoreButton(), this.renderCommitMessageBody())), _react.default.createElement(_multiFilePatchController.default, _extends({
      multiFilePatch: commit.getMultiFileDiff(),
      surface: this.props.surfaceCommit
    }, this.props)));
  }

  renderCommands() {
    return _react.default.createElement(_commands.default, {
      registry: this.props.commands,
      target: this.refRoot
    }, _react.default.createElement(_commands.Command, {
      command: "github:surface",
      callback: this.props.surfaceCommit
    }));
  }

  renderCommitMessageBody() {
    const collapsed = this.props.messageCollapsible && !this.props.messageOpen;
    return _react.default.createElement("pre", {
      className: "github-CommitDetailView-moreText"
    }, collapsed ? this.props.commit.abbreviatedBody() : this.props.commit.getMessageBody());
  }

  renderShowMoreButton() {
    if (!this.props.messageCollapsible) {
      return null;
    }

    const buttonText = this.props.messageOpen ? 'Show Less' : 'Show More';
    return _react.default.createElement("button", {
      className: "github-CommitDetailView-moreButton",
      onClick: this.props.toggleMessage
    }, buttonText);
  }

  humanizeTimeSince(date) {
    return (0, _moment.default)(date * 1000).fromNow();
  }

  renderDotComLink() {
    const remote = this.props.currentRemote;
    const sha = this.props.commit.getSha();

    if (remote.isGithubRepo() && this.props.isCommitPushed) {
      const repoUrl = `https://github.com/${remote.getOwner()}/${remote.getRepo()}`;
      return _react.default.createElement("a", {
        href: `${repoUrl}/commit/${sha}`,
        title: `open commit ${sha} on GitHub.com`
      }, sha);
    } else {
      return _react.default.createElement("span", null, sha);
    }
  }

  getAuthorInfo() {
    const commit = this.props.commit;
    const coAuthorCount = commit.getCoAuthors().length;

    if (coAuthorCount === 0) {
      return commit.getAuthorName();
    } else if (coAuthorCount === 1) {
      return `${commit.getAuthorName()} and ${commit.getCoAuthors()[0].getFullName()}`;
    } else {
      return `${commit.getAuthorName()} and ${coAuthorCount} others`;
    }
  }

  renderAuthor(author) {
    const email = author.getEmail();
    const avatarUrl = author.getAvatarUrl();
    return _react.default.createElement("img", {
      className: "github-CommitDetailView-avatar github-RecentCommit-avatar",
      key: email,
      src: avatarUrl,
      title: email,
      alt: `${email}'s avatar'`
    });
  }

  renderAuthors() {
    const coAuthors = this.props.commit.getCoAuthors();
    const authors = [this.props.commit.getAuthor(), ...coAuthors];
    return _react.default.createElement("span", {
      className: "github-CommitDetailView-authors github-RecentCommit-authors"
    }, authors.map(this.renderAuthor));
  }

}

exports.default = CommitDetailView;

_defineProperty(CommitDetailView, "drilledPropTypes", {
  // Model properties
  repository: _propTypes.default.object.isRequired,
  commit: _propTypes.default.object.isRequired,
  currentRemote: _propTypes.default.object.isRequired,
  isCommitPushed: _propTypes.default.bool.isRequired,
  itemType: _propTypes.default.func.isRequired,
  // Atom environment
  workspace: _propTypes.default.object.isRequired,
  commands: _propTypes.default.object.isRequired,
  keymaps: _propTypes.default.object.isRequired,
  tooltips: _propTypes.default.object.isRequired,
  config: _propTypes.default.object.isRequired,
  // Action functions
  destroy: _propTypes.default.func.isRequired,
  surfaceCommit: _propTypes.default.func.isRequired
});

_defineProperty(CommitDetailView, "propTypes", _objectSpread2({}, CommitDetailView.drilledPropTypes, {
  // Controller state
  messageCollapsible: _propTypes.default.bool.isRequired,
  messageOpen: _propTypes.default.bool.isRequired,
  // Action functions
  toggleMessage: _propTypes.default.func.isRequired
}));