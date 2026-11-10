'use strict';

/**
 * Fatal errors in a shipped package must open a Chevron issue. The github
 * package's repository field still points at builtbygio/github, and the
 * Create issue button was following that.
 *
 * Run: node --test script/ci/bundled-issue-repo.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const typescript = require(path.join(ROOT, 'src', 'typescript'));

const packages = {};
const chevronStub = {
  packages: {
    getLoadedPackage(name) {
      return packages[name] || null;
    },
    resolvePackagePath() {
      return null;
    }
  },
  BufferedProcess: class BufferedProcess {}
};
global.chevron = chevronStub;

function loadTs(relative) {
  const file = path.join(ROOT, relative);
  const compiled = typescript.compile(fs.readFileSync(file, 'utf8'), file);
  const module = { exports: {} };
  const localRequire = id => {
    if (id === 'chevron') return chevronStub;
    if (id.startsWith('.')) {
      const base = path.resolve(path.dirname(file), id);
      if (fs.existsSync(base + '.ts')) return loadTs(path.relative(ROOT, base + '.ts'));
      return require(base);
    }
    return require(id);
  };
  new Function('module', 'exports', 'require', compiled)(module, module.exports, localRequire);
  return module.exports;
}

const NotificationIssue = loadTs('packages/notifications/lib/notification-issue.ts');

function issueFor(packageName) {
  return new NotificationIssue({
    getMessage() {
      return 'boom';
    },
    getOptions() {
      return { packageName };
    }
  });
}

describe('Create issue for a shipped package', () => {
  it('opens builtbygio/chevron when the package is bundled', () => {
    packages.github = {
      bundledPackage: true,
      metadata: { repository: 'https://github.com/builtbygio/github', version: '0.37.13' }
    };
    assert.equal(issueFor('github').getRepoUrl(), 'https://github.com/builtbygio/chevron');
  });

  it('keeps a community package on its own repository', () => {
    packages.leftpad = {
      bundledPackage: false,
      metadata: { repository: { url: 'git+https://github.com/someone/leftpad.git' } }
    };
    assert.equal(issueFor('leftpad').getRepoUrl(), 'https://github.com/someone/leftpad');
  });

  it('labels the button for Chevron when the throwing package is bundled', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'packages', 'notifications', 'lib', 'notification-element.ts'),
      'utf8'
    );
    const fatal = source.slice(
      source.indexOf('renderFatalError()'),
      source.indexOf('makeDismissable()')
    );
    assert.match(fatal, /bundledPackage/);
    assert.match(fatal, /Create issue on builtbygio\/chevron/);
    assert.match(fatal, /!bundled/);
  });
});
