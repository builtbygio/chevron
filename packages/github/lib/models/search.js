"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.nullSearch = exports.default = void 0;

function _objectSpread2(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const NULL = Symbol('null');
const CREATE_ON_EMPTY = Symbol('create on empty');

class Search {
  constructor(name, query, attrs = {}) {
    this.name = name;
    this.query = query;
    this.attrs = attrs;
  }

  getName() {
    return this.name;
  }

  createQuery() {
    return this.query;
  } // A null search has insufficient information to construct a canned query, so it should always return no results.


  isNull() {
    return this.attrs[NULL] || false;
  }

  showCreateOnEmpty() {
    return this.attrs[CREATE_ON_EMPTY] || false;
  }

  getWebURL(remote) {
    if (!remote.isGithubRepo()) {
      throw new Error(`Attempt to generate web URL for non-GitHub remote ${remote.getName()}`);
    }

    return `https://${remote.getDomain()}/search?q=${encodeURIComponent(this.createQuery())}`;
  }

  static inRemote(remote, name, query, attrs = {}) {
    if (!remote.isGithubRepo()) {
      return new this(name, '', _objectSpread2({}, attrs, {
        [NULL]: true
      }));
    }

    return new this(name, `repo:${remote.getOwner()}/${remote.getRepo()} ${query.trim()}`, attrs);
  }

}

exports.default = Search;
const nullSearch = new Search('', '', {
  [NULL]: true
});
exports.nullSearch = nullSearch;