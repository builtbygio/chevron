'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  packageNeedsNative,
  hasNativeBinary,
  expandPrebuildTemplate,
  tryPrebuilds
} = require('../lib/prebuild');

describe('cpm prebuild helpers', () => {
  it('expandPrebuildTemplate substitutes tokens', () => {
    const url = expandPrebuildTemplate(
      'https://example.com/{name}-v{version}-{platform}-{arch}-e{electron}-abi{abi}.node',
      {
        name: 'foo',
        version: '1.2.3',
        platform: 'darwin',
        arch: 'arm64',
        electron: '43.1.0',
        abi: '123'
      }
    );
    assert.strictEqual(
      url,
      'https://example.com/foo-v1.2.3-darwin-arm64-e43.1.0-abi123.node'
    );
  });

  it('packageNeedsNative detects binding.gyp', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-pre-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' })
    );
    assert.strictEqual(packageNeedsNative(tmp), false);
    fs.writeFileSync(path.join(tmp, 'binding.gyp'), '{}');
    assert.strictEqual(packageNeedsNative(tmp), true);
  });

  it('tryPrebuilds skips pure JS packages', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-pre-js-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'pure', version: '1.0.0' })
    );
    const r = await tryPrebuilds(tmp, { electronVersion: '43.1.0' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.strategy, 'no-native');
  });

  it('tryPrebuilds reports missing strategies for native without assets', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-pre-nat-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'nat', version: '1.0.0' })
    );
    fs.writeFileSync(path.join(tmp, 'binding.gyp'), '{"targets":[]}');
    const r = await tryPrebuilds(tmp, { electronVersion: '43.1.0' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.reason);
  });

  it('hasNativeBinary finds .node files', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-pre-bin-'));
    const rel = path.join(tmp, 'build', 'Release');
    fs.mkdirSync(rel, { recursive: true });
    fs.writeFileSync(path.join(rel, 'x.node'), Buffer.from([0]));
    assert.strictEqual(hasNativeBinary(tmp), true);
  });
});
