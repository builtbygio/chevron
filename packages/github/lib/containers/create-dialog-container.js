"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireDefault(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _createDialogController = require("../controllers/create-dialog-controller");

var _observeModel = _interopRequireDefault(require("../views/observe-model"));

var _repositoryHomeSelectionView = require("../views/repository-home-selection-view");

var _endpoint = require("../models/endpoint");

var _propTypes2 = require("../prop-types");

var _graphqlQuery = _interopRequireDefault(require("../views/graphql-query"));

var _loadRecovered = require("../graphql/load-recovered");

var _graphqlPager = require("../graphql-pager");

var _relayStub = require("../relay-stub");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const DOTCOM = (0, _endpoint.getEndpoint)('github.com');
const CREATE_DIALOG_QUERY = (0, _loadRecovered.loadRecovered)('createDialogContainerQuery');

class CreateDialogContainer extends _react.default.Component {
  constructor(_props) {
    super(_props);

    _defineProperty(this, "renderWithToken", token => {
      if (!token) {
        return null;
      }

      this._token = token;
      return _react.default.createElement(_graphqlQuery.default, {
        endpoint: DOTCOM,
        token: token,
        query: CREATE_DIALOG_QUERY,
        variables: {
          organizationCount: _repositoryHomeSelectionView.PAGE_SIZE,
          organizationCursor: null
        },
        render: this.renderWithResult
      });
    });

    _defineProperty(this, "renderWithResult", ({
      error,
      data,
      retry,
      merge
    }) => {
      if (error) {
        return this.renderError(error);
      }

      if (!data && !this.lastData) {
        return this.renderLoading();
      }

      const current = data || this.lastData;
      if (data) this.lastData = data;
      this._createData = current;
      const user = current.viewer;
      const orgRelay = user && user.id ? (0, _graphqlPager.createGraphqlPager)({
        auth: {
          endpoint: DOTCOM,
          token: this._token
        },
        queryName: 'repositoryHomeSelectionViewQuery',
        variables: {
          id: user.id,
          organizationCount: _repositoryHomeSelectionView.PAGE_SIZE,
          organizationCursor: null
        },
        cursorVar: 'organizationCursor',
        getConnection: d => d.viewer && d.viewer.organizations,
        append: (prev, page) => {
          const incoming = page.node && page.node.organizations;
          if (!prev.viewer || !incoming) return prev;
          return (0, _graphqlPager.setPath)(prev, ['viewer', 'organizations'], (0, _graphqlPager.appendConnection)(prev.viewer.organizations, incoming));
        },
        getData: () => this._createData,
        merge: updater => {
          merge(prev => {
            const next = updater(prev);
            this._createData = next;
            this.lastData = next;
            return next;
          });
        },
        retry
      }) : (0, _relayStub.createRelayStub)();
      return _react.default.createElement(_createDialogController.BareCreateDialogController, _extends({
        user: user,
        isLoading: false,
        orgRelay: orgRelay
      }, this.props));
    });

    _defineProperty(this, "fetchToken", loginModel => loginModel.getToken(DOTCOM.getLoginAccount()));

    this.lastData = null;
  }

  render() {
    return _react.default.createElement(_observeModel.default, {
      model: this.props.loginModel,
      fetchData: this.fetchToken
    }, this.renderWithToken);
  }

  renderError(error) {
    return _react.default.createElement(_createDialogController.BareCreateDialogController, _extends({
      user: null,
      error: error,
      isLoading: false
    }, this.props));
  }

  renderLoading() {
    return _react.default.createElement(_createDialogController.BareCreateDialogController, _extends({
      user: null,
      isLoading: true
    }, this.props));
  }

}

exports.default = CreateDialogContainer;

_defineProperty(CreateDialogContainer, "propTypes", {
  loginModel: _propTypes2.GithubLoginModelPropType.isRequired,
  request: _propTypes.default.object.isRequired,
  error: _propTypes.default.instanceOf(Error),
  inProgress: _propTypes.default.bool.isRequired,
  currentWindow: _propTypes.default.object.isRequired,
  workspace: _propTypes.default.object.isRequired,
  commands: _propTypes.default.object.isRequired,
  config: _propTypes.default.object.isRequired
});
