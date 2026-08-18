'use strict';

/**
 * H3 PR 23: no CoffeeScript in owned packages, except test fixtures.
 * Run: node --test script/ci/no-coffee.test.js
 *
 * Nothing compiles CoffeeScript since PR 11 removed the compilers, so a
 * `.coffee` file here is not "legacy but working" — it is dead weight, and a
 * `-spec.coffee` actively throws when the Jasmine runner require()s it.
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Fixtures are CoffeeScript *source as test data* — autosave and bookmarks
 * open them to exercise editor behaviour. Converting them would break the
 * tests they serve, so they are expected to stay.
 */
const ALLOWED = /\/spec\/fixtures\//;

function findCoffee(dir) {
  try {
    const out = cp
      .execSync(
        `find ${dir} -name '*.coffee' -not -path '*/node_modules/*' 2>/dev/null`,
        { encoding: 'utf8' }
      )
      .trim();
    return out ? out.split('\n') : [];
  } catch (_) {
    return [];
  }
}

describe('no CoffeeScript in owned packages (PR 23)', () => {
  it('in-repo packages ship no CoffeeScript', () => {
    const hits = findCoffee(path.join(ROOT, 'packages')).filter(
      f => !ALLOWED.test(f)
    );
    assert.deepStrictEqual(hits, [], `CoffeeScript in packages/:\n${hits.join('\n')}`);
  });

  it('owned pins ship no CoffeeScript outside spec fixtures', () => {
    const deps =
      JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
        .dependencies || {};
    const hits = [];
    for (const [name, spec] of Object.entries(deps)) {
      if (!/builtbygio/.test(String(spec))) continue;
      const root = path.join(ROOT, 'node_modules', name);
      if (!fs.existsSync(root)) continue;
      if (fs.lstatSync(root).isSymbolicLink()) continue;
      for (const f of findCoffee(root)) {
        if (!ALLOWED.test(f)) hits.push(path.relative(ROOT, f));
      }
    }
    assert.deepStrictEqual(hits, [], `CoffeeScript in owned pins:\n${hits.join('\n')}`);
  });

  it('the Jasmine runner collects .ts specs', () => {
    const runner = fs.readFileSync(
      path.join(ROOT, 'spec/jasmine-test-runner.js'),
      'utf8'
    );
    assert.match(runner, /-spec\\\.\(coffee\|js\|ts\)/);
  });
});
