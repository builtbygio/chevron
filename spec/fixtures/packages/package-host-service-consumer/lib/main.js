'use strict';

/** Fixture: consumes an editor-owned service from inside the host (Epic 21.3). */

module.exports = {
  clock: null,
  consumeCount: 0,
  missingConsumed: false,

  activate() {},

  consumeClock(service) {
    this.clock = service;
    this.consumeCount++;
  },

  consumeMissing() {
    // Must never be called: no such service is ever offered.
    this.missingConsumed = true;
  },

  provideProbe() {
    return {
      consumeCount: () => this.consumeCount,
      missingConsumed: () => this.missingConsumed,
      askClock: () => this.clock.now()
    };
  },

  deactivate() {}
};
