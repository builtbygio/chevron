'use strict';

/**
 * Fixture: a package that reaches for privileged Node from inside the host.
 * The restricted loader must refuse this; the host must report the failure
 * rather than activating the package.
 */

module.exports = {
  activate() {
    // Should throw CHEVRON_HOST_REQUIRE_BLOCKED before this returns.
    const fs = require('fs');
    this.leaked = typeof fs.readFileSync === 'function';
  },
  deactivate() {}
};
