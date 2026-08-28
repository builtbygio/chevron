"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.TextEditorContext = void 0;

var _react = _interopRequireWildcard(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _chevron = require("chevron");

var _eventKit = require("event-kit");

var _refHolder = _interopRequireDefault(require("../models/ref-holder"));

var _propTypes2 = require("../prop-types");

var _helpers = require("../helpers");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _objectSpread2(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const editorUpdateProps = {
  mini: _propTypes.default.bool,
  readOnly: _propTypes.default.bool,
  placeholderText: _propTypes.default.string,
  lineNumberGutterVisible: _propTypes.default.bool,
  autoHeight: _propTypes.default.bool,
  autoWidth: _propTypes.default.bool,
  softWrapped: _propTypes.default.bool
};

const editorCreationProps = _objectSpread2({
  buffer: _propTypes.default.object
}, editorUpdateProps);

const EMPTY_CLASS = 'github-AtomTextEditor-empty';

const TextEditorContext = _react.default.createContext();

exports.TextEditorContext = TextEditorContext;

class AtomTextEditor extends _react.default.Component {
  constructor(props) {
    super(props);

    _defineProperty(this, "observeSelections", selection => {
      const selectionSubs = new _eventKit.CompositeDisposable(selection.onDidChangeRange(this.props.didChangeSelectionRange), selection.onDidDestroy(() => {
        selectionSubs.dispose();
        this.subs.remove(selectionSubs);
        this.props.didDestroySelection(selection);
      }));
      this.subs.add(selectionSubs);
      this.props.didAddSelection(selection);
    });

    _defineProperty(this, "observeEmptiness", () => {
      this.getRefModel().map(editor => {
        if (editor.isEmpty() && this.props.hideEmptiness) {
          this.getRefElement().map(element => element.classList.add(EMPTY_CLASS));
        } else {
          this.getRefElement().map(element => element.classList.remove(EMPTY_CLASS));
        }

        return null;
      });
    });

    this.subs = new _eventKit.CompositeDisposable();
    this.refParent = new _refHolder.default();
    this.refElement = null;
    this.refModel = null;
  }

  render() {
    return _react.default.createElement(_react.Fragment, null, _react.default.createElement("div", {
      className: "github-AtomTextEditor-container",
      ref: this.refParent.setter
    }), _react.default.createElement(TextEditorContext.Provider, {
      value: this.getRefModel()
    }, this.props.children));
  }

  componentDidMount() {
    const modelProps = (0, _helpers.extractProps)(this.props, editorCreationProps);
    this.refParent.map(element => {
      const editor = new _chevron.TextEditor(modelProps);
      editor.getElement().tabIndex = this.props.tabIndex;

      if (this.props.className) {
        editor.getElement().classList.add(this.props.className);
      }

      if (this.props.preselect) {
        editor.selectAll();
      }

      element.appendChild(editor.getElement());
      this.getRefModel().setter(editor);
      this.getRefElement().setter(editor.getElement());
      this.subs.add(editor.onDidChangeCursorPosition(this.props.didChangeCursorPosition), editor.observeSelections(this.observeSelections), editor.onDidChange(this.observeEmptiness));

      if (editor.isEmpty() && this.props.hideEmptiness) {
        editor.getElement().classList.add(EMPTY_CLASS);
      }

      return null;
    });
  }

  componentDidUpdate() {
    const modelProps = (0, _helpers.extractProps)(this.props, editorUpdateProps);
    this.getRefModel().map(editor => editor.update(modelProps)); // When you look into the abyss, the abyss also looks into you

    this.observeEmptiness();
  }

  componentWillUnmount() {
    this.getRefModel().map(editor => editor.destroy());
    this.subs.dispose();
  }

  contains(element) {
    return this.getRefElement().map(e => e.contains(element)).getOr(false);
  }

  focus() {
    this.getRefElement().map(e => e.focus());
  }

  getRefModel() {
    if (this.props.refModel) {
      return this.props.refModel;
    }

    if (!this.refModel) {
      this.refModel = new _refHolder.default();
    }

    return this.refModel;
  }

  getRefElement() {
    if (this.props.refElement) {
      return this.props.refElement;
    }

    if (!this.refElement) {
      this.refElement = new _refHolder.default();
    }

    return this.refElement;
  }

  getModel() {
    return this.getRefModel().getOr(undefined);
  }

}

exports.default = AtomTextEditor;

_defineProperty(AtomTextEditor, "propTypes", _objectSpread2({}, editorCreationProps, {
  didChangeCursorPosition: _propTypes.default.func,
  didAddSelection: _propTypes.default.func,
  didChangeSelectionRange: _propTypes.default.func,
  didDestroySelection: _propTypes.default.func,
  hideEmptiness: _propTypes.default.bool,
  preselect: _propTypes.default.bool,
  className: _propTypes.default.string,
  tabIndex: _propTypes.default.number,
  refModel: _propTypes2.RefHolderPropType,
  refElement: _propTypes2.RefHolderPropType,
  children: _propTypes.default.node
}));

_defineProperty(AtomTextEditor, "defaultProps", {
  didChangeCursorPosition: () => {},
  didAddSelection: () => {},
  didChangeSelectionRange: () => {},
  didDestroySelection: () => {},
  hideEmptiness: false,
  preselect: false,
  tabIndex: 0
});