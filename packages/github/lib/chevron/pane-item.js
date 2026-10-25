"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireWildcard(require("react"));

var _reactDom = _interopRequireDefault(require("react-dom"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _eventKit = require("event-kit");

var _uriPattern = _interopRequireWildcard(require("./uri-pattern"));

var _refHolder = _interopRequireDefault(require("../models/ref-holder"));

var _stubItem = _interopRequireDefault(require("../items/stub-item"));

var _helpers = require("../helpers");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _objectSpread2(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

/**
 * PaneItem registers an opener with the current Atom workspace as long as this component is mounted. The opener will
 * trigger on URIs that match a specified pattern and render a subtree returned by a render prop.
 *
 * The render prop can receive three arguments:
 *
 * * itemHolder: A RefHolder. If used as the target for a ref, the referenced component will be used as the "item" of
 *   the pane item - its `getTitle()`, `getIconName()`, and other methods will be used by the pane.
 * * params: An object containing the named parameters captured by the URI pattern.
 * * uri: The exact, matched URI used to launch this item.
 *
 * render() {
 *   return (
 *     <PaneItem workspace={this.props.workspace} uriPattern='atom-github://host/{id}'>
 *       {({itemHolder, params}) => (
 *         <ItemComponent ref={itemHolder.setter} id={params.id} />
 *       )}
 *     </PaneItem>
 *   );
 * }
 */
class PaneItem extends _react.default.Component {
  constructor(props) {
    super(props);
    (0, _helpers.autobind)(this, 'opener');
    const uriPattern = new _uriPattern.default(this.props.uriPattern);
    const currentlyOpen = this.props.workspace.getPaneItems().reduce((arr, item) => {
      const element = item.getElement ? item.getElement() : null;
      const match = item.getURI ? uriPattern.matches(item.getURI()) : _uriPattern.nonURIMatch;
      const stub = item.setRealItem ? item : null;

      if (element && match.ok()) {
        const openItem = new OpenItem(match, element, stub);
        arr.push(openItem);
      }

      return arr;
    }, []);
    this.subs = new _eventKit.CompositeDisposable();
    this.state = {
      uriPattern,
      currentlyOpen
    };
  }

  static getDerivedStateFromProps(nextProps, prevState) {
    if (prevState.uriPattern.getOriginal() === nextProps.uriPattern) {
      return null;
    }

    return {
      uriPattern: new _uriPattern.default(nextProps.uriPattern)
    };
  }

  componentDidMount() {
    // Listen for and adopt StubItems that are added after this component has
    // already been mounted.
    this.subs.add(this.props.workspace.onDidAddPaneItem(({
      item
    }) => {
      if (!item._getStub) {
        return;
      }

      const stub = item._getStub();

      if (stub.getRealItem() !== null) {
        return;
      }

      const match = this.state.uriPattern.matches(item.getURI());

      if (!match.ok()) {
        return;
      }

      const openItem = new OpenItem(match, stub.getElement(), stub);
      openItem.hydrateStub({
        copy: () => this.copyOpenItem(openItem)
      });

      if (this.props.className) {
        openItem.addClassName(this.props.className);
      }

      this.registerCloseListener(item, openItem);
      this.setState(prevState => ({
        currentlyOpen: [...prevState.currentlyOpen, openItem]
      }));
    }));

    for (const openItem of this.state.currentlyOpen) {
      this.registerCloseListener(openItem.stubItem, openItem);
      openItem.hydrateStub({
        copy: () => this.copyOpenItem(openItem)
      });

      if (this.props.className) {
        openItem.addClassName(this.props.className);
      }
    }

    this.subs.add(this.props.workspace.addOpener(this.opener));
  }

  render() {
    return this.state.currentlyOpen.map(item => {
      return _react.default.createElement(_react.Fragment, {
        key: item.getKey()
      }, item.renderPortal(this.props.children));
    });
  }

  componentWillUnmount() {
    this.subs.dispose();
  }

  opener(uri) {
    const m = this.state.uriPattern.matches(uri);

    if (!m.ok()) {
      return undefined;
    }

    const openItem = new OpenItem(m);

    if (this.props.className) {
      openItem.addClassName(this.props.className);
    }

    return new Promise(resolve => {
      this.setState(prevState => ({
        currentlyOpen: [...prevState.currentlyOpen, openItem]
      }), () => {
        const paneItem = openItem.create({
          copy: () => this.copyOpenItem(openItem)
        });
        this.registerCloseListener(paneItem, openItem);
        resolve(paneItem);
      });
    });
  }

  copyOpenItem(openItem) {
    const m = this.state.uriPattern.matches(openItem.getURI());

    if (!m.ok()) {
      return null;
    }

    const stub = _stubItem.default.create('generic', openItem.getStubProps(), openItem.getURI());

    const copiedItem = new OpenItem(m, stub.getElement(), stub);
    this.setState(prevState => ({
      currentlyOpen: [...prevState.currentlyOpen, copiedItem]
    }), () => {
      this.registerCloseListener(stub, copiedItem);
      copiedItem.hydrateStub({
        copy: () => this.copyOpenItem(copiedItem)
      });
    });
    return stub;
  }

  registerCloseListener(paneItem, openItem) {
    const sub = this.props.workspace.onDidDestroyPaneItem(({
      item
    }) => {
      if (item === paneItem) {
        sub.dispose();
        this.subs.remove(sub);
        this.setState(prevState => ({
          currentlyOpen: prevState.currentlyOpen.filter(each => each !== openItem)
        }));
      }
    });
    this.subs.add(sub);
  }

}
/**
 * A subtree rendered through a portal onto a detached DOM node for use as the root as a PaneItem.
 */


exports.default = PaneItem;

_defineProperty(PaneItem, "propTypes", {
  workspace: _propTypes.default.object.isRequired,
  children: _propTypes.default.func.isRequired,
  uriPattern: _propTypes.default.string.isRequired,
  className: _propTypes.default.string
});

class OpenItem {
  constructor(match, element = null, stub = null) {
    this.id = this.constructor.nextID;
    this.constructor.nextID++;
    this.domNode = element || document.createElement('div');
    this.domNode.tabIndex = '-1';
    this.domNode.onfocus = this.onFocus.bind(this);
    this.stubItem = stub;
    this.stubProps = stub ? stub.props : {};
    this.match = match;
    this.itemHolder = new _refHolder.default();
  }

  getURI() {
    return this.match.getURI();
  }

  create(extra = {}) {
    const h = this.itemHolder.isEmpty() ? null : this.itemHolder;
    return (0, _helpers.createItem)(this.domNode, h, this.match.getURI(), extra);
  }

  hydrateStub(extra = {}) {
    if (this.stubItem) {
      this.stubItem.setRealItem(this.create(extra));
      this.stubItem = null;
    }
  }

  addClassName(className) {
    this.domNode.classList.add(className);
  }

  getKey() {
    return this.id;
  }

  getStubProps() {
    const itemProps = this.itemHolder.map(item => ({
      title: item.getTitle ? item.getTitle() : null,
      iconName: item.getIconName ? item.getIconName() : null
    }));
    return _objectSpread2({}, this.stubProps, {}, itemProps);
  }

  onFocus() {
    return this.itemHolder.map(item => item.focus && item.focus());
  }

  renderPortal(renderProp) {
    return _reactDom.default.createPortal(renderProp({
      deserialized: this.stubProps,
      itemHolder: this.itemHolder,
      params: this.match.getParams(),
      uri: this.match.getURI()
    }), this.domNode);
  }

}

_defineProperty(OpenItem, "nextID", 0);