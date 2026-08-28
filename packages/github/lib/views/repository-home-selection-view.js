"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.BareRepositoryHomeSelectionView = exports.PAGE_SIZE = void 0;

var _react = _interopRequireWildcard(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));


var _tabbable = require("./tabbable");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _objectSpread2(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const PAGE_DELAY = 500;
const PAGE_SIZE = 50;
exports.PAGE_SIZE = PAGE_SIZE;

class BareRepositoryHomeSelectionView extends _react.default.Component {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "renderOwner", owner => _react.default.createElement(_react.Fragment, null, _react.default.createElement("div", {
      className: "github-RepositoryHome-ownerOption"
    }, _react.default.createElement("img", {
      alt: "",
      src: owner.avatarURL,
      className: "github-RepositoryHome-ownerAvatar"
    }), _react.default.createElement("span", {
      className: "github-RepositoryHome-ownerName"
    }, owner.login)), owner.disabled && !owner.placeholder && _react.default.createElement("div", {
      className: "github-RepositoryHome-ownerUnwritable"
    }, "(insufficient permissions)")));

    _defineProperty(this, "didChangeOwner", owner => this.props.didChangeOwnerID(owner.id));

    _defineProperty(this, "loadNextPage", () => {
      /* istanbul ignore if */
      if (this.props.relay.isLoading()) {
        setTimeout(this.loadNextPage, PAGE_DELAY);
        return;
      }

      this.props.relay.loadMore(PAGE_SIZE);
    });
  }

  render() {
    const owners = this.getOwners();
    const currentOwner = owners.find(o => o.id === this.props.selectedOwnerID) || owners[0];
    return _react.default.createElement("div", {
      className: "github-RepositoryHome"
    }, _react.default.createElement(_tabbable.TabbableSelect, {
      tabGroup: this.props.tabGroup,
      commands: this.props.commands,
      autofocus: this.props.autofocusOwner,
      className: "github-RepositoryHome-owner",
      clearable: false,
      disabled: this.props.isLoading,
      options: owners,
      optionRenderer: this.renderOwner,
      value: currentOwner,
      valueRenderer: this.renderOwner,
      onChange: this.didChangeOwner
    }), _react.default.createElement("span", {
      className: "github-RepositoryHome-separator"
    }, "/"), _react.default.createElement(_tabbable.TabbableTextEditor, {
      tabGroup: this.props.tabGroup,
      commands: this.props.commands,
      autofocus: this.props.autofocusName,
      mini: true,
      buffer: this.props.nameBuffer
    }));
  }

  componentDidMount() {
    this.schedulePageLoad();
  }

  componentDidUpdate() {
    this.schedulePageLoad();
  }

  getOwners() {
    if (!this.props.user) {
      return [{
        id: 'loading',
        login: 'loading...',
        avatarURL: '',
        disabled: true,
        placeholder: true
      }];
    }

    const owners = [{
      id: this.props.user.id,
      login: this.props.user.login,
      avatarURL: this.props.user.avatarUrl,
      disabled: false
    }];
    /* istanbul ignore if */

    if (!this.props.user.organizations.edges) {
      return owners;
    }

    for (const {
      node
    } of this.props.user.organizations.edges) {
      /* istanbul ignore if */
      if (!node) {
        continue;
      }

      owners.push({
        id: node.id,
        login: node.login,
        avatarURL: node.avatarUrl,
        disabled: !node.viewerCanCreateRepositories
      });
    }

    if (this.props.relay && this.props.relay.hasMore()) {
      owners.push({
        id: 'loading',
        login: 'loading...',
        avatarURL: '',
        disabled: true,
        placeholder: true
      });
    }

    return owners;
  }

  schedulePageLoad() {
    if (!this.props.relay.hasMore()) {
      return;
    }

    setTimeout(this.loadNextPage, PAGE_DELAY);
  }

}

exports.BareRepositoryHomeSelectionView = BareRepositoryHomeSelectionView;

_defineProperty(BareRepositoryHomeSelectionView, "propTypes", {
  // Relay
  relay: _propTypes.default.shape({
    hasMore: _propTypes.default.func.isRequired,
    isLoading: _propTypes.default.func.isRequired,
    loadMore: _propTypes.default.func.isRequired
  }).isRequired,
  user: _propTypes.default.shape({
    id: _propTypes.default.string.isRequired,
    login: _propTypes.default.string.isRequired,
    avatarUrl: _propTypes.default.string.isRequired,
    organizations: _propTypes.default.shape({
      edges: _propTypes.default.arrayOf(_propTypes.default.shape({
        node: _propTypes.default.shape({
          id: _propTypes.default.string.isRequired,
          login: _propTypes.default.string.isRequired,
          avatarUrl: _propTypes.default.string.isRequired,
          viewerCanCreateRepositories: _propTypes.default.bool.isRequired
        })
      }))
    }).isRequired
  }),
  // Model
  nameBuffer: _propTypes.default.object.isRequired,
  isLoading: _propTypes.default.bool.isRequired,
  selectedOwnerID: _propTypes.default.string.isRequired,
  tabGroup: _propTypes.default.object.isRequired,
  autofocusOwner: _propTypes.default.bool,
  autofocusName: _propTypes.default.bool,
  // Selection callback
  didChangeOwnerID: _propTypes.default.func.isRequired,
  // Atom environment
  commands: _propTypes.default.object.isRequired
});

_defineProperty(BareRepositoryHomeSelectionView, "defaultProps", {
  autofocusOwner: false,
  autofocusName: false
});


exports.default = BareRepositoryHomeSelectionView;