'use strict';

/**
 * Every scope a language server declares has to be one a file can actually
 * carry, or the server silently never attaches.
 *
 * docs/reference/lsp-server-distribution.md
 * Run: node --test script/ci/language-server-scopes.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const NULL_GRAMMAR_SCOPE = require(path.join(ROOT, 'src', 'null-grammar')).scopeName;

// Scopes no shipped grammar produces, kept for a community grammar that might.
// Each file they name is already covered under a scope that does exist: .jsx
// as source.js, .mm as source.objc, plain text as the null grammar.
const ALLOWED_WITHOUT_GRAMMAR = new Set([
  'source.jsx',
  'source.js.jsx',
  'source.objcpp',
  'text.plain'
]);

function grammarScopes() {
  const scopes = new Set([NULL_GRAMMAR_SCOPE]);
  for (const pkg of fs.readdirSync(path.join(ROOT, 'packages'))) {
    const dir = path.join(ROOT, 'packages', pkg, 'grammars');
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!/\.(json|cson)$/.test(file)) continue;
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      let scope = null;
      try {
        scope = JSON.parse(source).scopeName;
      } catch (error) {
        const match = source.match(/scopeName\s*[:=]\s*['"]([^'"]+)['"]/);
        scope = match && match[1];
      }
      if (scope) scopes.add(scope);
    }
  }
  return scopes;
}

function declaredServers() {
  const found = [];
  for (const pkg of fs.readdirSync(path.join(ROOT, 'packages'))) {
    const manifest = path.join(ROOT, 'packages', pkg, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    let json;
    try {
      json = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    } catch (error) {
      continue;
    }
    const server = json.chevron && json.chevron.languageServer;
    if (!server) continue;
    found.push({ pkg, id: server.id, scopes: server.scopes || [] });
  }
  return found;
}

test('the grammars and the servers are both found', () => {
  const scopes = grammarScopes();
  const servers = declaredServers();
  assert.ok(scopes.size > 20, `expected the shipped grammars, found ${scopes.size}`);
  assert.ok(servers.length > 3, `expected the lsp packages, found ${servers.length}`);
});

test('every declared scope is one a file can carry', () => {
  const scopes = grammarScopes();
  const unreachable = [];
  for (const server of declaredServers()) {
    for (const scope of server.scopes) {
      if (scopes.has(scope) || ALLOWED_WITHOUT_GRAMMAR.has(scope)) continue;
      unreachable.push(`${server.pkg}: ${scope}`);
    }
  }
  assert.deepEqual(
    unreachable,
    [],
    'No shipped grammar produces these, so the server never attaches:\n' +
      unreachable.join('\n')
  );
});

test('the prose server covers plain text', () => {
  // A .txt file has no grammar, so it carries the null grammar scope rather
  // than text.plain, which nothing produces.
  const prose = declaredServers().find(s => s.id === 'harper-ls');
  assert.ok(prose, 'the prose server is declared');
  assert.ok(
    prose.scopes.includes(NULL_GRAMMAR_SCOPE),
    `harper-ls must declare ${NULL_GRAMMAR_SCOPE}, else it never sees a text file`
  );
});
