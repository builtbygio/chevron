'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const { fork } = require('child_process');
const fs = require('fs');
const path = require('path');
const { makeTempDir } = require('../lib/temp-dir');

const { rowForY, viewportBox, sampleStep, minimapScale, scopeColor } = require('../../packages/minimap/lib/layout');
const { scrub, buildBundle, serializeBundle, parseBundle } = require('../../packages/settings-sync/lib/bundle');
const { parseRemote } = require('../../packages/remote-edit/lib/remote-spec');
const { validateRemote, scpSpec } = require('../../src/main-process/ssh-policy');
const { validateProgram, validateBreakpoints } = require('../../src/main-process/debug-policy');
const { DebugClient } = require('../../src/main-process/debug-client');

const ROOT = path.resolve(__dirname, '..', '..');
const ADAPTER = path.join(ROOT, 'src', 'main-process', 'workers', 'node-debug-adapter.js');

describe('minimap layout', () => {
  it('maps a click to a buffer row', () => {
    assert.strictEqual(rowForY(0, 100, 10), 0);
    assert.strictEqual(rowForY(50, 100, 10), 5);
    assert.strictEqual(rowForY(99, 100, 10), 9);
    assert.strictEqual(rowForY(200, 100, 10), 9);
  });

  it('draws the viewport as the same fraction of the file', () => {
    const box = viewportBox({
      scrollTop: 100,
      viewHeight: 50,
      contentHeight: 200,
      minimapHeight: 100
    });
    assert.strictEqual(box.top, 50);
    assert.strictEqual(box.height, 25);
  });

  it('samples long files', () => {
    assert.strictEqual(sampleStep(100, 4000), 1);
    assert.strictEqual(sampleStep(8000, 4000), 2);
  });

  it('keeps a short file at a fixed line size', () => {
    const scale = minimapScale(10, 400);
    assert.strictEqual(scale.lineHeight, 3);
    assert.strictEqual(scale.contentHeight, 30);
  });

  it('shrinks a long file so the thumbnail fits', () => {
    const scale = minimapScale(1000, 300);
    assert.ok(scale.contentHeight <= 300);
    assert.ok(scale.lineHeight < 3);
  });

  it('paints comments and keywords in different colours', () => {
    assert.notStrictEqual(
      scopeColor(['syntax--comment']),
      scopeColor(['syntax--keyword', 'syntax--control'])
    );
  });
});

describe('settings bundle', () => {
  it('drops secrets and round-trips the rest', () => {
    const bundle = buildBundle({
      files: {
        'config.json': {
          editor: { fontSize: 16 },
          'github.token': 'secret-value',
          nested: { password: 'nope', tabLength: 2 }
        },
        'styles.less': 'body { color: red; }\n'
      },
      packages: ['hydrogen', 'hydrogen']
    });
    assert.strictEqual(bundle.files['config.json']['github.token'], undefined);
    assert.strictEqual(bundle.files['config.json'].nested.password, undefined);
    assert.strictEqual(bundle.files['config.json'].editor.fontSize, 16);
    assert.deepStrictEqual(bundle.packages, ['hydrogen']);
    const again = parseBundle(serializeBundle(bundle));
    assert.strictEqual(again.files['styles.less'], 'body { color: red; }\n');
    assert.strictEqual(scrub({ token: 'x', ok: 1 }).token, undefined);
  });

  it('rejects a bundle that is not version 1', () => {
    assert.throws(() => parseBundle('{"version":2,"files":{}}'), /version 1/);
  });
});

describe('remote paths', () => {
  it('parses user@host and an absolute path', () => {
    assert.deepStrictEqual(parseRemote('me@example.com:/src/app.js'), {
      host: 'me@example.com',
      path: '/src/app.js'
    });
  });

  it('refuses a path that could change the remote command', () => {
    assert.strictEqual(validateRemote('me@host', '/tmp/app.js').ok, true);
    assert.strictEqual(validateRemote('me@host', '/tmp/app;rm').ok, false);
    assert.strictEqual(validateRemote('me@host', 'relative.js').ok, false);
    assert.strictEqual(validateRemote('host name', '/tmp/a').ok, false);
    assert.strictEqual(scpSpec('me@host', '/tmp/a.js'), 'me@host:/tmp/a.js');
  });
});

describe('debug program policy', () => {
  it('accepts a JavaScript file inside a root and refuses the rest', () => {
    const root = makeTempDir('chevron-debug-policy-');
    const program = path.join(root, 'app.js');
    fs.writeFileSync(program, 'console.log(1)\n');
    assert.strictEqual(validateProgram(program, [root]).ok, true);
    assert.strictEqual(validateProgram(path.join(root, 'app.py'), [root]).ok, false);
    assert.strictEqual(validateProgram('/etc/passwd', [root]).ok, false);
    const points = validateBreakpoints([{ path: program, line: 1 }], [root]);
    assert.strictEqual(points.ok, true);
    assert.strictEqual(points.breakpoints[0].line, 1);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('node debug adapter', () => {
  it('stops on a breakpoint and can read a local', async () => {
    const dir = makeTempDir('chevron-dbg-');
    const program = path.join(dir, 'add.js');
    fs.writeFileSync(
      program,
      'function add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));\n'
    );
    const child = fork(ADAPTER, [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    let resolveStopped;
    const stoppedPromise = new Promise(resolve => {
      resolveStopped = resolve;
    });
    const client = new DebugClient(
      message => child.send(message),
      message => {
        if (message.event === 'stopped') resolveStopped(message);
      }
    );
    child.on('message', message => client.receive(message));
    try {
      const launched = client.launch(program, [{ path: program, line: 2 }]);
      const stopped = await Promise.race([
        stoppedPromise,
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('no breakpoint stop\n' + stderr)), 8000);
        })
      ]);
      await launched;
      assert.strictEqual(stopped.body.reason, 'breakpoint');
      const stack = await client.request('stackTrace', { threadId: 1 });
      assert.strictEqual(stack.stackFrames[0].line, 2);
      assert.strictEqual(stack.stackFrames[0].name, 'add');
      const scopes = await client.request('scopes', { frameId: 0 });
      const locals = await client.request('variables', {
        variablesReference: scopes.scopes[0].variablesReference
      });
      const names = locals.variables.map(variable => variable.name);
      assert.ok(names.includes('a'));
      assert.ok(names.includes('b'));
      await client.request('continue', { threadId: 1 });
    } finally {
      try {
        child.kill('SIGKILL');
      } catch (_) {}
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
