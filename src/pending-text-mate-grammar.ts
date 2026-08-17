'use strict';

const { Disposable } = require('event-kit');

function toJsRegex(value) {
  if (!value) return null;
  if (value instanceof RegExp) return value;
  if (typeof value.test === 'function') return value;
  if (Array.isArray(value)) {
    try {
      return new RegExp(value[0], value[1] || '');
    } catch (_) {
      return null;
    }
  }
  if (typeof value === 'string') {
    try {
      return new RegExp(value);
    } catch (_) {
      return null;
    }
  }
  return null;
}

/**
 * Stand-in for a first-mate Grammar so TM CSON/JSON can register at
 * package activate without loading oniguruma. Materialize() creates the
 * real first-mate grammar the first time a buffer is assigned TM mode.
 */
class PendingTextMateGrammar {
  constructor(registry, filePath, params) {
    this.chevronRegistry = registry;
    this.path = filePath;
    this.params = params;
    this.scopeName = params.scopeName;
    this.name = params.name;
    this.fileTypes = params.fileTypes || [];
    this.maxTokensPerLine = params.maxTokensPerLine;
    this.injectionSelector = params.injectionSelector || null;
    this.firstLineRegex = toJsRegex(
      params.firstLineRegex || params.firstLineMatch
    );
    this.contentRegex = toJsRegex(params.contentRegex || params.contentMatch);
    this.packageName = null;
    this.bundledPackage = false;
    this.registration = null;
    this._live = null;
  }

  get liveGrammar() {
    return this._live;
  }

  onDidUpdate() {
    return new Disposable(() => {});
  }

  activate() {
    this.registration = this.chevronRegistry.addGrammar(this);
    return this.registration;
  }

  deactivate() {
    if (this.registration) this.registration.dispose();
    this.registration = null;
    if (this._live && typeof this._live.deactivate === 'function') {
      this._live.deactivate();
    }
  }

  materialize() {
    if (this._live) return this._live;
    const fmRegistry = this.chevronRegistry.ensureTextMateRegistry();
    const live = fmRegistry.createGrammar(this.path, this.params);
    live.packageName = this.packageName;
    live.bundledPackage = this.bundledPackage;
    this._live = live;
    fmRegistry.addGrammar(live);
    return live;
  }
}

module.exports = { PendingTextMateGrammar, toJsRegex };
