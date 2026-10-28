'use strict';

const assert = require('assert');
const path = require('path');
const { describe, it } = require('node:test');

const {
  relativizeSource,
  normalizeText,
  formatLicense,
  isBuildToolPackage
} = require('../lib/get-license-text')._test;

describe('get-license-text helpers', () => {
  it('relativizes absolute license paths under the repo root', () => {
    const root = path.resolve('/repo');
    assert.equal(
      relativizeSource(path.join(root, 'node_modules', 'foo', 'LICENSE'), root),
      'node_modules/foo/LICENSE'
    );
    assert.equal(relativizeSource('https://example.com/LICENSE', root), 'https://example.com/LICENSE');
  });

  it('normalizes CRLF and formats license arrays', () => {
    assert.equal(normalizeText('a\r\nb\r\n'), 'a\nb\n');
    assert.equal(formatLicense(['MIT', 'Apache-2.0']), 'MIT OR Apache-2.0');
    assert.equal(formatLicense('MIT'), 'MIT');
  });

  it('treats script/ and cpm/ packages as build tooling', () => {
    const root = path.resolve('/repo');
    assert.equal(
      isBuildToolPackage(path.join(root, 'script', 'node_modules', 'x'), root),
      true
    );
    assert.equal(
      isBuildToolPackage(path.join(root, 'cpm', 'node_modules', 'x'), root),
      true
    );
    assert.equal(
      isBuildToolPackage(path.join(root, 'node_modules', 'x'), root),
      false
    );
  });
});
