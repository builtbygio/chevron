"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireDefault(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _propTypes2 = require("../prop-types");

var _keytarStrategy = require("../shared/keytar-strategy");

var _author = _interopRequireWildcard(require("../models/author"));

var _githubTabHeaderController = _interopRequireDefault(require("../controllers/github-tab-header-controller"));

var _graphqlQuery = _interopRequireDefault(require("../views/graphql-query"));

var _githubTabHeaderQuery = _interopRequireDefault(require("../graphql/github-tab-header-query"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class GithubTabHeaderContainer extends _react.default.Component {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "renderWithResult", ({
      error,
      data
    }) => {
      if (error || data === null) {
        return this.renderNoResult();
      }

      const {
        email,
        name,
        avatarUrl,
        login
      } = data.viewer;
      return _react.default.createElement(_githubTabHeaderController.default, {
        user: new _author.default(email, name, login, false, avatarUrl),
        currentWorkDir: this.props.currentWorkDir,
        contextLocked: this.props.contextLocked,
        getCurrentWorkDirs: this.props.getCurrentWorkDirs,
        changeWorkingDirectory: this.props.changeWorkingDirectory,
        setContextLock: this.props.setContextLock,
        onDidChangeWorkDirs: this.props.onDidChangeWorkDirs
      });
    });
  }

  render() {
    if (this.props.token == null || this.props.token instanceof Error || this.props.token === _keytarStrategy.UNAUTHENTICATED || this.props.token === _keytarStrategy.INSUFFICIENT) {
      return this.renderNoResult();
    }

    return _react.default.createElement(_graphqlQuery.default, {
      endpoint: this.props.endpoint,
      token: this.props.token,
      query: _githubTabHeaderQuery.default,
      variables: {},
      render: this.renderWithResult
    });
  }

  renderNoResult() {
    return _react.default.createElement(_githubTabHeaderController.default, {
      user: _author.nullAuthor,
      currentWorkDir: this.props.currentWorkDir,
      contextLocked: this.props.contextLocked,
      changeWorkingDirectory: this.props.changeWorkingDirectory,
      setContextLock: this.props.setContextLock,
      getCurrentWorkDirs: this.props.getCurrentWorkDirs,
      onDidChangeWorkDirs: this.props.onDidChangeWorkDirs
    });
  }

}

exports.default = GithubTabHeaderContainer;

_defineProperty(GithubTabHeaderContainer, "propTypes", {
  endpoint: _propTypes2.EndpointPropType.isRequired,
  token: _propTypes2.TokenPropType,
  currentWorkDir: _propTypes.default.string,
  contextLocked: _propTypes.default.bool.isRequired,
  changeWorkingDirectory: _propTypes.default.func.isRequired,
  setContextLock: _propTypes.default.func.isRequired,
  getCurrentWorkDirs: _propTypes.default.func.isRequired,
  onDidChangeWorkDirs: _propTypes.default.func
});
