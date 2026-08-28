"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireWildcard(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _classnames = _interopRequireDefault(require("classnames"));

var _commands = _interopRequireWildcard(require("../atom/commands"));

var _panel = _interopRequireDefault(require("../atom/panel"));

var _tabbable = require("./tabbable");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class DialogView extends _react.default.Component {
  render() {
    return _react.default.createElement(_panel.default, {
      workspace: this.props.workspace,
      location: "modal"
    }, _react.default.createElement("div", {
      className: "github-Dialog"
    }, _react.default.createElement(_commands.default, {
      registry: this.props.commands,
      target: ".github-Dialog"
    }, _react.default.createElement(_commands.Command, {
      command: "core:confirm",
      callback: this.props.accept
    }), _react.default.createElement(_commands.Command, {
      command: "core:cancel",
      callback: this.props.cancel
    })), this.props.prompt && _react.default.createElement("header", {
      className: "github-DialogPrompt"
    }, this.props.prompt), _react.default.createElement("main", {
      className: "github-DialogForm"
    }, this.props.children), _react.default.createElement("footer", {
      className: "github-DialogFooter"
    }, _react.default.createElement("div", {
      className: "github-DialogInfo"
    }, this.props.progressMessage && this.props.inProgress && _react.default.createElement(_react.Fragment, null, _react.default.createElement("span", {
      className: "inline-block loading loading-spinner-small"
    }), _react.default.createElement("span", {
      className: "github-DialogProgress-message"
    }, this.props.progressMessage)), this.props.error && _react.default.createElement("ul", {
      className: "error-messages"
    }, _react.default.createElement("li", null, this.props.error.userMessage || this.props.error.message))), _react.default.createElement("div", {
      className: "github-DialogButtons"
    }, _react.default.createElement(_tabbable.TabbableButton, {
      tabGroup: this.props.tabGroup,
      commands: this.props.commands,
      className: "btn github-Dialog-cancelButton",
      onClick: this.props.cancel
    }, "Cancel"), _react.default.createElement(_tabbable.TabbableButton, {
      tabGroup: this.props.tabGroup,
      commands: this.props.commands,
      className: (0, _classnames.default)('btn btn-primary github-Dialog-acceptButton', this.props.acceptClassName),
      onClick: this.props.accept,
      disabled: this.props.inProgress || !this.props.acceptEnabled
    }, this.props.acceptText)))));
  }

}

exports.default = DialogView;

_defineProperty(DialogView, "propTypes", {
  // Customization
  prompt: _propTypes.default.string,
  progressMessage: _propTypes.default.string,
  acceptEnabled: _propTypes.default.bool,
  acceptClassName: _propTypes.default.string,
  acceptText: _propTypes.default.string,
  // Callbacks
  accept: _propTypes.default.func.isRequired,
  cancel: _propTypes.default.func.isRequired,
  // State
  tabGroup: _propTypes.default.object.isRequired,
  inProgress: _propTypes.default.bool.isRequired,
  error: _propTypes.default.instanceOf(Error),
  // Atom environment
  workspace: _propTypes.default.object.isRequired,
  commands: _propTypes.default.object.isRequired,
  // Form content
  children: _propTypes.default.node.isRequired
});

_defineProperty(DialogView, "defaultProps", {
  acceptEnabled: true,
  acceptText: 'Accept'
});