"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireDefault(require("react"));

var _reactRoot = require("../react-root");

var _graphqlQuery = _interopRequireDefault(require("../views/graphql-query"));

var _issueishTooltipContainer = require("../containers/issueish-tooltip-container");

var _issueishTooltipQuery = _interopRequireDefault(require("../graphql/issueish-tooltip-query"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class IssueishTooltipItem {
  constructor(issueishUrl, relayEnvironment) {
    this.issueishUrl = issueishUrl;
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
        query: _issueishTooltipQuery.default,
        variables: {
          issueishUrl: this.issueishUrl
        },
        render: ({
          error,
          data
        }) => {
          if (error) {
            return _react.default.createElement("div", null, "Could not load information");
          } else if (data && data.resource) {
            return _react.default.createElement(_issueishTooltipContainer.BareIssueishTooltipContainer, {
              resource: data.resource
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

exports.default = IssueishTooltipItem;
