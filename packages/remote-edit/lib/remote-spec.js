'use strict';

/**
 * `user@host:/absolute/path` or `host:/absolute/path`.
 * The host and path are checked again in the main process before ssh runs.
 */

function parseRemote(spec) {
  const text = String(spec || '').trim();
  const split = text.match(/^([^:\s]+):(\/\S+)$/);
  if (!split) {
    throw new Error('Use user@host:/absolute/path');
  }
  return { host: split[1], path: split[2] };
}

module.exports = { parseRemote };
