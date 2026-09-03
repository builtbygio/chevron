'use strict';

/**
 * The window unload path stops filesystem watchers before the window goes.
 *
 * nsfw finishes a stop on a worker thread and then calls back into JS. With
 * no Node environment left to call into, the renderer aborts:
 *
 *   node::InternalMakeCallback ... Assertion failed: (env) != nullptr
 *
 * Project#destroy disposes its watchers from `beforeunload`, which cannot
 * await, so every window reload raced that callback. The smoke test now
 * reloads a real window (script/ci/smoke-test.js); this is the cheap guard
 * that the await is still there.
 *
 * Run: node --test script/ci/reload-watcher-shutdown.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ENVIRONMENT = path.join(ROOT, 'src', 'atom-environment.js');
const SMOKE = path.join(ROOT, 'script', 'ci', 'smoke-test.js');

const source = fs.readFileSync(ENVIRONMENT, 'utf8');

function methodBody(text, name) {
  const start = text.indexOf(`${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found in atom-environment.js`);
  let depth = 0;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`could not read the body of ${name}`);
}

describe('reload watcher shutdown', () => {
  it('imports the watcher shutdown', () => {
    assert.match(source, /stopAllWatchers.*require\('\.\/path-watcher'\)/);
  });

  it('awaits it while unloading', () => {
    const body = methodBody(source, 'async prepareToUnloadEditorWindow');
    assert.match(
      body,
      /await this\.stopFileSystemWatchers\(\)/,
      'prepareToUnloadEditorWindow must await the watcher shutdown; without ' +
        'it nsfw calls back into a destroyed Node environment and the ' +
        'renderer aborts on reload'
    );
  });

  it('waits for the watchers themselves', () => {
    const body = methodBody(source, 'async stopFileSystemWatchers');
    assert.match(body, /await stopAllWatchers\(\)/);
  });

  it('is covered by a real reload in the smoke test', () => {
    const smoke = fs.readFileSync(SMOKE, 'utf8');
    assert.match(smoke, /assertReloadSurvives/);
    assert.match(smoke, /chevron\.reload\(\)/);
  });
});
