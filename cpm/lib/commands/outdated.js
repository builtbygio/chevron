'use strict';

/**
 * apm `outdated --json` — settings-view loadOutdated.
 * Return an empty list for now (no registry walk). A non-zero exit or
 * non-JSON stdout is what produced "Fetching outdated packages failed."
 */

function listOutdated({ json } = {}) {
  const packages = [];
  if (json) {
    process.stdout.write(JSON.stringify(packages) + '\n');
  } else {
    console.log('(none)');
  }
  return 0;
}

module.exports = { listOutdated };
