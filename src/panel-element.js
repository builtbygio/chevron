'use strict';

const createCustomElement = require('./create-custom-element');

class PanelElement extends HTMLElement {}

window.customElements.define('chevron-panel', PanelElement);

function createPanelElement() {
  return createCustomElement('chevron-panel', PanelElement);
}

module.exports = {
  PanelElement,
  createPanelElement
};
