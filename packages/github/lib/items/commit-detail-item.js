"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireDefault(require("react"));

var _path = _interopRequireDefault(require("path"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _eventKit = require("event-kit");

var _propTypes2 = require("../prop-types");

var _commitDetailContainer = _interopRequireDefault(require("../containers/commit-detail-container"));

var _refHolder = _interopRequireDefault(require("../models/ref-holder"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class CommitDetailItem extends _react.default.Component {
  static buildURI(workingDirectory, sha) {
    // encodeURIComponent leaves "+" alone, and the query parser then turns
    // that "+" into a space. The workdir no longer matches the repository
    // pool, the absent repository answers "no commit", and the view spins.
    const encode = value => encodeURIComponent(String(value)).replace(/\+/g, '%2B');

    const encodedSha = sha === '{sha}' ? '{sha}' : encode(sha);

    return `atom-github://commit-detail?workdir=${encode(workingDirectory)}&sha=${encodedSha}`;
  }

  repositoryFor(workingDirectory) {
    const pool = this.props.workdirContextPool;
    const direct = pool.getContext(workingDirectory);
    const directRepo = direct && direct.getRepository();

    if (directRepo && directRepo.isPresent()) return directRepo;

    let best = null;
    let bestLength = -1;

    if (typeof pool.withResidentContexts === 'function') {
      pool.withResidentContexts((directory, context) => {
        const repo = context.getRepository();
        if (!repo || !repo.isPresent()) return;
        const dir = directory || context.getWorkingDirectory();
        if (!dir || !workingDirectory) return;
        const matches = workingDirectory === dir || workingDirectory.startsWith(dir + _path.default.sep);

        if (matches && dir.length > bestLength) {
          best = repo;
          bestLength = dir.length;
        }
      });
    }

    return best || directRepo;
  }

  constructor(props) {
    super(props);

    _defineProperty(this, "destroy", () => {
      /* istanbul ignore else */
      if (!this.isDestroyed) {
        this.emitter.emit('did-destroy');
        this.isDestroyed = true;
      }
    });

    this.emitter = new _eventKit.Emitter();
    this.isDestroyed = false;
    this.hasTerminatedPendingState = false;
    this.shouldFocus = true;
    this.refInitialFocus = new _refHolder.default();
    this.refEditor = new _refHolder.default();
    this.refEditor.observe(editor => {
      if (editor.isAlive()) {
        this.emitter.emit('did-change-embedded-text-editor', editor);
      }
    });
  }

  terminatePendingState() {
    if (!this.hasTerminatedPendingState) {
      this.emitter.emit('did-terminate-pending-state');
      this.hasTerminatedPendingState = true;
    }
  }

  onDidTerminatePendingState(callback) {
    return this.emitter.on('did-terminate-pending-state', callback);
  }

  onDidDestroy(callback) {
    return this.emitter.on('did-destroy', callback);
  }

  render() {
    const repository = this.repositoryFor(this.props.workingDirectory);
    return _react.default.createElement(_commitDetailContainer.default, _extends({
      itemType: this.constructor,
      repository: repository
    }, this.props, {
      destroy: this.destroy,
      refEditor: this.refEditor,
      refInitialFocus: this.refInitialFocus
    }));
  }

  getTitle() {
    return `Commit: ${this.props.sha}`;
  }

  getIconName() {
    return 'git-commit';
  }

  observeEmbeddedTextEditor(cb) {
    this.refEditor.map(editor => editor.isAlive() && cb(editor));
    return this.emitter.on('did-change-embedded-text-editor', cb);
  }

  getWorkingDirectory() {
    return this.props.workingDirectory;
  }

  getSha() {
    return this.props.sha;
  }

  serialize() {
    return {
      deserializer: 'CommitDetailStub',
      uri: CommitDetailItem.buildURI(this.props.workingDirectory, this.props.sha)
    };
  }

  preventFocus() {
    this.shouldFocus = false;
  }

  focus() {
    this.refInitialFocus.getPromise().then(focusable => {
      if (!this.shouldFocus) {
        return;
      }

      focusable.focus();
    });
  }

}

exports.default = CommitDetailItem;

_defineProperty(CommitDetailItem, "propTypes", {
  workdirContextPool: _propTypes2.WorkdirContextPoolPropType.isRequired,
  workingDirectory: _propTypes.default.string.isRequired,
  sha: _propTypes.default.string.isRequired
});

_defineProperty(CommitDetailItem, "uriPattern", 'atom-github://commit-detail?workdir={workingDirectory}&sha={sha}');