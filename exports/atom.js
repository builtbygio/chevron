'use strict';

// Unsupported legacy alias for require('chevron'). Chevron-only product policy:
// new packages must use require('chevron'). This shim may be removed later.
if (!global.__chevronAtomRequireWarned) {
  global.__chevronAtomRequireWarned = true;
  console.warn(
    '[chevron] require("atom") is a legacy alias; use require("chevron"). ' +
      'See docs/REBRANDING.md (Chevron-only policy).'
  );
}
module.exports = require('./chevron');
