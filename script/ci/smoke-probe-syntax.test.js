'use strict';

/**
 * The smoke test's probe expressions have to parse as the app receives them.
 *
 * They are written as template literals in Node and evaluated in the renderer
 * over CDP, so the file is one level of escaping away from what actually runs:
 * a `\n` written inside the template arrives as a real newline, and inside a
 * string literal that is a syntax error. Nothing reports it. `Runtime.evaluate`
 * returns no value, the probe never sets its result, and the smoke test says
 * "probe did not report" — which reads like a timeout and sends you looking at
 * the wrong thing entirely.
 *
 * So: evaluate each template the way Node will, and parse the result.
 *
 * Run: node --test script/ci/smoke-probe-syntax.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SMOKE = path.resolve(__dirname, 'smoke-test.js');

// Probes may interpolate a Node-side constant. The value is not what this
// test is about, so stand a number in its place and check the escaping.
function withoutInterpolation(body) {
  return body.replace(/\$\{[^}]*\}/g, '0');
}

function probeExpressions(source) {
  const found = [];
  const declaration = /const ([A-Z0-9_]*EXPR) = `/g;
  let match;
  while ((match = declaration.exec(source)) !== null) {
    const start = declaration.lastIndex;
    // The first unescaped backtick ends the literal.
    let end = start;
    while (end < source.length) {
      if (source[end] === '`' && source[end - 1] !== '\\') break;
      end++;
    }
    assert.notStrictEqual(end, source.length, `${match[1]} is unterminated`);
    found.push({ name: match[1], body: source.slice(start, end) });
    declaration.lastIndex = end;
  }
  return found;
}

describe('smoke probe expressions', () => {
  const source = fs.readFileSync(SMOKE, 'utf8');
  const probes = probeExpressions(source);

  it('finds the probes', () => {
    assert.ok(
      probes.length >= 3,
      `expected several probe expressions, found ${probes.length}`
    );
  });

  for (const probe of probes) {
    it(`${probe.name} parses as the renderer receives it`, () => {
      // eval of the template applies the same escape processing Node does
      // when building the string it sends over CDP.
      let runtime;
      try {
        runtime = eval('`' + withoutInterpolation(probe.body) + '`'); // eslint-disable-line no-eval
      } catch (error) {
        assert.fail(`${probe.name}: template itself is invalid — ${error.message}`);
      }

      try {
        new Function(`return ${runtime}`); // eslint-disable-line no-new-func
      } catch (error) {
        assert.fail(
          `${probe.name} does not parse once the template is evaluated: ` +
            `${error.message}. A literal escape sequence in the template is ` +
            'the usual cause — write it so the renderer receives the escape, ' +
            'not the character.'
        );
      }
    });

    it(`${probe.name} returns a string the harness can parse`, () => {
      // Every probe reports by returning JSON; one that returns an object
      // gives `[object Object]` and fails a mile from the cause.
      assert.match(
        probe.body,
        /return JSON\.stringify\(/,
        `${probe.name} should report with JSON.stringify`
      );
    });
  }
});
