"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WholeFileDiscardHistory = exports.PartialFileDiscardHistory = void 0;

function _objectSpread2(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class PartialFileDiscardHistory {
  constructor(maxHistoryLength) {
    this.blobHistoryByFilePath = {};
    this.maxHistoryLength = maxHistoryLength || 60;
  }

  getHistoryForPath(filePath) {
    const history = this.blobHistoryByFilePath[filePath];

    if (history) {
      return history;
    } else {
      this.setHistoryForPath(filePath, []);
      return this.blobHistoryByFilePath[filePath];
    }
  }

  setHistoryForPath(filePath, history) {
    this.blobHistoryByFilePath[filePath] = history;
  }

  getHistory() {
    return this.blobHistoryByFilePath;
  }

  setHistory(history) {
    this.blobHistoryByFilePath = history;
  }

  popHistoryForPath(filePath) {
    return this.getHistoryForPath(filePath).pop();
  }

  addHistory(filePath, snapshots) {
    const history = this.getHistoryForPath(filePath);
    history.push(snapshots);

    if (history.length >= this.maxHistoryLength) {
      this.setHistoryForPath(filePath, history.slice(Math.ceil(this.maxHistoryLength / 2)));
    }
  }

  getLastSnapshotsForPath(filePath) {
    const history = this.getHistoryForPath(filePath);
    const snapshots = history[history.length - 1];

    if (!snapshots) {
      return null;
    }

    return _objectSpread2({
      filePath
    }, snapshots);
  }

  clearHistoryForPath(filePath) {
    this.setHistoryForPath(filePath, []);
  }

}

exports.PartialFileDiscardHistory = PartialFileDiscardHistory;

class WholeFileDiscardHistory {
  constructor(maxHistoryLength) {
    this.blobHistory = [];
    this.maxHistoryLength = maxHistoryLength || 60;
  }

  getHistory() {
    return this.blobHistory;
  }

  setHistory(history) {
    this.blobHistory = history;
  }

  popHistory() {
    return this.getHistory().pop();
  }

  addHistory(snapshotsByPath) {
    const history = this.getHistory();
    history.push(snapshotsByPath);

    if (history.length >= this.maxHistoryLength) {
      this.setHistory(history.slice(Math.ceil(this.maxHistoryLength / 2)));
    }
  }

  getLastSnapshots() {
    const history = this.getHistory();
    const snapshotsByPath = history[history.length - 1] || {};
    return Object.keys(snapshotsByPath).map(p => {
      return _objectSpread2({
        filePath: p
      }, snapshotsByPath[p]);
    });
  }

  clearHistory() {
    this.setHistory([]);
  }

}

exports.WholeFileDiscardHistory = WholeFileDiscardHistory;