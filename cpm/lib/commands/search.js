'use strict';

const { searchPackages, getRegistryBaseUrl } = require('../registry');

async function searchCommand(query, options = {}) {
  if (!query || !String(query).trim()) {
    process.stderr.write('cpm search: query required\n');
    return 1;
  }

  let hits;
  try {
    hits = await searchPackages(query.trim(), { page: options.page || 1 });
  } catch (err) {
    process.stderr.write(`cpm search: ${err.message}\n`);
    return 1;
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(hits, null, 2) + '\n');
    return 0;
  }

  process.stdout.write(
    `Search results for '${query}' (${hits.length}) — ${getRegistryBaseUrl()}\n`
  );
  if (hits.length === 0) {
    process.stdout.write('(no packages found)\n');
    return 0;
  }

  for (const h of hits) {
    const ver = h.version ? `@${h.version}` : '';
    const stats = `${h.downloads} downloads, ${h.stars} stars`;
    const desc = (h.description || '').replace(/\s+/g, ' ').slice(0, 80);
    process.stdout.write(`├── ${h.name}${ver} ${desc}\n`);
    process.stdout.write(`│     (${stats})\n`);
  }
  return 0;
}

module.exports = { searchCommand };
