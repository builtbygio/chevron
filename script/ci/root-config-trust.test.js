'use strict';

/**
 * Per-root config: what reads it, how trust reaches it, and how a person
 * finds out where a value came from.
 *
 * The precedence and trust rules themselves are a matrix in
 * config-precedence.test.js. This covers the wiring around them, which the
 * matrix cannot see: packages that pass `root`, the trust broadcast from the
 * main process, and the settings-source report.
 *
 * docs/reference/config-precedence.md
 * Run: node --test script/ci/root-config-trust.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const typescript = require(path.join(ROOT, 'src', 'typescript'));
const Config = require(path.join(ROOT, 'src', 'config'));

function loadTs(relative) {
  const file = path.join(ROOT, relative);
  const compiled = typescript.compile(fs.readFileSync(file, 'utf8'), file);
  const module = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(module, module.exports, require);
  return module.exports;
}

const { collectSettingsSources, formatSettingsSources } = loadTs(
  'src/settings-source-report.ts'
);

const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

const REPO = path.join(path.sep, 'repo', 'a');
const FILE = path.join(REPO, 'src', 'index.js');
const CONFIG_FILE = path.join(REPO, '.chevron', 'config.json');

function makeConfig() {
  const config = new Config({ saveCallback() {} });
  config.settingsLoaded = true;
  config.setSchema('editor', {
    type: 'object',
    properties: {
      tabLength: { type: 'integer', default: 8 },
      softWrap: { type: 'boolean', default: false }
    }
  });
  config.setSchema('whitespace', {
    type: 'object',
    properties: { removeTrailingWhitespace: { type: 'boolean', default: true } }
  });
  config.setSchema('lsp', {
    type: 'object',
    properties: {
      formatOnSave: { type: 'boolean', default: false },
      servers: { type: 'object', default: {} }
    }
  });
  return config;
}

describe('the settings-source report', () => {
  it('names the source of every setting that shapes the file', () => {
    const config = makeConfig();
    config.set('editor.softWrap', true);
    config.setRootSettings(REPO, { editor: { tabLength: 2 } }, CONFIG_FILE);

    const report = collectSettingsSources(config, { filePath: FILE });
    const row = key => report.rows.find(r => r.keyPath === key);
    assert.strictEqual(report.root, REPO);
    assert.strictEqual(report.rootConfig, CONFIG_FILE);
    assert.deepStrictEqual(
      [row('editor.tabLength').value, row('editor.tabLength').source],
      [2, 'root']
    );
    assert.deepStrictEqual(
      [row('editor.softWrap').value, row('editor.softWrap').source],
      [true, 'user']
    );
    assert.strictEqual(row('whitespace.removeTrailingWhitespace').source, 'default');
  });

  it('lists what an untrusted root holds back, and marks the rows', () => {
    const config = makeConfig();
    config.setRootSettings(
      REPO,
      { lsp: { formatOnSave: true, servers: { x: { command: 'curl' } } } },
      CONFIG_FILE
    );
    const report = collectSettingsSources(config, { filePath: FILE });
    assert.strictEqual(report.trusted, false);
    assert.deepStrictEqual(report.withheld, ['lsp.formatOnSave', 'lsp.servers']);
    const row = report.rows.find(r => r.keyPath === 'lsp.formatOnSave');
    assert.strictEqual(row.value, false);
    assert.strictEqual(row.withheldBy, CONFIG_FILE);

    const text = formatSettingsSources(report);
    assert.match(text, /Project trusted: no/);
    assert.match(text, /## Waiting for trust/);
    assert.match(text, /`lsp\.servers`/);
    assert.match(text, /waiting for trust\)/);
  });

  it('a trusted root has nothing waiting', () => {
    const config = makeConfig();
    config.setRootTrusted(REPO, true);
    config.setRootSettings(REPO, { lsp: { formatOnSave: true } }, CONFIG_FILE);
    const report = collectSettingsSources(config, { filePath: FILE });
    assert.deepStrictEqual(report.withheld, []);
    assert.strictEqual(report.rows.find(r => r.keyPath === 'lsp.formatOnSave').source, 'root');
    assert.doesNotMatch(formatSettingsSources(report), /Waiting for trust/);
  });

  it('says so for a file outside every root', () => {
    const report = collectSettingsSources(makeConfig(), {
      filePath: path.join(path.sep, 'tmp', 'loose.js')
    });
    assert.strictEqual(report.root, null);
    assert.match(formatSettingsSources(report), /Project config: none/);
  });

  it('is a command', () => {
    const source = read('src', 'register-default-commands.ts');
    assert.match(source, /'config:show-effective-settings'/);
    assert.match(source, /collectSettingsSources\(config/);
  });
});

describe('trust reaches every window', () => {
  it('the main process announces a trust change to all windows', () => {
    const source = read('src', 'main-process', 'register-renderer-ipc.js');
    const handler = source.slice(source.indexOf("ipcMain.handle('lsp:set-trust'"));
    const body = handler.slice(0, handler.indexOf('ipcMain.', 1));
    assert.match(body, /BrowserWindow\.getAllWindows\(\)/);
    assert.match(body, /'chevron:did-change-project-trust'/);
  });

  it('the renderer listens on the same channel and asks the same store', () => {
    const delegate = read('src', 'application-delegate.js');
    assert.match(delegate, /ipcRenderer\.on\('chevron:did-change-project-trust'/);
    assert.match(delegate, /invoke\('lsp:is-trusted'/);
  });

  it('the project re-asks on a change and after loading root config', () => {
    const project = read('src', 'project.js');
    assert.match(project, /onDidChangeProjectTrust\(\(\) => this\.syncRootTrust\(\)\)/);
    const sync = project.slice(project.indexOf('  syncRootConfigs() {'));
    assert.match(sync.slice(0, sync.indexOf('\n  }\n')), /this\.syncRootTrust\(\)/);
  });

  it('the trust commands act on the active file\'s root', () => {
    const lsp = read('src', 'lsp', 'index.js');
    for (const command of ['chevron-lsp:trust-project', 'chevron-lsp:untrust-project']) {
      const body = lsp.slice(lsp.indexOf(`'${command}'`));
      assert.match(body.slice(0, 200), /commandProjectRoot\(env\)/, command);
    }
    assert.match(lsp, /relativizePath\(filePath\)/);
  });
});

describe('packages read root config', () => {
  it('whitespace passes root on every read', () => {
    const source = read('packages', 'whitespace', 'lib', 'whitespace.js');
    const calls = source.match(/chevron\.config\.get\([^)]*\)/gs) || [];
    assert.ok(calls.length >= 6, `found ${calls.length} config reads`);
    for (const call of calls) {
      assert.match(call, /\broot\b/, `no root: ${call.replace(/\s+/g, ' ')}`);
    }
  });

  it('format-on-save passes the editor\'s path as root', () => {
    const source = read('src', 'lsp', 'index.js');
    assert.match(source, /config\.get\('lsp\.formatOnSave', \{ root \}\)/);
    assert.match(source, /isFormatOnSaveEnabled\(editor\)/);
  });
});
