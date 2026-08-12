'use strict';

/**
 * Stream E: classify root package.json dependencies.
 */

function classifySpec(spec) {
  if (typeof spec !== 'string') return 'other';
  if (spec.startsWith('file:')) return 'file';
  if (spec.includes('git+') || spec.startsWith('github:')) {
    if (spec.includes('github.com/atom/')) return 'git-atom';
    if (spec.includes('github.com/builtbygio/')) return 'git-builtbygio';
    return 'git-other';
  }
  return 'semver';
}

function summarizeDependencies(pkg) {
  const deps = pkg.dependencies || {};
  const counts = {
    file: 0,
    semver: 0,
    'git-atom': 0,
    'git-builtbygio': 0,
    'git-other': 0,
    other: 0,
    total: 0
  };
  const lists = {
    'git-atom': [],
    'git-builtbygio': [],
    'git-other': []
  };
  for (const [name, spec] of Object.entries(deps)) {
    const kind = classifySpec(spec);
    counts[kind] = (counts[kind] || 0) + 1;
    counts.total += 1;
    if (lists[kind]) lists[kind].push(name);
  }
  return { counts, lists };
}

/** Must not reappear as app dependencies (issue #62). */
const FORBIDDEN_APP_DEPS = ['babel-core', 'coffee-script'];

module.exports = {
  classifySpec,
  summarizeDependencies,
  FORBIDDEN_APP_DEPS
};
