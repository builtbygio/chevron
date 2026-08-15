'use strict';

// Unsupported legacy alias for require('chevron'). Not a community-compat
// product. New packages must use require('chevron'). Dedicated removal is
// architecture H3 (docs/chevron-architecture-modernization.md PR 23).
if (!global.__chevronAtomRequireWarned) {
  global.__chevronAtomRequireWarned = true;
  console.warn(
    '[chevron] require("atom") is a legacy alias; use require("chevron"). ' +
      'See docs/REBRANDING.md (Chevron-only policy).'
  );
}
module.exports = require('./chevron');
