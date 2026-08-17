'use strict';

/**
 * Logic-only fixture package for package host v2 (Epic 21.2).
 *
 * Uses nothing but the supported `chevron` API surface: no `require('fs')`,
 * no DOM, no custom elements. That is exactly the class of package the host
 * is meant to run.
 */

const { CompositeDisposable } = require('chevron');

module.exports = {
  activated: false,
  deactivated: false,
  observedGreeting: null,
  dispatchCount: 0,

  activate(state) {
    this.activated = true;
    this.restoredState = state || null;
    this.subscriptions = new CompositeDisposable();

    const chevron = require('chevron');

    this.subscriptions.add(
      chevron.config.observe('package-host-logic-only.greeting', value => {
        this.observedGreeting = value;
      })
    );

    this.subscriptions.add(
      chevron.commands.add('atom-workspace', {
        'package-host-logic-only:greet': () => {
          this.dispatchCount++;
          chevron.notifications.addInfo(
            `${this.observedGreeting || 'hello'} from the package host`
          );
        }
      })
    );
  },

  serialize() {
    return { dispatchCount: this.dispatchCount };
  },

  deactivate() {
    this.deactivated = true;
    if (this.subscriptions) this.subscriptions.dispose();
  }
};
