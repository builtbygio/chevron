'use strict';

/**
 * Create a custom element instance that works under contextIsolation.
 *
 * With contextIsolation, document.createElement(tag) may return an un-upgraded
 * HTMLElement even after customElements.define() in the preload world. Using
 * `new ElementClass()` forces the constructor to run in the same realm.
 */
module.exports = function createCustomElement(tagName, ElementClass) {
  if (typeof customElements !== 'undefined' && !customElements.get(tagName)) {
    customElements.define(tagName, ElementClass);
  }
  try {
    return new ElementClass();
  } catch (error) {
    // Fallback for environments that require the element to be defined first
    // and only constructible via createElement.
    const el = document.createElement(tagName);
    if (el.constructor === ElementClass || el instanceof ElementClass) {
      return el;
    }
    throw error;
  }
};
