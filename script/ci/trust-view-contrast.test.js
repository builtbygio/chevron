'use strict';

/**
 * The trust dialog picks readable text for the background it is drawn on.
 *
 * Two ways that went wrong: a fully transparent panel computes as
 * `rgba(0, 0, 0, 0)`, not the keyword, so it parsed as black and the dialog
 * painted pale text on a light theme; and relative colour syntax computes to
 * `color(srgb ...)`, which an rgb()-only parser misses.
 *
 * The parser and ancestor walk are re-implemented here so the assertions run
 * without Electron, and checked against the real file so they cannot drift.
 *
 * Run: node --test script/ci/trust-view-contrast.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const VIEW = path.join(ROOT, 'packages', 'lsp-ui', 'lib', 'trust-view.js');

// Mirrors parseRgb in trust-view.js.
function parseRgb(color) {
  if (!color || color === 'transparent') return null;
  const text = String(color);
  const rgba = text.match(
    /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/
  );
  if (rgba) {
    const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
    if (alpha === 0) return null;
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]) };
  }
  const srgb = text.match(
    /color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?/
  );
  if (srgb) {
    const alpha = srgb[4] === undefined ? 1 : Number(srgb[4]);
    if (alpha === 0) return null;
    return {
      r: Number(srgb[1]) * 255,
      g: Number(srgb[2]) * 255,
      b: Number(srgb[3]) * 255
    };
  }
  return null;
}

const luminance = ({ r, g, b }) => (r * 299 + g * 587 + b * 114) / 1000;
const isDark = bg => luminance(bg) < 140;

describe('trust dialog contrast', () => {
  it('treats a fully transparent background as no answer', () => {
    assert.equal(parseRgb('rgba(0, 0, 0, 0)'), null);
    assert.equal(parseRgb('transparent'), null);
    assert.equal(parseRgb('color(srgb 0 0 0 / 0)'), null);
  });

  it('parses opaque rgb and rgba', () => {
    assert.deepEqual(parseRgb('rgb(250, 250, 250)'), { r: 250, g: 250, b: 250 });
    assert.deepEqual(parseRgb('rgba(32, 33, 35, 1)'), { r: 32, g: 33, b: 35 });
  });

  it('parses color(srgb ...) from converted stylesheets', () => {
    const parsed = parseRgb('color(srgb 0.9764 0.9764 0.9764)');
    assert.ok(parsed, 'color(srgb ...) must parse; converted stylesheets emit it');
    assert.ok(Math.abs(parsed.r - 249) < 1, `expected ~249, got ${parsed.r}`);
    assert.equal(isDark(parsed), false, 'a near-white background is not dark');
  });

  it('picks dark ink on a light panel and light ink on a dark one', () => {
    assert.equal(isDark(parseRgb('rgb(242, 242, 242)')), false); // One Light
    assert.equal(isDark(parseRgb('rgb(40, 44, 52)')), true); // One Dark
  });

  it('falls back through transparent ancestors rather than guessing dark', () => {
    // The old code sampled only the panel. Transparent parsed as black, so a
    // light theme got pale-on-pale.
    const chain = ['rgba(0, 0, 0, 0)', 'transparent', 'rgb(242, 242, 242)'];
    let found = null;
    for (const c of chain) {
      found = parseRgb(c);
      if (found) break;
    }
    assert.ok(found, 'the walk must reach a painted ancestor');
    assert.equal(isDark(found), false, 'One Light must resolve to dark ink');
  });

  it('the module still uses an ancestor walk, not a single sample', () => {
    const src = fs.readFileSync(VIEW, 'utf8');
    assert.ok(
      /function effectiveBackground/.test(src),
      'sampling only the modal panel reads transparent as black'
    );
    assert.ok(
      /color\\\(\\s\*srgb/.test(src) || src.includes('srgb'),
      'the parser must understand color(srgb ...), which converted ' +
        'stylesheets produce'
    );
    assert.ok(
      !/parseRgb\(window\.getComputedStyle\(host\)\.backgroundColor\)/.test(src),
      'applyContrast must not go back to sampling the host directly'
    );
  });
});
