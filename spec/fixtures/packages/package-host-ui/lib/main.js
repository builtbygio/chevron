'use strict';

/** Fixture: a package whose activate() builds DOM. Not host-eligible. */

module.exports = {
  activate() {
    const chevron = require('chevron');
    this.element = document.createElement('div');
    this.element.classList.add('package-host-ui');
    this.panel = chevron.workspace.addModalPanel({ item: this.element });
  },
  deactivate() {
    if (this.panel) this.panel.destroy();
  }
};
