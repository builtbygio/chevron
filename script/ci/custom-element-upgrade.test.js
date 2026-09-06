'use strict';

/**
 * Core elements must not wait for connectedCallback to become usable.
 *
 * static/index.js loads the document-register-element polyfill, because under
 * contextIsolation a native customElements.define() in the preload realm does
 * not upgrade parser-created nodes. The polyfill does upgrade them -- but its
 * upgrade is asynchronous, on a timer it captured at load. Measured in the
 * spec runner:
 *
 *   default (mocked) clock : class ""           isHorizontal undefined
 *   real clock, after 300ms: class "horizontal" isHorizontal true
 *
 * The spec suite mocks setTimeout, and advanceClock cannot drive a timer the
 * polyfill captured before the spy, so connectedCallback had not run for any
 * core element by the time a spec asserted. That is one cause behind a cluster
 * of nightly failures: pane-container-element-spec alone lost 19 assertions,
 * because an unset `isHorizontal` sent a row resize down the vertical branch
 * and divided by a zero height.
 *
 * The fix is the pattern text-editor-element.js already documents: whatever an
 * element needs has to be reachable from initialize(), idempotently, rather
 * than only from a callback that may not have run. pane-axis-element set its
 * orientation classes that way already.
 *
 * Run: node --test script/ci/custom-element-upgrade.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');

// The method definition, not the constructor line that binds it. Start the
// brace scan after the parameter list, or a destructured parameter --
// resizePane({ clientX }) -- is mistaken for the body.
function bodyOf(source, signature) {
  const name = signature.replace('(', '');
  const match = new RegExp(`^  ${name}\\(`, 'm').exec(source);
  assert.ok(match, `${signature} not found as a method`);

  let i = source.indexOf('(', match.index);
  let parens = 0;
  for (; i < source.length; i++) {
    if (source[i] === '(') parens++;
    else if (source[i] === ')' && --parens === 0) break;
  }

  let depth = 0;
  const open = source.indexOf('{', i);
  for (let j = open; j < source.length; j++) {
    if (source[j] === '{') depth++;
    else if (source[j] === '}' && --depth === 0) return source.slice(match.index, j + 1);
  }
  throw new Error(`unterminated ${signature}`);
}

describe('the resize handle reads its axis when it drags', () => {
  const source = read('pane-resize-handle-element.js');

  it('does not cache the orientation in connectedCallback', () => {
    assert.doesNotMatch(
      source,
      /this\.isHorizontal\s*=/,
      'a cached orientation is undefined until the polyfill upgrades, and ' +
        'stale if the handle moves between axes'
    );
    assert.match(source, /isHorizontalAxis\(\)\s*\{/);
  });

  it('asks at drag time', () => {
    assert.match(bodyOf(source, 'resizePane('), /this\.isHorizontalAxis\(\)/);
  });

  it('refuses to divide by a zero extent', () => {
    // A pane with no height on the axis being dragged gave 0/0, and NaN in a
    // flex scale is not recoverable downstream.
    const calc = bodyOf(source, 'calcRatio(');
    assert.match(calc, /allRatio === 0/);
    assert.match(bodyOf(source, 'setFlexGrow('), /if \(!flexGrows\) return;/);
  });
});

describe('elements set up what they need in initialize()', () => {
  const cases = [
    ['pane-container-element.js', 'initialize(', /classList\.add\('panes'\)/,
      'the panes class'],
    ['pane-element.js', 'initialize(', /this\.initializeContent\(\)/,
      'the tabindex that lets a pane take focus'],
    ['styles-element.js', 'initialize(', /getAttribute\('context'\)/,
      'the context attribute it filters on']
  ];

  for (const [file, signature, pattern, what] of cases) {
    it(`${file} sets ${what} without waiting for a callback`, () => {
      assert.match(bodyOf(read(file), signature), pattern);
    });
  }

  it('pane-axis-element still shows the pattern it set', () => {
    // The precedent: orientation classes have always been set here.
    assert.match(bodyOf(read('pane-axis-element.js'), 'initialize('), /classList\.add\(/);
  });
});
