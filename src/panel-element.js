'use strict';

const createCustomElement = require('./create-custom-element');

class PanelElement extends HTMLElement {}

window.customElements.define('atom-panel', PanelElement);

function createPanelElement() {
  return createCustomElement('atom-panel', PanelElement);
}

module.exports = {
  PanelElement,
  createPanelElement
};
