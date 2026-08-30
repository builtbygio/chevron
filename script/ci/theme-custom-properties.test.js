'use strict';

/**
 * Every theme publishes the same set of CSS custom properties.
 *
 * Package stylesheets read var(--name) instead of @name. If one theme stops
 * emitting a property, every rule that reads it silently falls back to the
 * inherited value or drops -- there is no error, and the only symptom is a
 * subtly wrong colour under that theme. The 16x LESS matrix used to make this
 * impossible by construction; custom properties do not, so it is asserted.
 *
 * Run: node --test script/ci/theme-custom-properties.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function declaredIn(file) {
  const names = [];
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/^\s*@([a-zA-Z][a-zA-Z0-9-]*)\s*:/gm)) {
    names.push(m[1]);
  }
  return names;
}

// The variables a theme overrides are the ones that must become properties.
function overriddenVariables() {
  const base = new Set([
    ...declaredIn(path.join(ROOT, 'static', 'variables', 'ui-variables.less')),
    ...declaredIn(
      path.join(ROOT, 'static', 'variables', 'syntax-variables.less')
    )
  ]);
  const overridden = new Set();
  for (const theme of themeDirs()) {
    const dir = path.join(ROOT, 'packages', theme, 'styles');
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.less') || entry === 'custom-properties.less') {
        continue;
      }
      for (const name of declaredIn(path.join(dir, entry))) {
        if (base.has(name)) overridden.add(name);
      }
    }
  }
  return overridden;
}

// Themes are identified by their `theme` field, not their name: `lsp-ui` ends
// in -ui and is an ordinary package.
function themeDirs() {
  return fs.readdirSync(path.join(ROOT, 'packages')).filter(d => {
    const manifest = path.join(ROOT, 'packages', d, 'package.json');
    if (!fs.existsSync(manifest)) return false;
    const theme = JSON.parse(fs.readFileSync(manifest, 'utf8')).theme;
    return theme === 'ui' || theme === 'syntax';
  });
}

function themeKind(theme) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, 'packages', theme, 'package.json'), 'utf8')
  ).theme;
}

function emittedProperties(theme) {
  const file = path.join(
    ROOT,
    'packages',
    theme,
    'styles',
    'custom-properties.less'
  );
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  return new Set(
    [...src.matchAll(/^\s*--([a-zA-Z][a-zA-Z0-9-]*)\s*:/gm)].map(m => m[1])
  );
}

describe('theme custom properties', () => {
  it('every theme ships a custom-properties.less', () => {
    for (const theme of themeDirs()) {
      assert.ok(
        emittedProperties(theme),
        `packages/${theme}/styles/custom-properties.less is missing`
      );
    }
  });

  it('every theme imports it from its entry stylesheet', () => {
    for (const theme of themeDirs()) {
      const index = path.join(ROOT, 'packages', theme, 'index.less');
      assert.ok(fs.existsSync(index), `packages/${theme}/index.less is missing`);
      const src = fs.readFileSync(index, 'utf8');
      assert.ok(
        src.includes('styles/custom-properties.less'),
        `${theme}/index.less does not import custom-properties.less, so the ` +
          ':root block never reaches the document'
      );
    }
  });

  it('UI and syntax themes each emit their full variable set', () => {
    const overridden = overriddenVariables();
    for (const theme of themeDirs()) {
      const emitted = emittedProperties(theme);
      if (!emitted) continue;
      const kind = themeKind(theme);
      const expected = [...overridden].filter(v =>
        kind === 'syntax' ? v.startsWith('syntax-') : !v.startsWith('syntax-')
      );
      for (const name of expected) {
        assert.ok(
          emitted.has(name),
          `${theme} does not emit --${name}; stylesheets reading it would ` +
            'silently fall back under this theme'
        );
      }
    }
  });

  it('all themes of a kind emit an identical property set', () => {
    for (const kind of ['ui', 'syntax']) {
      const themes = themeDirs().filter(t => themeKind(t) === kind);
      if (themes.length < 2) continue;
      const reference = emittedProperties(themes[0]);
      for (const theme of themes.slice(1)) {
        const emitted = emittedProperties(theme);
        assert.deepEqual(
          [...emitted].sort(),
          [...reference].sort(),
          `${theme} emits a different property set than ${themes[0]}; a theme ` +
            'switch would leave some properties undefined'
        );
      }
    }
  });
});
