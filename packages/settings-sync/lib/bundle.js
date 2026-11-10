'use strict';

/**
 * A settings bundle is the user's config, keymap, snippets, stylesheet and
 * init file, plus the names of community packages. Secrets stay out of it.
 */

const JSON_FILES = ['config.json', 'keymap.json', 'snippets.json'];
const TEXT_FILES = ['styles.less', 'init.js'];
const FILES = JSON_FILES.concat(TEXT_FILES);
const SECRET = /token|password|secret|private[-_]?key|authorization|credential/i;

function scrub(value, key) {
  if (key && SECRET.test(key)) return undefined;
  if (Array.isArray(value)) {
    return value.map(item => scrub(item, key)).filter(item => item !== undefined);
  }
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [childKey, child] of Object.entries(value)) {
    if (SECRET.test(childKey)) continue;
    const next = scrub(child, childKey);
    if (next !== undefined) out[childKey] = next;
  }
  return out;
}

function buildBundle({ files = {}, packages = [] } = {}) {
  const stored = {};
  for (const name of FILES) {
    if (files[name] == null) continue;
    if (JSON_FILES.includes(name)) {
      const parsed = typeof files[name] === 'string' ? JSON.parse(files[name]) : files[name];
      stored[name] = scrub(parsed, name);
    } else {
      stored[name] = String(files[name]);
    }
  }
  const names = [...new Set(packages.filter(name => typeof name === 'string' && name))]
    .sort();
  return {
    version: 1,
    files: stored,
    packages: names
  };
}

function serializeBundle(bundle) {
  return JSON.stringify(bundle, null, 2) + '\n';
}

function parseBundle(text) {
  const data = JSON.parse(text);
  if (!data || data.version !== 1 || !data.files || typeof data.files !== 'object') {
    throw new Error('Settings bundle is not a version 1 bundle');
  }
  const files = {};
  for (const name of FILES) {
    if (data.files[name] == null) continue;
    if (JSON_FILES.includes(name)) {
      if (!data.files[name] || typeof data.files[name] !== 'object') {
        throw new Error(`${name} must be an object`);
      }
      files[name] = scrub(data.files[name], name);
    } else if (typeof data.files[name] === 'string') {
      files[name] = data.files[name];
    }
  }
  const packages = Array.isArray(data.packages)
    ? data.packages.filter(name => typeof name === 'string' && name && !name.includes('/') && !name.includes('\\'))
    : [];
  return { version: 1, files, packages };
}

module.exports = {
  FILES,
  JSON_FILES,
  scrub,
  buildBundle,
  serializeBundle,
  parseBundle
};
