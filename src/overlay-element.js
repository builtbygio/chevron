'use strict';

const createCustomElement = require('./create-custom-element');

class OverlayElement extends HTMLElement {}

window.customElements.define('atom-overlay', OverlayElement);

function createOverlayElement() {
  return createCustomElement('atom-overlay', OverlayElement);
}

module.exports = {
  OverlayElement,
  createOverlayElement
};
