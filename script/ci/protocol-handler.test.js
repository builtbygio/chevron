'use strict';

/**
 * chevron:// is served through protocol.handle (#417).
 *
 * protocol.registerFileProtocol is deprecated but still present on Electron
 * 43, and the handler used it whenever it existed -- so the protocol.handle
 * branch had never run. The fake electron here offers both, which is the
 * situation that hid it.
 *
 * Run: node --test script/ci/protocol-handler.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { makeTempDir, removeTempDir } = require('../lib/temp-dir');

const ROOT = path.resolve(__dirname, '..', '..');
const FAKE_ELECTRON = path.join(__dirname, '_fake_electron_protocol.js');

function fakeElectron() {
  const electron = {
    handled: [],
    fileProtocols: [],
    fetched: [],
    protocol: {
      handle(scheme, handler) {
        electron.handled.push({ scheme, handler });
      },
      registerFileProtocol(scheme, handler) {
        electron.fileProtocols.push({ scheme, handler });
      }
    },
    net: {
      fetch(url) {
        electron.fetched.push(url);
        return { fetched: url };
      }
    }
  };
  return electron;
}

describe('chevron:// protocol handler', () => {
  const originalResolve = Module._resolveFilename;
  const originalAtomHome = process.env.ATOM_HOME;
  let electron;
  let AtomProtocolHandler;
  let tmp;
  let resourcePath;
  let atomHome;
  let handler;

  function write(file, text = 'x') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
  }

  function serve(url) {
    return handler({ url });
  }

  before(() => {
    electron = fakeElectron();
    require.cache[FAKE_ELECTRON] = {
      id: FAKE_ELECTRON,
      filename: FAKE_ELECTRON,
      loaded: true,
      exports: electron
    };
    Module._resolveFilename = function(request, ...rest) {
      if (request === 'electron') return FAKE_ELECTRON;
      return originalResolve.call(this, request, ...rest);
    };

    tmp = makeTempDir('chevron-protocol-');
    resourcePath = path.join(tmp, 'app');
    atomHome = path.join(tmp, 'home');
    process.env.ATOM_HOME = atomHome;

    const modulePath = path.join(
      ROOT,
      'src',
      'main-process',
      'atom-protocol-handler.js'
    );
    delete require.cache[modulePath];
    AtomProtocolHandler = require(modulePath);
    new AtomProtocolHandler(resourcePath, false);
    handler = electron.handled[0] && electron.handled[0].handler;
  });

  after(() => {
    Module._resolveFilename = originalResolve;
    delete require.cache[FAKE_ELECTRON];
    if (originalAtomHome === undefined) delete process.env.ATOM_HOME;
    else process.env.ATOM_HOME = originalAtomHome;
    removeTempDir(tmp);
  });

  it('registers chevron through protocol.handle even when registerFileProtocol exists', () => {
    assert.deepEqual(electron.handled.map(h => h.scheme), ['chevron']);
    assert.deepEqual(electron.fileProtocols, []);
  });

  it('serves a bundled package file as a file: URL', () => {
    const file = write(
      path.join(resourcePath, 'node_modules', 'image-view', 'images', 'bg.png')
    );
    const response = serve('chevron://image-view/images/bg.png?cache=1#x');
    assert.equal(response.fetched, require('url').pathToFileURL(file).href);
  });

  it('serves $ATOM_HOME/assets', () => {
    const file = write(path.join(atomHome, 'assets', 'logo.svg'));
    const response = serve('chevron://assets/logo.svg');
    assert.equal(response.fetched, require('url').pathToFileURL(file).href);
  });

  it('decodes percent-encoded names', () => {
    const file = write(
      path.join(atomHome, 'packages', 'my-theme', 'styles', 'two words.less')
    );
    const response = serve('chevron://my-theme/styles/two%20words.less');
    assert.equal(response.fetched, require('url').pathToFileURL(file).href);
  });

  it('answers 404 without fetching for missing files and escapes', () => {
    write(path.join(tmp, 'secret.txt'));
    const before = electron.fetched.length;
    for (const url of [
      'chevron://image-view/images/missing.png',
      'chevron://../secret.txt',
      'chevron://image-view/%2e%2e/%2e%2e/%2e%2e/secret.txt',
      'chevron://image-view/..%2f..%2f..%2fsecret.txt',
      'chevron://assets/%2e%2e/%2e%2e/secret.txt',
      'chevron://image-view/images/bg.png%00.txt',
      'chevron://image-view/images'
    ]) {
      const response = serve(url);
      assert.ok(response instanceof Response, url);
      assert.equal(response.status, 404, url);
    }
    assert.equal(electron.fetched.length, before);
  });

  it('keeps a lone % as a literal character', () => {
    const file = write(path.join(atomHome, 'packages', 'pkg', '100%.txt'));
    const response = serve('chevron://pkg/100%.txt');
    assert.equal(response.fetched, require('url').pathToFileURL(file).href);
  });

  it('decodes the escapes beside a literal %', () => {
    const file = write(path.join(atomHome, 'packages', 'pkg', '50% off x.png'));
    const response = serve('chevron://pkg/50% off%20x.png');
    assert.equal(response.fetched, require('url').pathToFileURL(file).href);
  });

  it('decodes multi-byte UTF-8 and keeps invalid escapes literal', () => {
    const accented = write(path.join(atomHome, 'packages', 'pkg', 'café.png'));
    assert.equal(
      serve('chevron://pkg/caf%C3%A9.png').fetched,
      require('url').pathToFileURL(accented).href
    );
    const invalid = write(
      path.join(atomHome, 'packages', 'pkg', 'a%FFb%C3 c.png')
    );
    assert.equal(
      serve('chevron://pkg/a%FFb%C3%20c.png').fetched,
      require('url').pathToFileURL(invalid).href
    );
  });

  it('answers 404 for a symlink that leaves its package or the assets root', () => {
    const secret = write(path.join(tmp, 'outside', 'secret.txt'));
    const pkg = path.join(atomHome, 'packages', 'linky');
    fs.mkdirSync(pkg, { recursive: true });
    fs.symlinkSync(secret, path.join(pkg, 'secret.txt'));
    fs.symlinkSync(path.dirname(secret), path.join(pkg, 'outside'));
    fs.mkdirSync(path.join(atomHome, 'assets'), { recursive: true });
    fs.symlinkSync(secret, path.join(atomHome, 'assets', 'secret.txt'));

    const before = electron.fetched.length;
    for (const url of [
      'chevron://linky/secret.txt',
      'chevron://linky/outside/secret.txt',
      'chevron://assets/secret.txt'
    ]) {
      assert.equal(serve(url).status, 404, url);
    }
    assert.equal(electron.fetched.length, before);
  });

  it('serves a package that is itself a symlink, as cpm link installs it', () => {
    const source = path.join(tmp, 'src', 'linked-theme');
    write(path.join(source, 'styles', 'index.less'));
    fs.mkdirSync(path.join(atomHome, 'packages'), { recursive: true });
    fs.symlinkSync(source, path.join(atomHome, 'packages', 'linked-theme'));
    const response = serve('chevron://linked-theme/styles/index.less');
    assert.equal(
      response.fetched,
      require('url').pathToFileURL(
        path.join(atomHome, 'packages', 'linked-theme', 'styles', 'index.less')
      ).href
    );
  });
});

describe('the editor page CSP', () => {
  it('allows chevron: and not the atom: scheme Wave 4 removed', () => {
    const html = fs.readFileSync(
      path.join(ROOT, 'static', 'index.html'),
      'utf8'
    );
    const csp = html.match(
      /http-equiv="Content-Security-Policy" content="([^"]+)"/
    )[1];
    assert.doesNotMatch(csp, /\batom:/);
    assert.match(csp, /default-src 'self' chevron:/);
  });
});
