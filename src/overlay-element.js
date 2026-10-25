'use strict';

const createCustomElement = require('./create-custom-element');

class OverlayElement extends HTMLElement {}

window.customElements.define('chevron-overlay', OverlayElement);

function createOverlayElement() {
  return createCustomElement('chevron-overlay', OverlayElement);
}

module.exports = {
  OverlayElement,
  createOverlayElement
};
