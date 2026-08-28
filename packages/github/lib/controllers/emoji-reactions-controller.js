"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.BareEmojiReactionsController = void 0;

var _propTypes = _interopRequireDefault(require("prop-types"));

var _react = _interopRequireDefault(require("react"));


var _emojiReactionsView = require("../views/emoji-reactions-view");

var _addReaction = _interopRequireDefault(require("../mutations/add-reaction"));

var _removeReaction = _interopRequireDefault(require("../mutations/remove-reaction"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class BareEmojiReactionsController extends _react.default.Component {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "graphqlAuth", () => ({
      endpoint: this.props.endpoint,
      token: this.props.token
    }));

    _defineProperty(this, "addReaction", async content => {
      try {
        await (0, _addReaction.default)(this.graphqlAuth(), this.props.reactable.id, content);
        if (this.props.relay && this.props.relay.refetch) {
          this.props.relay.refetch();
        }
      } catch (err) {
        this.props.reportRelayError('Unable to add reaction emoji', err);
      }
    });

    _defineProperty(this, "removeReaction", async content => {
      try {
        await (0, _removeReaction.default)(this.graphqlAuth(), this.props.reactable.id, content);
        if (this.props.relay && this.props.relay.refetch) {
          this.props.relay.refetch();
        }
      } catch (err) {
        this.props.reportRelayError('Unable to remove reaction emoji', err);
      }
    });
  }

  render() {
    return _react.default.createElement(_emojiReactionsView.BareEmojiReactionsView, _extends({
      addReaction: this.addReaction,
      removeReaction: this.removeReaction
    }, this.props));
  }

}

exports.BareEmojiReactionsController = BareEmojiReactionsController;

_defineProperty(BareEmojiReactionsController, "propTypes", {
  relay: _propTypes.default.shape({
    refetch: _propTypes.default.func
  }),
  endpoint: _propTypes.default.object,
  token: _propTypes.default.string,
  reactable: _propTypes.default.shape({
    id: _propTypes.default.string.isRequired
  }).isRequired,
  // Atom environment
  tooltips: _propTypes.default.object.isRequired,
  // Action methods
  reportRelayError: _propTypes.default.func.isRequired
});


exports.default = BareEmojiReactionsController;