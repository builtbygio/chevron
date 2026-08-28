'use strict';

/**
 * Every `CONFIG.<field>` used under script/ must actually be exported by
 * script/config.js.
 *
 * This exists because removing the apm tree deleted `CONFIG.apmRootPath` while
 * `script/lib/clean-dependencies.js` still used it, so `path.join(undefined,
 * 'node_modules')` threw. It survived local testing because bootstrap only
 * calls that code when the dependencies fingerprint is outdated — false on a
 * warm tree, true on CI's fresh checkout. A grep had already missed the
 * reference, so nothing caught it until three platforms went red.
 *
 * Run: node --test script/ci/config-contract.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function scriptFiles() {
  const out = [];
  const walk = dir => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      // Skip this file: its own comments name the retired fields.
      else if (ent.name.endsWith('.js') && full !== __filename) out.push(full);
    }
  };
  walk(path.join(ROOT, 'script'));
  return out;
}

describe('script/config.js contract', () => {
  const CONFIG = require(path.join(ROOT, 'script', 'config.js'));
  const exported = new Set(Object.keys(CONFIG));

  it('exports a plausible config', () => {
    assert.ok(exported.size >= 15, `only ${exported.size} exports`);
    for (const key of ['repositoryRootPath', 'scriptRootPath', 'appMetadata']) {
      assert.ok(exported.has(key), `config.js must export ${key}`);
    }
  });

  it('no script references a CONFIG field that does not exist', () => {
    const bad = new Set();
    for (const file of scriptFiles()) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\bCONFIG\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        if (!exported.has(m[1])) {
          bad.add(`${path.relative(ROOT, file)}: CONFIG.${m[1]}`);
        }
      }
    }
    assert.deepStrictEqual(
      [...bad],
      [],
      `these would be undefined at run time: ${[...bad].join(', ')}`
    );
  });

  it('the retired apm fields are gone and stay gone', () => {
    for (const key of ['apmRootPath', 'apmMetadata', 'getApmBinPath']) {
      assert.ok(!exported.has(key), `${key} was retired with the apm tree`);
    }
  });
});
