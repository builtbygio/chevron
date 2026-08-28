"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireDefault(require("react"));

var _reactRoot = require("../react-root");

var _graphqlQuery = _interopRequireDefault(require("../views/graphql-query"));

var _userMentionTooltipContainer = require("../containers/user-mention-tooltip-container");

var _userMentionTooltipQuery = _interopRequireDefault(require("../graphql/user-mention-tooltip-query"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class UserMentionTooltipItem {
  constructor(username, relayEnvironment) {
    this.username = username.substr(1);
    this.relayEnvironment = relayEnvironment;
  }

  getElement() {
    return this.element;
  }

  get element() {
    if (!this._element) {
      this._element = document.createElement('div');
      const rootContainer = _react.default.createElement(_graphqlQuery.default, {
        relayEnvironment: this.relayEnvironment,
        query: _userMentionTooltipQuery.default,
        variables: {
          username: this.username
        },
        render: ({
          error,
          data
        }) => {
          if (error) {
            return _react.default.createElement("div", null, "Could not load information");
          } else if (data && data.repositoryOwner) {
            return _react.default.createElement(_userMentionTooltipContainer.BareUserMentionTooltipContainer, {
              repositoryOwner: data.repositoryOwner
            });
          } else {
            return _react.default.createElement("div", {
              className: "github-Loader"
            }, _react.default.createElement("span", {
              className: "github-Spinner"
            }));
          }
        }
      });
      (0, _reactRoot.render)(rootContainer, this._element);
    }

    return this._element;
  }

  destroy() {
    if (this._element) {
      (0, _reactRoot.unmount)(this._element);
      delete this._element;
    }
  }

}

exports.default = UserMentionTooltipItem;
