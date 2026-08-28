'use strict';

/**
 * React 18 mount helper (8B). Inbox GraphQL is graphql-client.
 * stay; their artifacts are precompiled and cannot be regenerated here.
 */

const {flushSync} = require('react-dom');
const {createRoot} = require('react-dom/client');

const roots = new WeakMap();

function render(element, node, callback) {
  let root = roots.get(node);
  if (!root) {
    root = createRoot(node);
    roots.set(node, root);
  }
  if (typeof callback === 'function') {
    flushSync(() => {
      root.render(element);
    });
    callback();
  } else {
    root.render(element);
  }
}

function unmount(node) {
  const root = roots.get(node);
  if (!root) return;
  roots.delete(node);
  root.unmount();
}

module.exports = {render, unmount};
