'use strict';

// Highest upstream tag at or below a vendored version.
//
// String compare is wrong for this: "0.37.8" > "0.37.10", so the restore
// script used to keep v0.37.1 and skip the JavaScript specs at v0.37.8.
// A release sorts above its prerelease (0.37.1-1 < 0.37.1).

function parseTag(value) {
  const raw = String(value).replace(/^v/, '');
  const [core, pre = ''] = raw.split('-');
  const parts = core.split('.').map(part => Number(part) || 0);
  while (parts.length < 3) parts.push(0);
  return { raw, parts: parts.slice(0, 3), pre };
}

function compareTags(left, right) {
  for (let i = 0; i < 3; i++) {
    if (left.parts[i] !== right.parts[i]) return left.parts[i] - right.parts[i];
  }
  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre < right.pre ? -1 : 1;
}

function bestTag(tags, version) {
  const want = parseTag(version || '999999.0.0');
  let best = null;
  for (const tag of tags) {
    if (!tag) continue;
    const parsed = parseTag(tag);
    if (compareTags(parsed, want) > 0) continue;
    if (!best || compareTags(parsed, best) > 0) best = parsed;
  }
  return best ? best.raw : '';
}

module.exports = { parseTag, compareTags, bestTag };

if (require.main === module) {
  const tags = require('fs').readFileSync(0, 'utf8').split('\n');
  process.stdout.write(bestTag(tags, process.argv[2] || ''));
}
