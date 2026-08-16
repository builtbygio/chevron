'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findPackagedApp } = require('../lib/find-packaged-app');

function makeOut() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'chevron-find-app-'));
}

function touch(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '');
}

test('linux prefers Chevron-linux-<arch>/chevron over atom-*', () => {
  const out = makeOut();
  touch(path.join(out, 'atom-linux-x64', 'atom'));
  touch(path.join(out, 'Chevron-linux-x64', 'chevron'));
  assert.equal(
    findPackagedApp({ outDir: out, platform: 'linux', arch: 'x64' }),
    path.join(out, 'Chevron-linux-x64', 'chevron')
  );
});

test('linux picks matching arch when two Chevron dirs exist', () => {
  const out = makeOut();
  touch(path.join(out, 'Chevron-linux-x64', 'chevron'));
  touch(path.join(out, 'Chevron-linux-arm64', 'chevron'));
  assert.equal(
    findPackagedApp({ outDir: out, platform: 'linux', arch: 'arm64' }),
    path.join(out, 'Chevron-linux-arm64', 'chevron')
  );
});

test('linux falls back to atom-* when no Chevron dir', () => {
  const out = makeOut();
  touch(path.join(out, 'atom-linux-x64', 'atom'));
  assert.equal(
    findPackagedApp({ outDir: out, platform: 'linux', arch: 'x64' }),
    path.join(out, 'atom-linux-x64', 'atom')
  );
});

test('darwin prefers Chevron.app', () => {
  const out = makeOut();
  touch(path.join(out, 'Atom.app', 'Contents', 'MacOS', 'Atom'));
  touch(path.join(out, 'Chevron.app', 'Contents', 'MacOS', 'Chevron'));
  assert.equal(
    findPackagedApp({
      outDir: out,
      platform: 'darwin',
      appName: 'Chevron'
    }),
    path.join(out, 'Chevron.app', 'Contents', 'MacOS', 'Chevron')
  );
});

test('win32 finds Chevron x64/chevron.exe', () => {
  const out = makeOut();
  touch(path.join(out, 'Atom x64', 'atom.exe'));
  touch(path.join(out, 'Chevron x64', 'chevron.exe'));
  assert.equal(
    findPackagedApp({
      outDir: out,
      platform: 'win32',
      arch: 'x64',
      executableName: 'chevron.exe'
    }),
    path.join(out, 'Chevron x64', 'chevron.exe')
  );
});

test('measure-startup locates apps via find-packaged-app (win32 is Chevron x64, not -win32-)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, 'measure-startup.js'),
    'utf8'
  );
  assert.match(src, /require\('\.\.\/lib\/find-packaged-app'\)/);
  assert.doesNotMatch(src, /includes\('-win32-'\)/);
});

test('returns null when out/ is empty', () => {
  const out = makeOut();
  assert.equal(
    findPackagedApp({ outDir: out, platform: 'linux', arch: 'x64' }),
    null
  );
});
