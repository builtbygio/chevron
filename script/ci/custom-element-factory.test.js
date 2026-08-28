'use strict';

/**
 * H1 PR 7: first-party atom-* construction goes through the factory.
 * document-register-element stays (owned pins / etch / React still createElement).
 * Run: node --test script/ci/custom-element-factory.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CREATE_ATOM = /(?<![\w.])document\.createElement\(\s*['"]atom-/;
const SCAN_DIRS = ['src', 'packages'];

function walk(dir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'spec') continue;
      walk(full, acc);
      continue;
    }
    if (!/\.(js|ts)$/.test(entry.name)) continue;
    acc.push(full);
  }
  return acc;
}

function isCodeLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
    return false;
  }
  return true;
}

describe('first-party custom element factory', () => {
  it('does not call document.createElement("atom-") in src/ or packages/', () => {
    const hits = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walk(path.join(ROOT, dir), [])) {
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
          if (!isCodeLine(line)) return;
          if (CREATE_ATOM.test(line)) {
            hits.push(`${path.relative(ROOT, file)}:${i + 1}:${line.trim()}`);
          }
        });
      }
    }
    // Collapsing the 65 npm-published editor packages into packages/ brought
    // them into this scan for the first time — they used to live in
    // node_modules and were invisible here. These three were already shipping;
    // they work because document-register-element is deliberately kept. Listed
    // so the guard still fails on anything new.
    const KNOWN = [
      'packages/markdown-preview/lib/markdown-preview-view.ts',
      'packages/notifications/lib/main.ts',
      'packages/notifications/lib/notification-element.ts'
    ];
    const unexpected = hits.filter(
      h => !KNOWN.some(k => h.startsWith(k + ':'))
    );
    assert.deepStrictEqual(unexpected, []);
    assert.ok(
      hits.length <= KNOWN.length,
      `known createElement('atom-*') sites grew to ${hits.length}`
    );
  });

  it('keeps document-register-element (polyfill not deleted)', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    );
    assert.ok(
      pkg.dependencies['document-register-element'],
      'document-register-element must stay until catalog CE coverage (PR 7b)'
    );
    const boot = fs.readFileSync(path.join(ROOT, 'static', 'index.js'), 'utf8');
    assert.ok(
      boot.includes("require('document-register-element')"),
      'static/index.js must still load the polyfill'
    );
  });
});
