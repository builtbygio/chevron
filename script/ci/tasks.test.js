'use strict';

/**
 * Tasks a project declares, and what it takes to run one.
 *
 * Two things this has to get right, because a tasks file is **input from a
 * repository** rather than from the person using the editor:
 *
 *   1. A task cannot name a directory outside the project. Running somewhere
 *      else walks around the trust decision made about this folder.
 *   2. A malformed file reports what it could not use and keeps going. A
 *      tasks.json somebody is halfway through editing must not take the
 *      command palette down with it.
 *
 * That running requires trust at all is the point of the feature, and it is
 * checked at the surface (packages/terminal) as well as here.
 *
 * docs/reference/tasks.md
 * Run: node --test script/ci/tasks.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const typescript = require(path.join(ROOT, 'src', 'typescript'));

function loadTs(file) {
  const compiled = typescript.compile(fs.readFileSync(file, 'utf8'), file);
  const module = { exports: {} };
  const localRequire = id =>
    require(id.startsWith('.') ? path.resolve(path.dirname(file), id) : id);
  new Function('module', 'exports', 'require', compiled)(
    module,
    module.exports,
    localRequire
  );
  return module.exports;
}

const { parseTasks, shellInvocation } = loadTs(
  path.join(ROOT, 'src', 'tasks.ts')
);

const PROJECT = path.join(path.sep, 'repo', 'a');

describe('reading a tasks file', () => {
  it('reads the ordinary case', () => {
    const { tasks, problems } = parseTasks(
      { tasks: [{ name: 'test', command: 'npm test' }] },
      PROJECT
    );
    assert.deepStrictEqual(problems, []);
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].name, 'test');
    assert.strictEqual(tasks[0].command, 'npm test');
    assert.strictEqual(tasks[0].cwd, PROJECT, 'defaults to the project root');
    assert.strictEqual(tasks[0].root, PROJECT);
  });

  it('accepts a command line, spaces and all', () => {
    const { tasks } = parseTasks(
      { tasks: [{ name: 'ci', command: 'npm test && npm run lint' }] },
      PROJECT
    );
    assert.strictEqual(tasks[0].command, 'npm test && npm run lint');
  });

  it('takes a cwd inside the project', () => {
    const { tasks, problems } = parseTasks(
      { tasks: [{ name: 'build', command: 'make', cwd: 'packages/core' }] },
      PROJECT
    );
    assert.deepStrictEqual(problems, []);
    assert.strictEqual(tasks[0].cwd, path.join(PROJECT, 'packages', 'core'));
  });

  it('reads a JSON string as well as an object', () => {
    const { tasks } = parseTasks(
      JSON.stringify({ tasks: [{ name: 'test', command: 'npm test' }] }),
      PROJECT
    );
    assert.strictEqual(tasks.length, 1);
  });
});

describe('a task cannot point outside the project', () => {
  const escapes = [
    ['..', '..'],
    ['deeper traversal', path.join('..', '..', 'etc')],
    ['sneaky traversal', path.join('packages', '..', '..', 'elsewhere')]
  ];

  for (const [name, cwd] of escapes) {
    it(name, () => {
      const { tasks, problems } = parseTasks(
        { tasks: [{ name: 'bad', command: 'echo hi', cwd }] },
        PROJECT
      );
      assert.deepStrictEqual(tasks, [], `${cwd} should be refused`);
      assert.match(problems.join(' '), /outside the project/);
    });
  }

  it('allows a path that merely looks like it escapes and does not', () => {
    const { tasks, problems } = parseTasks(
      { tasks: [{ name: 'ok', command: 'make', cwd: path.join('a', '..', 'b') }] },
      PROJECT
    );
    assert.deepStrictEqual(problems, []);
    assert.strictEqual(tasks[0].cwd, path.join(PROJECT, 'b'));
  });
});

describe('a malformed file says what it could not use', () => {
  it('reports invalid JSON without throwing', () => {
    const { tasks, problems } = parseTasks('{ not json', PROJECT);
    assert.deepStrictEqual(tasks, []);
    assert.match(problems[0], /not valid JSON/);
  });

  it('reports a missing tasks array', () => {
    assert.match(parseTasks({}, PROJECT).problems[0], /needs a "tasks" array/);
    assert.match(parseTasks(null, PROJECT).problems[0], /needs a "tasks" array/);
    assert.match(parseTasks([], PROJECT).problems[0], /needs a "tasks" array/);
  });

  it('drops the unusable entries and keeps the rest', () => {
    const { tasks, problems } = parseTasks(
      {
        tasks: [
          { name: 'good', command: 'npm test' },
          null,
          { name: '', command: 'echo' },
          { name: 'no-command' },
          { command: 'no-name' },
          { name: 'also-good', command: 'make' }
        ]
      },
      PROJECT
    );
    assert.deepStrictEqual(tasks.map(t => t.name), ['good', 'also-good']);
    assert.strictEqual(problems.length, 4);
  });

  it('refuses a duplicate name rather than guessing which was meant', () => {
    const { tasks, problems } = parseTasks(
      {
        tasks: [
          { name: 'test', command: 'npm test' },
          { name: 'test', command: 'rm -rf /' }
        ]
      },
      PROJECT
    );
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].command, 'npm test', 'the first one stands');
    assert.match(problems.join(' '), /more than once/);
  });

  it('refuses a NUL, which truncates a string somewhere below this', () => {
    const { tasks } = parseTasks(
      { tasks: [{ name: 'bad', command: 'echo hi\u0000rm -rf /' }] },
      PROJECT
    );
    assert.deepStrictEqual(tasks, []);
  });
});

describe('running a command line through a shell', () => {
  it('uses -lc on posix, so PATH and aliases are what the user has', () => {
    const { shell, args } = shellInvocation('npm test', '/bin/bash', 'linux');
    assert.strictEqual(shell, '/bin/bash');
    assert.deepStrictEqual(args, ['-lc', 'npm test']);
  });

  it('uses cmd.exe switches on Windows', () => {
    const { args } = shellInvocation(
      'npm test',
      'C:\\Windows\\System32\\cmd.exe',
      'win32'
    );
    assert.deepStrictEqual(args, ['/d', '/s', '/c', 'npm test']);
  });

  it('does not split the command into words', () => {
    // `npm test && npm run lint` has to mean what it says, which is why the
    // command line is handed to a shell rather than parsed here.
    const { args } = shellInvocation('a && b || c', '/bin/sh', 'linux');
    assert.strictEqual(args[1], 'a && b || c');
  });
});

describe('the surface refuses to run in an untrusted project', () => {
  it('checks trust before spawning', () => {
    // The gate itself lives where the spawning happens; this pins that it is
    // there, because a task runner that skips it turns opening a cloned
    // repository into running its code.
    const source = fs.readFileSync(
      path.join(ROOT, 'packages', 'terminal', 'lib', 'tasks.js'),
      'utf8'
    );
    assert.match(source, /is-trusted/, 'asks main whether the root is trusted');
    assert.match(
      source,
      /trusted[\s\S]{0,400}return/,
      'and returns without spawning when it is not'
    );
  });
});
