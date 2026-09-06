const { CompositeDisposable } = require('event-kit');

class PaneContainerElement extends HTMLElement {
  constructor() {
    super();
    this.subscriptions = new CompositeDisposable();
  }

  initialize(model, { views }) {
    this.model = model;
    this.views = views;
    if (this.views == null) {
      throw new Error(
        'Must pass a views parameter when initializing PaneContainerElements'
      );
    }
    this.subscriptions.add(this.model.observeRoot(this.rootChanged.bind(this)));
    // Not connectedCallback: the document-register-element polyfill upgrades
    // asynchronously, so this class arrived a tick or more after the element
    // was in the DOM -- and never at all under the spec suite's mocked clock.
    // pane-axis-element sets its orientation classes here for the same reason.
    this.classList.add('panes');
    return this;
  }

  connectedCallback() {
    this.classList.add('panes');
  }

  rootChanged(root) {
    const focusedElement = this.hasFocus() ? document.activeElement : null;
    if (this.firstChild != null) {
      this.firstChild.remove();
    }
    if (root != null) {
      const view = this.views.getView(root);
      this.appendChild(view);
      if (focusedElement != null) {
        focusedElement.focus();
      }
    }
  }

  hasFocus() {
    return (
      this === document.activeElement || this.contains(document.activeElement)
    );
  }
}

window.customElements.define('atom-pane-container', PaneContainerElement);

const createCustomElement = require('./create-custom-element');

function createPaneContainerElement() {
  return createCustomElement('atom-pane-container', PaneContainerElement);
}

module.exports = {
  createPaneContainerElement
};
