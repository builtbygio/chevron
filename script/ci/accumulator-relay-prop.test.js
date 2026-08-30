'use strict';

/**
 * Every live Accumulator render site supplies a `relay` prop.
 *
 * github/lib/containers/accumulators/accumulator.js renders with
 *
 *   this.props.children(error, resultBatch, this.props.relay.hasMore())
 *
 * unconditionally. Relay's createPaginationContainer used to inject that prop;
 * the migration to graphql-client replaced it with the first-page-only
 * stand-in in relay-stub.js. Any render site that forgets it throws
 *
 *   Cannot read properties of undefined (reading 'hasMore')
 *
 * at render time -- not at load time, so requiring the module proves nothing
 * and the smoke test never opens the GitHub tab. issueish-list-view shipped
 * without it and crashed on every item in the issueish list.
 *
 * Run: node --test script/ci/accumulator-relay-prop.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LIB = path.join(ROOT, 'packages', 'github', 'lib');
const ACCUMULATOR_DIR = path.join(LIB, 'containers', 'accumulators');

function jsFilesUnder(dir) {
  const out = [];
  const walk = d => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(p);
      } else if (entry.name.endsWith('.js')) {
        out.push(p);
      }
    }
  };
  walk(dir);
  return out;
}

// The accumulator modules, by the identifier each importer binds them to.
function accumulatorNames() {
  return fs
    .readdirSync(ACCUMULATOR_DIR)
    .filter(f => f.endsWith('-accumulator.js') || f === 'accumulator.js')
    .map(f => f.replace(/\.js$/, ''));
}

// Reachability from the package entry point, not "someone imports it".
// aggregated-reviews-container.js still renders two accumulators without a
// relay prop, but nothing imports it -- aggregated-reviews-json.js replaced
// it. Asserting runtime behaviour against unreachable code is a false
// positive, so walk the require graph from `main` instead.
function reachableModules() {
  const entry = require.resolve(
    path.join(ROOT, 'packages', 'github', require(
      path.join(ROOT, 'packages', 'github', 'package.json')
    ).main)
  );
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let src;
    try {
      src = fs.readFileSync(file, 'utf8');
    } catch (e) {
      continue;
    }
    for (const m of src.matchAll(/require\((['"])(\.[^'"]+)\1\)/g)) {
      let target;
      try {
        target = require.resolve(path.resolve(path.dirname(file), m[2]));
      } catch (e) {
        continue;
      }
      if (target.startsWith(LIB) && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

function liveAccumulators() {
  const live = new Map();
  const reachable = reachableModules();
  for (const name of accumulatorNames()) {
    const importers = [...reachable].filter(
      f =>
        path.dirname(f) !== ACCUMULATOR_DIR &&
        fs.readFileSync(f, 'utf8').includes(`accumulators/${name}`)
    );
    if (importers.length) live.set(name, importers);
  }
  return live;
}

// Babel output binds `require(...)` to a _camelCase identifier, then renders
// via _react.default.createElement(_thatIdentifier.default, { ...props }).
function rendersWithoutRelay(source, binding) {
  const marker = `createElement(${binding}.default, {`;
  const problems = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) break;
    const open = at + marker.length;
    let depth = 1;
    let i = open;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }
    const props = source.slice(open, i - 1);
    if (!/(^|[\s,{])relay\s*:/.test(props)) {
      problems.push(source.slice(at, at + 80).split('\n')[0]);
    }
    from = i;
  }
  return problems;
}

function bindingFor(source, name) {
  const m = source.match(
    new RegExp(`var (_[A-Za-z0-9]+) = [^;]*accumulators/${name}`)
  );
  return m ? m[1] : null;
}

describe('accumulator relay prop', () => {
  it('the live accumulator renders with the stub and throws without it', () => {
    // The static checks below cannot see a render-time dereference. This one
    // reproduces the reported crash exactly:
    //   Cannot read properties of undefined (reading 'hasMore')
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const CheckSuites = require(path.join(
      ACCUMULATOR_DIR,
      'check-suites-accumulator.js'
    )).default;
    const { createRelayStub } = require(path.join(LIB, 'relay-stub.js'));

    const commit = {
      checkSuites: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } }
    };
    const render = props =>
      renderToStaticMarkup(
        React.createElement(CheckSuites, props, () =>
          React.createElement('div', null, 'ok')
        )
      );

    render({ commit, relay: createRelayStub() });

    assert.throws(
      () => render({ commit }),
      /hasMore/,
      'Accumulator no longer throws without a relay prop -- if it now defaults ' +
        'one internally, this test and the static check below are both obsolete'
    );
  });

  it('accumulator.js still requires the prop it dereferences', () => {
    const src = fs.readFileSync(path.join(ACCUMULATOR_DIR, 'accumulator.js'), 'utf8');
    assert.ok(
      src.includes('this.props.relay.hasMore()'),
      'accumulator.js no longer dereferences props.relay -- if it now guards ' +
        'against a missing relay, delete this test rather than weakening it'
    );
  });

  it('every live render site passes relay', () => {
    const failures = [];
    for (const [name, importers] of liveAccumulators()) {
      for (const importer of importers) {
        const src = fs.readFileSync(importer, 'utf8');
        const binding = bindingFor(src, name);
        if (!binding) continue;
        for (const problem of rendersWithoutRelay(src, binding)) {
          failures.push(
            `${path.relative(ROOT, importer)} renders ${name} without a ` +
              `relay prop: ${problem}`
          );
        }
      }
    }
    assert.deepEqual(
      failures,
      [],
      'Accumulator dereferences props.relay at render time:\n  ' +
        failures.join('\n  ')
    );
  });
});
